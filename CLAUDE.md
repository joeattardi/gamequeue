# GameQueue: working notes

Personal video game collection and "what do I play next" manager. npm workspaces monorepo:
`apps/web` (React + Vite + TanStack Query), `apps/server` (Hono + Drizzle + SQLite), `packages/shared` (Zod schemas/types, consumed as TS source).
Full design (data model, API surface, rationale): `/Users/joe/.claude/plans/floating-exploring-brook.md` (outside the repo; if missing, the sections below plus the code are the source of truth).

## How we work
- Build one milestone at a time. After each: run `npm run typecheck` and `npm test`, make a git commit, give a 3-5 line summary and what to try manually. **Don't start the next milestone until the user says so.**
- If a requirement is ambiguous or needs a product decision, ask instead of guessing. Technical choices inside the stack are mine to make; mention the notable ones.
- Commit message footer: follow the attribution line given by the session's system reminder.

## Status
- M0 scaffold, DB + migrations, auth: **done**
- M1 IGDB integration + collection, backlog view: **done**
- M2 status + playthroughs: next
- M3 slots, lists/queue, random pick (completes v1)
- M4 export/import
- M5 (post-v1) smart lists, stats, CSV export of lists

Not yet verified by hand: real IGDB calls (needs credentials in `apps/server/.env`) and the web UI in a browser. Tests use a fake IGDB client / fake fetch.

## Product decisions (confirmed by the user)
- **Slots:** assigning a game sets it to `playing` and opens a playthrough. A displaced game becomes `paused` with its playthrough left open. The UI confirms before replacing (API: `PUT slots/:id/entry {entryId, replace}` returns 409 with the occupant when occupied and `replace` is not set). Enforce one game per slot with a partial unique index on `(user_id, entry_id) WHERE entry_id IS NOT NULL`, and assign in a transaction.
- **Lists:** only hold collection entries (no wishlist in v1; a wishlist could later be an ownership state).
- **Backlog:** strictly `unplayed` entries (derived, never stored). Random pick has an "include paused" toggle, off by default.
- **Ratings:** entry rating is its own field; finishing a rated playthrough pre-fills it only if empty.
- **Status rules:** start (unplayed/finished/abandoned → playing, opens playthrough), pause, resume, finish/abandon (closes playthrough, empties its slot), log past playthrough. At most one open playthrough per entry (partial unique index).
- **Design:** flat modern look (hairline borders, no offset shadows), warm paper + orange palette, Bricolage Grotesque + Figtree, light/dark. Keep it responsive and keyboard accessible.

## Open question
- **M4:** should import **replace** or **merge** (matching on `igdb_id`)? Ask the user before building it.

## Technical notes worth knowing
- **IGDB** (checked against api-docs.igdb.com): 4 req/s and max 8 open requests; token via Twitch client credentials (cached, refreshed 1h before expiry); a new game is one `/multiquery` (game + `game_time_to_beats`, values in seconds). Cached metadata is never re-fetched. Covers are stored as `image_id` only (`packages/shared/src/igdb-images.ts`).
- **Unverified:** IGDB's docs don't list `game_type` IDs, so DLC/mod/etc. are excluded by *type name* in `apps/server/src/igdb/mappers.ts` (`EXCLUDED_TYPES`); unknown types are kept. Verify against real search results.
- **CSRF:** Hono `csrf()` only checks form-style content types, so `app.ts` also rejects mutations with a disallowed `Origin` and any non-JSON `Content-Type`. Body-less mutations (DELETE, logout) need an `Origin` header (browsers send it; tests/curl must add it).
- **Auth:** argon2id (`@node-rs/argon2`), session token hashed with SHA-256 in the DB, `gq_session` cookie (httpOnly, SameSite=Lax), generic login error, in-memory login rate limit, `SIGNUPS_ENABLED=false` → 403 on register.
- **Migrations:** edit `apps/server/src/db/schema.ts`, run `npm run db:generate`, commit the new file in `apps/server/drizzle/`. They run at startup and in every test DB.
- **Tests:** Vitest against in-memory SQLite via `createApp({db, config, igdb})` and `app.request()`; helpers in `apps/server/test/helpers.ts` (`makeApp`, `fakeIgdb`, `fakeGame`). Drizzle throws on empty `.values([])`, so guard inserts of possibly-empty arrays.
- **TypeScript** is pinned to 5.9 (npm lists 7.x; not tried).
- **Prod:** `npm run build && NODE_ENV=production npm start` serves API + built web on one port.
- Collection filter options come from `GET /entries/facets` (the plan's `GET /tags` was folded into it).
