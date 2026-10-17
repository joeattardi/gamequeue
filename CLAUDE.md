# GameQueue: working notes

Personal video game collection and "what do I play next" manager. npm workspaces monorepo:
`apps/web` (React + Vite + TanStack Query), `apps/server` (Hono + Drizzle + SQLite), `packages/shared` (Zod schemas/types, consumed as TS source).
Full design (data model, API surface, rationale): `/Users/joe/.claude/plans/floating-exploring-brook.md` (outside the repo; if missing, the sections below plus the code are the source of truth).

## How we work

- Build one milestone at a time. After each: run `npm run typecheck` and `npm test`, make a git commit, give a 3-5 line summary and what to try manually. **Don't start the next milestone until the user says so.**
- If a requirement is ambiguous or needs a product decision, ask instead of guessing. Technical choices inside the stack are mine to make; mention the notable ones.
- Code style is enforced by Prettier (`.prettierrc.json`: 4 spaces, single quotes, semicolons, no trailing commas, width 100). Run `npm run format` before committing; `npm run format:check` verifies.
- Commit message footer: follow the attribution line given by the session's system reminder.

## Status

- M0 scaffold, DB + migrations, auth: **done**
- M1 IGDB integration + collection, backlog view: **done**
- M2 status + playthroughs: **done**
- M3 slots, lists/queue, random pick (completes v1): **done**
- M4 export/import: **done** (merge, not replace). v1 is complete.
- M5 (post-v1) smart lists, stats, CSV export of lists: next, when the user asks

Verified against live IGDB (Oct 2026, via a script using `apps/server/.env`): token flow, search, and the game + time-to-beat multiquery. Not verified by Claude: the web UI in a browser (no browser tool in sessions so far). Tests use a fake IGDB client / fake fetch.

## Product decisions (confirmed by the user)

