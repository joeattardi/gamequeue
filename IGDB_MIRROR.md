# Plan: mirror IGDB locally and stay current with webhooks

Status: **superseded in part, step 1 built (2026-10-24).** Written 2026-10-21 against the code as it is today. The owner has since been added to IGDB's data partner program, which changed the approach:

- **Data dumps instead of paging.** Daily CSV dumps (`GET /v4/dumps`) replace the paged initial load and the catch-up job. The daily rebuild is the only update path.
- **No webhooks for now** (decided by the owner). Everything about the receiver, inbox, registration and CSRF exemption below is deferred; the dump rebuild repairs anything missed.
- **A separate `igdb.db`** (open question 1 answered: two files). The user database keeps its own `games` rows as a per-app cache; the mirror is a rebuildable, un-backed-up lookup source, replaced atomically.
- **Spike done:** the live dumps total 1.33 GB of CSV across 80 endpoints; the 10 we use are about 740 MB. The built mirror is 241 MB with screenshots (383,734 games, 338,811 searchable), builds in about 47 s on a Mac, and matched live `fetchGame` on every field for 8 spot-checked games.

Built so far: step 1 (`apps/server/src/mirror/`, `npm run igdb:mirror`) and step 2 (the lookup behind `IgdbClient`, `createMirrorIgdbClient`, with popularity-ranked search over names and alternative names and live IGDB as the fallback), both described in `ARCHITECTURE.md`. Not built: switching the features over (dropping the lazy refresh jobs, reading the mirror directly), the cron job, the admin tile and `DEPLOYMENT.md`. The text below is the original proposal and is kept for its reasoning.

## Why

All IGDB access goes through one process-wide `RequestLimiter` (4 req/s, 8 in flight; `apps/server/src/igdb/limiter.ts`). Today's traffic is tiny, but every user shares that one budget, and the expensive callers scale with users, not with games:

| Caller                                             | IGDB cost today                                            | Scales with                 |
| -------------------------------------------------- | ---------------------------------------------------------- | --------------------------- |
| `GET /api/igdb/search`                             | 1 request per distinct query (5 min in-memory `TtlCache`)  | users typing: the main risk |
| `ensureGame` (add, view game, import commit)       | 1 multiquery per never-seen game                           | new games                   |
| `refreshWishlistReleases`                          | 1 request per ≤100 unreleased games, per wishlist load/day | users with wishlists        |
| `backfillSeries`, `ensureScreenshots`, series page | occasional                                                 | cache misses                |

Search is the one that matters: it is interactive, bursty, and uncacheable across different queries. With a local copy of IGDB, search, add-game and game pages make **zero** IGDB calls, and the limiter only guards the sync jobs.

## What IGDB gives us (verify before building)

Items marked **(verify)** come from secondary sources or memory; `api-docs.igdb.com` returned 403 to my fetch tool, so read the live docs first.

