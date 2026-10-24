# IGDB mirror

Status: **built** (branch `igdb-mirror`, 2026-10-24). A local copy of the IGDB data the app uses, rebuilt daily from IGDB's partner data dumps, answers search, game pages, series, similar games and release dates without calling IGDB. Live IGDB stays as the fallback. How it works is in `ARCHITECTURE.md` (IGDB communication), the plain-language tour in `OVERVIEW.md` (section 7), and setup and operations in `DEPLOYMENT.md` (IGDB mirror). This file keeps the reasoning and what is still open.

## Why

All IGDB access goes through one process-wide `RequestLimiter` (4 requests/s, 8 in flight; `apps/server/src/igdb/limiter.ts`). Traffic was tiny, but every user shares that budget and the expensive callers scale with users: search (one request per distinct query), `ensureGame` (one multiquery per never-seen game), the wishlist release refresh, the series backfill and screenshots. With a local copy, those make no IGDB calls at all, and a 429 can't break search any more.

The side benefit: ratings, time to beat, release dates and series stay current for every cached game, not just unreleased wishlisted ones.

## Decisions

| Decision                                                    | Why                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data dumps (`GET /v4/dumps`), not paging the API            | The owner joined IGDB's data partner program. A full rebuild takes about 50 s and one download per endpoint, with no cursor, resume or deletion-reconcile logic.                                                                                            |
| Daily rebuild only; **no webhooks**                         | A personal collection tracker doesn't need sub-day freshness, and webhooks add a public endpoint, a secret, ordering problems and a repair path anyway. Decided by the owner.                                                                               |
| A separate `igdb.db`, replaced atomically                   | It is rebuildable, so it stays out of backups and out of the user database's write path. SQLite can't enforce foreign keys across files, so the user database keeps its own `games` cache rows (below).                                                     |
| The `games` cache table stays; the mirror refreshes it      | Entries, wishlist items, grids and tier lists reference `games(id)`, and collection filters, stats and smart lists join against it. The mirror must also stay optional (fresh clones, a failed build, games newer than the dump).                           |
| Live IGDB stays as the fallback, and the old lazy jobs stay | A game newer than the last dump, a search with no local hit (typos) or a missing file all fall through to the live client. The release refresh, series backfill and screenshot fetch read through the same client, so they cost nothing for mirrored games. |
| Postgres was considered and rejected                        | The mirror is about 250 MB, written once a day by one process and read by one server. SQLite and FTS5 fit; Postgres would add a second always-running service on a Pi.                                                                                      |
| Every game kept, with a `searchable` flag                   | A user may own an edition or add-on and game pages look up by id. Only searchable games (no edition, no add-on type) are in the name index and similar-games lists.                                                                                         |

## What was built

1. **Importer** (`apps/server/src/mirror/`): streams each dump CSV through `csv-parse` straight into SQLite (nothing is written to disk first), reuses the live mapper's release-precision and add-on rules so both sources agree, builds `igdb.db.new`, verifies it and renames it into place. 383,734 games, 338,811 searchable, 251 MB, about 50 s on a Mac.
2. **Lookup** (`createMirrorIgdbClient`): an `IgdbClient` that answers from the file and asks the live client only for what is missing. The file is re-checked every 5 s, so a rebuild needs no restart. Search is FTS5 over names and alternative names ("ff7", "bg3"), ranked by rating count scaled by match quality, with Roman-numeral and apostrophe handling. IGDB's own ranking was not the target: it puts "Cyberpunk Sex" before Cyberpunk 2077.
3. **Cache sync** (`services/mirror-sync.ts`): every cached game, the platform list and cached series pages are overwritten from the mirror when a new dump appears and right after an import (so the mirror's metadata wins over a file's).
4. **Operations**: `scripts/mirror.sh` from host cron at 06:30 UTC in a throw-away container, `mirror-status.json`, a 1 GiB free-space check, a healthchecks.io ping, a failed run in the error log, and **Admin > IGDB mirror**.

## Measured

- A full build on a Raspberry Pi (8 GB, microSD): 154.7 s, about three times the Mac's 48 s; the slow part there is the card.
- The live dumps are 1.33 GB of CSV across 80 endpoints; the 11 used are about 700 MB. An import peaks at about 570 MB of disk (the new file, a scratch database, and the 250 MB file being replaced).
- Parity with live IGDB on 14 games, 2 series pages, 2 similar-games lists and release dates: identical except ratings drifting by one (the dump is hours old).
- Warm searches take 1-80 ms; the first query after a restart touches the index cold and can take about 1.5 s.
- A sync of 216 cached games and 4 series pages took about 0.3 s on a copy of the dev database.

## Known differences from live IGDB

- Platforms come back in id order, not IGDB's order.
- A game whose only release date is TBD has no year in search results.
- Ratings, dates and similar lists are as of the last dump (up to a day old, plus the 10-minute sync tick).
- A typo ("witcer 3") finds nothing locally and goes to live IGDB; abbreviations and numerals work locally.

## Not verified

- **The first Pi run's original error.** The first run on a Raspberry Pi (microSD, 8 GB) got through 8 of 11 dumps in about 90 s and then failed in `release_dates`. Its real error was hidden by a failing `ROLLBACK`, and the build's journal and fsync settings had not taken effect (a 1 MB dump took 16 s). Both were fixed (`configureForBulkLoad`, best-effort rollback) and the next run succeeded in 154.7 s, but the original error was never seen, so its cause is a hypothesis (fsync stalls or an I/O error on the SD card), not a finding. If a run fails again, the status file and `mirror.log` now name the real error.
- The cron line and a scheduled run (the first one by hand worked, in the real container, as the `node` user on the bind mount).
- A failed download is not retried until the next day's run. Running `mirror.sh` hourly would self-heal at about a second per run.

## Open items and ideas

- **Terms.** Dump access comes with IGDB's data partner agreement. Re-read the terms before opening signups beyond friends (the `SIGNUPS_ENABLED` switch is the gate).
- **Games deleted from IGDB.** A cached row the mirror no longer has is simply left as it was; nothing marks it deleted.
- **Ranking.** IGDB's `popularity_primitives` dump (77 MB) could replace the rating count as the popularity signal. Typo tolerance beyond the live fallback would need a trigram-style index.
- **Webhooks**, if freshness ever matters: register per endpoint and method (`POST /v4/<endpoint>/webhooks`, form fields `url`, `method`, `secret`), check the `X-Secret` header with a constant-time compare, answer 200 at once and apply the record from a small inbox table, last write wins by `updated_at`; this route would need a CSRF exemption placed before the Origin check in `app.ts`. These details come from IGDB's public docs and forum, not from the partner docs (which were not readable while planning), so verify them first. The daily rebuild would remain the repair path for anything missed.