- **Slots:** assigning a game sets it to `playing` and opens a playthrough. A displaced game becomes `paused` with its playthrough left open. The UI confirms before replacing (API: `PUT slots/:id/entry {entryId, replace}` returns 409 with the occupant when occupied and `replace` is not set). Enforce one game per slot with a partial unique index on `(user_id, entry_id) WHERE entry_id IS NOT NULL`, and assign in a transaction.
- **Lists:** only hold collection entries (no wishlist in v1; a wishlist could later be an ownership state).
- **Backlog:** strictly `unplayed` entries (derived, never stored). Random pick has an "include paused" toggle, off by default.
- **Ratings:** entry rating is its own field; finishing a rated playthrough pre-fills it only if empty.
- **Playthrough dates may be unknown** (null start/end) so games finished long ago can be logged; stats must skip nulls. Dates are `YYYY-MM-DD`; the web client sends its local date, the server falls back to UTC today.
- **Slot rules as built:** a game in a slot is always `playing` or `paused`. Finishing/abandoning, or history edits that leave playing/paused, empty its slot (`vacateSlots` in `playthroughs.ts`); deleting an entry empties it via `ON DELETE set null`. Pausing keeps the game in its slot. **Clearing or deleting a slot pauses its game** (never drops it). Moving a game between slots doesn't restart it.
- **Lists:** items are addressed by `entryId` (not a separate item id): `POST /lists/:id/items {entryId}`, `DELETE /lists/:id/items/:entryId`, `PUT /lists/:id/order {entryIds}` (must be exactly the list's games). Adding twice is a no-op.
- **Random pick:** candidates are `unplayed` games (plus `paused` if `includePaused`) from the backlog or a list, whatever the list holds. Filters: platform/tag/genre are any-of within a group and AND across groups; a max time-to-beat excludes games with unknown time. Re-roll sends `excludeEntryIds`; when all were shown it wraps, never repeating the last pick. Logic is pure in `packages/shared/src/pick.ts` with an injectable RNG.
- **Import = merge** (decided by the user; no replace mode). Match games by `igdb_id`, lists/slots by name (case-insensitive), playthroughs by platform+dates+outcome. Your existing values win; empty ones are filled; platforms and tags are unioned; playthroughs/list items/slots are added, never removed. An in-progress playthrough is skipped if one is already open; slots are only filled when empty and the game is playing/paused and not slotted elsewhere. Importing the same file twice changes nothing.
- **Status rules:** start (unplayed/finished/abandoned → playing, opens playthrough), pause, resume, finish/abandon (closes playthrough, empties its slot), log past playthrough. At most one open playthrough per entry (partial unique index).
- **Design:** flat modern look (hairline borders, no offset shadows), warm paper + orange palette, Bricolage Grotesque + Figtree, light/dark. Keep it responsive and keyboard accessible.

## Technical notes worth knowing

- **IGDB** (checked against api-docs.igdb.com): 4 req/s and max 8 open requests; token via Twitch client credentials (cached, refreshed 1h before expiry); a new game is one `/multiquery` (game + `game_time_to_beats`, values in seconds). Cached metadata is never re-fetched. Covers are stored as `image_id` only (`packages/shared/src/igdb-images.ts`).
- **Search filtering:** DLC, bundles, mods, episodes, seasons, packs and forks are excluded by IGDB's `game_type.type` _name_ in `apps/server/src/igdb/mappers.ts` (`EXCLUDED_TYPES`); unknown types are kept. The names were checked against live results. `Update` is intentionally kept because IGDB files real re-releases under it (Witcher 3 Remastered). Editions are excluded by the query itself (`version_parent = null`).
- **CSRF:** Hono `csrf()` only checks form-style content types, so `app.ts` also rejects mutations with a disallowed `Origin` and any non-JSON `Content-Type`. Body-less mutations (DELETE, logout) need an `Origin` header (browsers send it; tests/curl must add it).
- **Auth:** argon2id (`@node-rs/argon2`), session token hashed with SHA-256 in the DB, `gq_session` cookie (httpOnly, SameSite=Lax), generic login error, in-memory login rate limit, `SIGNUPS_ENABLED=false` → 403 on register.
- **Export/import** (`apps/server/src/services/export.ts`, `import.ts`, routes at `/api/data/*`; schema in `packages/shared/src/export.ts`): one versioned JSON (`format: gamequeue-export`, `version: 1`) with a metadata snapshot per game so import never calls IGDB. `POST /api/data/import` is a **dry run unless `?commit=true`**; the dry run executes the real merge inside a transaction and rolls back, so its report is exactly what commit does. Changing the file format means bumping `EXPORT_VERSION` and keeping a reader for the old one. Mount new routers under a specific prefix: a sub-router with `use('*', requireAuth)` mounted at `/api` would also gate `/api/auth/login`.
- **Known limitation:** import writes user-supplied metadata into the _shared_ game cache for games not cached yet (existing cache rows, including platform names, are never overwritten). Fine for a personal app; if signups are ever opened to untrusted users, a crafted file could seed wrong cover/name for an uncached IGDB id. Mitigation would be to mark imported cache rows and refresh them from IGDB.
- **Migrations gotcha:** drizzle-kit drops `ON DELETE ...` from `ALTER TABLE ... ADD COLUMN ... REFERENCES` on SQLite. Check generated SQL for added FK columns and patch it by hand (done in `0003` for `slots.entry_id`).
- **Nested transactions:** services call each other inside `db.transaction` (drizzle uses savepoints), e.g. `assignToSlot` reuses `startPlaythrough`/`togglePause`; a thrown `HttpError` rolls everything back.
- **Migrations:** edit `apps/server/src/db/schema.ts`, run `npm run db:generate`, commit the new file in `apps/server/drizzle/`. They run at startup and in every test DB.
- **Tests:** Vitest against in-memory SQLite via `createApp({db, config, igdb})` and `app.request()`; helpers in `apps/server/test/helpers.ts` (`makeApp`, `fakeIgdb`, `fakeGame`). Drizzle throws on empty `.values([])`, so guard inserts of possibly-empty arrays.
- **TypeScript** is pinned to 5.9 (npm lists 7.x; not tried).
- **Prod:** `npm run build && NODE_ENV=production npm start` serves API + built web on one port.
- Collection filter options come from `GET /entries/facets` (the plan's `GET /tags` was folded into it).