- **Bulk read by paging.** The IGDB bot on the Twitch forum recommends "page through our data, 500 records at a time" and then "use IGDB webhooks to stay up to date" ([thread](https://discuss.dev.twitch.com/t/igdb-store-all-games-in-local-database/47241)). Max `limit` is 500, with `offset`.
- **Webhooks** are registered per endpoint with a `method` of create, update or delete. They send the record, not a diff. **(verify)** Registration is `POST https://api.igdb.com/v4/<endpoint>/webhooks` with form fields `url`, `method`, `secret`; deliveries carry the secret in an `X-Secret` header; the payload is the bare object (references are ids, not expanded the way our `cover.image_id` queries are); registered per Twitch client, with a cap on how many; delivery retry behaviour is unknown.
- **Data dumps** (daily CSVs per endpoint) **(verify)**: I couldn't confirm whether they are open to everyone or partners only. If open, use them for the initial load instead of paging. The plan below does not depend on them.
- **Terms.** One aggregator says commercial API use needs an IGDB partnership. GameQueue is a personal/friends app, so this is fine today; **re-read the terms before opening signups publicly** (the `SIGNUPS_ENABLED` switch is the relevant gate). **(verify)**
- **Deletions are the weak spot.** The forum thread notes deletes complicate resuming a paged dump. The delete webhook plus a periodic reconcile (below) covers it.

## Decision: reuse the existing tables as the mirror

Entries, wishlist items and everything user-facing reference `games.id` (= IGDB id), and `loadGames` hydrates `GameDto`s from `games`, `game_platforms`, `game_genres`, `game_themes`, `game_series`. Keeping those tables as the single source means **no read path changes**: collection, backlog, stats, pick, smart lists, export all keep working as is. The sync becomes a new _writer_ of the same tables.

Consequences to handle:

1. `saveGame` uses `onConflictDoNothing` for `games` ("cached metadata is never re-fetched"). The sync needs an upsert variant (`upsertGame`) that overwrites. This also closes the known limitation in `CLAUDE.md` (import seeding the shared cache with user-supplied metadata): a mirrored row is authoritative and gets overwritten on the next IGDB update.
2. `purgeUnusedGames` (admin housekeeping) would delete the mirror. It must be removed or made a no-op once the mirror is on, and the admin "cached games" stats reworded ("mirrored games", "in use").
3. Per-row bookkeeping columns change meaning: `fetched_at` becomes "last synced from IGDB"; `release_checked_at`, `series_checked_at` and `screenshots` NULL-means-never-asked go away or become irrelevant once the mirror carries those fields (see Phase 3). Keep the columns until then so migrations stay additive.
4. Games IGDB deletes: keep the row if any entry/wishlist item references it (FKs have no cascade), mark it `igdb_deleted_at`, and let the UI keep showing the cached data. Delete it otherwise.

Alternative considered: separate `igdb_*` mirror tables and keep `games` as a per-app cache filled from the mirror. It isolates the sync but duplicates every field and needs a second mapper and a copy step on add. Rejected as more code for no read-path benefit.

## Size and the Pi

IGDB has on the order of a few hundred thousand games **(verify the current count with `POST /v4/games/count`)**. At roughly 0.5–1 KB per game plus join rows, expect a few hundred MB of SQLite, plus the search index. That affects:

- **Backups:** `scripts/backup.sh` snapshots the whole DB nightly and uploads off-site. The mirror is re-derivable, so it should **not** be backed up. Cleanest fix: put the mirror in a **separate SQLite file** (`igdb.db`, attached or opened as a second connection) and exclude it from the backup. This also keeps user data restores fast and the main DB small. Cross-DB FKs aren't enforceable, so the user DB would keep a thin `games` row (id, name, cover, …) per game in use and the mirror would be the lookup source. **This changes the "reuse the tables" decision above**: decide before Phase 1, see Open questions.
- **Disk:** the admin Server tile already warns under 1 GB free; add the mirror size to the Database stats page.
- **Initial load time:** ~600–1,000 paged requests for games at 4 req/s is minutes, not hours; the extra endpoints (below) add a few thousand. Run it as a background job, resumable.

## Data to mirror

Match what `GAME_FIELDS`, `DETAIL_FIELDS` and the mappers use today, so `GameRecord` is unchanged:

| IGDB endpoint                   | Used for                                                                                             | Local table(s)                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `games`                         | name, slug, summary, dates, rating, type, cover id, platform/genre/theme/collection ids, screenshots | `games`, `game_*` joins                                         |
| `covers`, `screenshots`         | `image_id` only (images stay on IGDB's CDN, as now)                                                  | columns on `games` (cover) / JSON (screenshots)                 |
| `platforms`, `genres`, `themes` | name lists                                                                                           | existing tables (full sync replaces `listPlatforms`' lazy sync) |
| `game_time_to_beats`            | time to beat                                                                                         | `ttb_*` columns                                                 |
| `release_dates`                 | per-platform date + `date_format` for precision                                                      | derived into `release_date` / `release_precision`               |
| `collections`                   | series                                                                                               | `series`, `game_series`                                         |
| `game_types`                    | the add-on filter                                                                                    | in-code `EXCLUDED_TYPES` stays; store `game_type` name          |

Only mirror what we use. Skip artworks, videos, websites, companies, etc. until a feature needs them.

Filter at ingest, not at read: skip rows with `version_parent` set (editions) and add-on types (`EXCLUDED_TYPES`), exactly the rules search applies now. Re-check live data before excluding anything (see the `CLAUDE.md` note on game types).

## New components

```
apps/server/src/igdb/
  client.ts          + paged fetch helpers (fetchPage(endpoint, fields, afterId), fetchChanged(since))
  webhooks.ts        register / list / delete webhooks via the IGDB API
apps/server/src/services/
  igdb-sync.ts       initial load, incremental catch-up, reconcile, apply(record)
  igdb-search.ts     local search over the mirror (FTS5)
apps/server/src/routes/
  igdb-webhook.ts    POST /api/igdb/webhook/:endpoint  (public, secret-checked)
```

### Webhook receiver

- **Reachable already:** the Cloudflare Tunnel (`DEPLOYMENT.md`) exposes `https://gamequeue.app`, so IGDB can call `https://gamequeue.app/api/igdb/webhook/games`. No new infrastructure.
- **Mount** it under its own prefix (per the "never a `use('*', requireAuth)` at `/api`" rule), unauthenticated by session but gated by the shared secret. Compare `X-Secret` with `timingSafeEqual`. Reject anything else with 401 and no detail.
- **CSRF:** `app.ts` rejects mutations with a disallowed `Origin` and non-JSON `Content-Type`. IGDB sends neither a browser `Origin` nor, probably, the right type, so this route needs an explicit exemption placed _before_ that check, limited to this one path. Test it.
- **Respond fast, work later.** Insert the payload into a small `igdb_inbox` table (endpoint, method, record id, JSON, received_at) and return 200; a worker drains it. This survives restarts and absorbs bursts (IGDB can send many updates at once), and the handler never touches the limiter.
- **Apply** = map the raw record with the existing mappers, `upsertGame`, replace its join rows, in one transaction. Idempotent and last-write-wins by IGDB `updated_at` so out-of-order or duplicate deliveries are harmless.
- **Expansion gap:** webhook payloads carry ids for references (cover, platforms, genres…). Resolve them from the local mirrored tables (`covers` → `image_id` needs the covers mirror, or one batched `/multiquery` for the changed ids). Prefer: on any `games` webhook, enqueue a refetch of that id and let the worker batch up to 100 ids per request. That keeps mapping code identical to `fetchGame` and costs ~1 request per 100 changes.
- **Config:** `IGDB_WEBHOOK_SECRET` (env, required to enable), plus `IGDB_MIRROR=true` to turn the whole feature on, so dev and tests can run without it.

### Sync jobs (`igdb-sync.ts`)

1. **Initial load.** Page `games` by `where id > <cursor> & <filters>; sort id asc; limit 500;` (keyset on id, not `offset`; the forum thread flags offset stability as an open question). Persist the cursor in `settings` so the job resumes after a restart. Then the small tables (platforms, genres, themes, collections), then time-to-beats. Triggered from the admin page ("Start initial sync"), progress shown there.
2. **Catch-up.** On startup and daily: `where updated_at > <last_sync>` in the same paged form, which repairs anything missed while the Pi was offline (a home Pi _will_ miss webhooks; IGDB's retry behaviour is unknown). This is the safety net, so the app is correct even if webhooks silently stop.
3. **Reconcile deletions.** Weekly: page ids only (`fields id`), diff against local, handle IGDB-deleted rows per rule 4 above. Cheap (one field).
4. **Webhook registration.** On startup, if the mirror and secret are configured, list existing webhooks and register any missing (`games` create/update/delete; the others as needed). Admin page shows registered/not, last delivery time.

All jobs go through the existing `RequestLimiter`, so they can't starve interactive fallback calls. Give interactive calls priority (small change in `limiter.ts`) if the initial load is running while users search.

### Local search (replaces `igdb.search`)

This is the part with real product risk. IGDB's `search` is relevance-ranked, typo-tolerant and alias-aware; SQLite `LIKE` is not.

- Add an **FTS5** virtual table over `games.name` (plus alternative names later), `tokenize = 'unicode61 remove_diacritics 2'`, with prefix indexes (`prefix='2 3 4'`) for type-ahead. Keep it in sync via triggers or in `upsertGame`.
- Rank with `bm25()` then tie-break by `igdb_rating_count` (popularity), so "zelda" shows Breath of the Wild before obscure fan games.
- Keep `where version_parent = null` and the add-on filter at ingest.
- Fallback: if local results are empty and IGDB is configured, call `igdb.search` as today. That makes the migration low-risk and handles games newer than the last sync.
- `SearchResultDto` fields (`year`, `coverImageId`, `igdbRating`, platforms) are all in `games`; no web change.
- Prototype early (Phase 1) against 20 real queries the owner cares about ("witcher 3", "hades", "kingdom hearts", "zelda totk", misspellings) and compare with IGDB's results before committing to dropping the live search.

## Code that changes

| File                                                                             | Change                                                                                                                                 |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `services/games.ts` `ensureGame`                                                 | look in the mirror first, IGDB only on a miss (then `saveGame` as now)                                                                 |
| `services/games.ts` `refreshReleaseDates`, `backfillSeries`, `ensureScreenshots` | no-ops when the mirror is on (the data is already current); removed in Phase 4                                                         |
| `services/games.ts` `listPlatforms`                                              | read the mirrored table; drop the `count < 50` lazy sync                                                                               |
| `routes/igdb.ts` `/search`                                                       | local FTS first; drop the `TtlCache` for local hits                                                                                    |
| `services/series.ts`                                                             | series members from `game_series` instead of `fetchSeries`/`series_members` (a week-old cache today)                                   |
| `services/maintenance.ts` `purgeUnusedGames`                                     | disable with the mirror                                                                                                                |
| `services/import.ts`                                                             | stop writing user-supplied metadata into `games` when the game is mirrored (mirror wins)                                               |
| `services/database-stats.ts`, admin pages                                        | mirror size, last sync, inbox backlog, webhook state; reword "cached games"                                                            |
| `app.ts`                                                                         | webhook route + CSRF exemption                                                                                                         |
| `index.ts`                                                                       | start the worker, catch-up and webhook registration                                                                                    |
| `igdb/types.ts` `IgdbClient`                                                     | add paged-fetch methods; the existing ones stay as the fallback                                                                        |
| `db/schema.ts` + migration                                                       | `igdb_inbox`, FTS5 table (hand-written SQL; drizzle-kit doesn't generate virtual tables), `igdb_deleted_at`, sync cursor in `settings` |
| `ARCHITECTURE.md`, `CLAUDE.md`, `DEPLOYMENT.md`                                  | document the sync, webhook route, new env vars, backup exclusion                                                                       |

The wishlist release-date refresh (`refreshWishlistReleases`) and the "unreleased games re-read daily" logic disappear into ordinary webhook updates, which is the user-visible win besides rate limits: **dates, ratings and time-to-beat stay current for every game**, not just wishlisted ones.

## Phases

Each phase ships on its own and leaves the app working, matching the one-milestone-at-a-time workflow.

1. **Spike, no behaviour change.** Read the live docs; confirm webhook shape/caps/retries, dump availability, game count. Script (outside the repo) that pages ~10k games into a scratch SQLite with FTS5 and compares search results with IGDB's for a list of queries. Measure DB size per game. _Exit criteria: search quality is acceptable, size per game known, decision on one-DB vs separate-DB made._
2. **Mirror + initial load + catch-up.** Schema/migration, `upsertGame`, sync service, admin trigger and progress. `ensureGame` reads the mirror first. Search still live. Tests with the fake IGDB (paging, cursor resume, filters, upsert overwrite, deleted-but-referenced rows).
3. **Webhooks.** Receiver, inbox, worker, registration, CSRF exemption, admin status. Test: bad secret, duplicate and out-of-order deliveries, burst, restart mid-drain. Retire the release-date refresh, series backfill and screenshot lazy-fetch.
4. **Local search.** FTS5 search with IGDB fallback; then, once happy, search no longer calls IGDB at all in the normal path. Drop `TtlCache` for local hits.
5. **Cleanup.** Remove dead lazy-cache paths, disable `purgeUnusedGames`, update docs and the backup script exclusion, add the reconcile job.

## Risks

- **Search quality regression** (biggest). Mitigated by the Phase 1 comparison and the IGDB fallback.
- **Webhooks silently stop** (Pi offline, tunnel down, IGDB drops a failing endpoint). Mitigated by the daily catch-up and an admin "last webhook received" indicator that turns amber when stale.
- **Storage and backup growth on the Pi.** Mitigated by a separate, un-backed-up mirror file and the disk warnings that exist.
- **IGDB terms / partnership** if the app ever goes beyond friends. Check before opening signups.
- **Webhook endpoint is public.** Secret check, constant-time compare, tiny body limit, and no processing in the request path.
- **Schema drift.** IGDB adds fields and game types over time; the paged fetch should request an explicit field list (as now), never `fields *`.

## Open questions for the owner

1. **One database or two?** A separate `igdb.db` keeps backups small and the mirror disposable, but means the user DB needs its own slim `games` rows (a copy-on-add step) because SQLite can't enforce FKs across files. One database is simpler, bigger to back up. Tables can't be excluded from a file-level backup, so the choice is really "back up the mirror too" or "two files". Recommendation: decide after Phase 1 measures the real size; lean towards two files unless the mirror turns out small (tens of MB).
2. **Keep the live IGDB fallback forever?** Recommendation: yes, for misses only. It costs nothing at steady state and covers games newer than the last sync.
3. **Do we want the whole catalogue, or only games that rank above some popularity floor?** A floor (e.g. `total_rating_count > 0` or a `game_type` allow-list) could cut size by well over half, at the cost of obscure games needing the fallback.
