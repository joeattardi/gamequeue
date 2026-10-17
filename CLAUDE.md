# GameQueue: working notes

Personal video game collection and "what do I play next" manager. npm workspaces monorepo:
`apps/web` (React + Vite + TanStack Query), `apps/server` (Hono + Drizzle + SQLite), `packages/shared` (Zod schemas/types, consumed as TS source).
Full design (data model, API surface, rationale): `/Users/joe/.claude/plans/floating-exploring-brook.md` (outside the repo; if missing, the sections below plus the code are the source of truth).

## How we work

- Build one milestone at a time. After each: run `npm run typecheck` and `npm test`, make a git commit, give a 3-5 line summary and what to try manually. **Don't start the next milestone until the user says so.**
- If a requirement is ambiguous or needs a product decision, ask instead of guessing. Technical choices inside the stack are mine to make; mention the notable ones.
- Code style is enforced by Prettier (`.prettierrc.json`: 4 spaces, single quotes, semicolons, no trailing commas, width 100). Run `npm run format` before committing; `npm run format:check` verifies.
- Keep `ARCHITECTURE.md` up to date: when a change adds or alters routes, tables, services, auth/session behaviour, IGDB communication or web pages, update the matching section in the same commit.
- Commit message footer: follow the attribution line given by the session's system reminder.

## Status

- M0 scaffold, DB + migrations, auth: **done**
- M1 IGDB integration + collection, backlog view: **done**
- M2 status + playthroughs: **done**
- M3 slots, lists/queue, random pick (completes v1): **done**
- M4 export/import: **done** (merge, not replace). v1 is complete.
- M5 queue: **done** (post-v1)
- Usernames + public profile: **done** (post-v1; existing databases must be recreated, no backfill)
- M6 (post-v1) smart lists, stats, CSV export of lists: next, when the user asks

**Visual checks are possible without a browser tool:** Chrome is installed, so bundle a scratch page with esbuild (`NODE_PATH=node_modules npx esbuild entry.tsx --bundle --jsx=automatic`, built CSS from `apps/web/dist/assets`) and run `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --user-data-dir=<tmp> --allow-file-access-from-files --window-size=W,H --virtual-time-budget=5000 --force-prefers-reduced-motion --blink-settings=preferredColorScheme=0|1 --screenshot=out.png file://page.html`, then read the PNG. Keep scratch files in the scratchpad, not the repo. `--force-prefers-reduced-motion` matters: headless virtual time sometimes stalls CSS transitions and captures a half-animated state.

Verified against live IGDB (Oct 2026, via a script using `apps/server/.env`): token flow, search, and the game + time-to-beat multiquery. Not verified by Claude: the web UI in a browser (no browser tool in sessions so far). Tests use a fake IGDB client / fake fetch.

## Product decisions (confirmed by the user)

- **Slots:** assigning a game sets it to `playing` and opens a playthrough. A displaced game becomes `paused` with its playthrough left open. The UI confirms before replacing (API: `PUT slots/:id/entry {entryId, replace}` returns 409 with the occupant when occupied and `replace` is not set). Enforce one game per slot with a partial unique index on `(user_id, entry_id) WHERE entry_id IS NOT NULL`, and assign in a transaction.
- **Lists:** only hold collection entries (no wishlist in v1; a wishlist could later be an ownership state).
- **Backlog:** strictly `unplayed` entries (derived, never stored). Random pick has an "include paused" toggle, off by default.
- **Ratings:** entry rating is its own field; finishing a rated playthrough pre-fills it only if empty.
- **Playthrough dates may be unknown** (null start/end) so games finished long ago can be logged; stats must skip nulls. Dates are `YYYY-MM-DD`; the web client sends its local date, the server falls back to UTC today.
- **Slot rules as built:** a game in a slot is always `playing` or `paused`. Finishing/abandoning, or history edits that leave playing/paused, empty its slot (`vacateSlots` in `playthroughs.ts`); deleting an entry empties it via `ON DELETE set null`. Pausing keeps the game in its slot. **Clearing or deleting a slot pauses its game** (never drops it). Moving a game between slots doesn't restart it.
- **Lists:** items are addressed by `entryId` (not a separate item id): `POST /lists/:id/items {entryId}`, `DELETE /lists/:id/items/:entryId`, `PUT /lists/:id/order {entryIds}` (must be exactly the list's games). Adding twice is a no-op.
- **Queue:** the user's one ordered "up next" plan, stored as a `lists` row with `kind = 'queue'` (partial unique index per user, created lazily by `ensureQueue`), so ordering, pick and export reuse the list code. Any game can be queued whatever its status. **Starting a game (including via a slot) takes it off the queue** (`dequeue` in `startPlaythrough`); pause/resume/finish don't touch it. Assigning from the queue is manual: nothing fills a slot automatically. It's excluded from `/lists`, from `EntryDto.lists` (see `EntryDto.queued`) and from list-by-name import matching; it can't be renamed or deleted. API: `/api/queue` (`GET`, `POST items`, `DELETE items/:entryId`, `PUT order`); the generic `/lists/:id` routes work on it too. Export carries it as top-level `queue` (IGDB ids in order), an optional field so it is still format v1; import appends missing games to the end of the existing queue.
- **Random pick:** candidates are `unplayed` games (plus `paused` if `includePaused`) from the backlog or a list, whatever the list holds. Filters: platform/tag/genre are any-of within a group and AND across groups; a max time-to-beat excludes games with unknown time. Re-roll sends `excludeEntryIds`; when all were shown it wraps, never repeating the last pick. Logic is pure in `packages/shared/src/pick.ts` with an injectable RNG.
- **Import = merge** (decided by the user; no replace mode). Match games by `igdb_id`, lists/slots by name (case-insensitive), playthroughs by platform+dates+outcome. Your existing values win; empty ones are filled; platforms and tags are unioned; playthroughs/list items/slots are added, never removed. An in-progress playthrough is skipped if one is already open; slots are only filled when empty and the game is playing/paused and not slotted elsewhere. Importing the same file twice changes nothing.
- **Status rules:** start (unplayed/finished/abandoned → playing, opens playthrough), pause, resume, finish/abandon (closes playthrough, empties its slot), log past playthrough. At most one open playthrough per entry (partial unique index).
- **Score gauge** (`apps/web/src/components/ScoreGauge.tsx`, tier logic and geometry in `src/gauge.ts`): 270° arc coloured by tier, 75+ green / 50-74 yellow / below 50 red (Metacritic cut-offs, applied to the percentage so 7.5/10 matches 75/100). The user asked for red/yellow/green; the status colours are tokens in `tokens.css` (`--status-bad|mid|good`, light and dark), picked for >= 3:1 contrast on the page and panel surfaces and checked with the dataviz validator. The validator always fails red vs green under deuteranopia (any red/green pair does), so colour is never the only cue: the score is real text, notches cut into the arc at the 50 and 75 boundaries show the zone by position, and the tier is in `aria-label`/`title`. Animated draw-in respects reduced motion. Props: `value`, `max`, `label`, `size`. Below 64px it drops the visible caption (the `aria-label` keeps it). Used for the IGDB score on the game page and, at 56px, in the add-game search results (`SearchResultDto.igdbRating`, from IGDB's `total_rating`; null when IGDB has no rating); also takes the user's 1-10 rating (`max={10}`).
- **Public profile:** `GET /api/profiles/:username` (web `/u/:username`) needs no login and is public for everyone: username, join date, slot games, status counts, lists (never notes, email or the queue).
- **Design:** flat modern look (hairline borders, no offset shadows), cool paper + cobalt blue palette, Bricolage Grotesque + Figtree, Lucide icons (`lucide-react`; decorative, so keep a text label or `aria-label` on the button), light/dark. Keep it responsive and keyboard accessible.

## Technical notes worth knowing

- **IGDB** (checked against api-docs.igdb.com): 4 req/s and max 8 open requests; token via Twitch client credentials (cached, refreshed 1h before expiry); a new game is one `/multiquery` (game + `game_time_to_beats`, values in seconds). Cached metadata is never re-fetched. Covers are stored as `image_id` only (`packages/shared/src/igdb-images.ts`).
- **Search filtering:** only add-ons are excluded, by IGDB `game_type.type` _name_ in `apps/server/src/igdb/mappers.ts` (`EXCLUDED_TYPES`: DLC, Mod, Pack / Addon). Everything else is kept on purpose: IGDB files real ownable games under surprising types (Bundle = Kingdom Hearts HD 1.5 + 2.5 Remix, Update = Witcher 3 Remastered, Fork = Predecessor, Episode = Deltarune Chapter 1). The full type list was read from live IGDB (`/v4/game_types`); a name guess is what caused two missing-game bugs, so check live data before excluding anything. Editions are excluded by the query itself (`version_parent = null`).
- **CSRF:** Hono `csrf()` only checks form-style content types, so `app.ts` also rejects mutations with a disallowed `Origin` and any non-JSON `Content-Type`. Body-less mutations (DELETE, logout) need an `Origin` header (browsers send it; tests/curl must add it).
- **Auth:** argon2id (`@node-rs/argon2`), session token hashed with SHA-256 in the DB, `gq_session` cookie (httpOnly, SameSite=Lax), login by `username` (lowercase, 3-30 of `a-z0-9_-`; email is kept but not used to log in), generic login error, in-memory login rate limit, `SIGNUPS_ENABLED=false` → 403 on register.
- **Export/import** (`apps/server/src/services/export.ts`, `import.ts`, routes at `/api/data/*`; schema in `packages/shared/src/export.ts`): one versioned JSON (`format: gamequeue-export`, `version: 1`) with a metadata snapshot per game so import never calls IGDB. `POST /api/data/import` is a **dry run unless `?commit=true`**; the dry run executes the real merge inside a transaction and rolls back, so its report is exactly what commit does. Changing the file format means bumping `EXPORT_VERSION` and keeping a reader for the old one. Mount new routers under a specific prefix: a sub-router with `use('*', requireAuth)` mounted at `/api` would also gate `/api/auth/login`.
- **Known limitation:** import writes user-supplied metadata into the _shared_ game cache for games not cached yet (existing cache rows, including platform names, are never overwritten). Fine for a personal app; if signups are ever opened to untrusted users, a crafted file could seed wrong cover/name for an uncached IGDB id. Mitigation would be to mark imported cache rows and refresh them from IGDB.
- **Migrations gotcha:** drizzle-kit drops `ON DELETE ...` from `ALTER TABLE ... ADD COLUMN ... REFERENCES` on SQLite. Check generated SQL for added FK columns and patch it by hand (done in `0003` for `slots.entry_id`).
- **Confirmations:** never use `window.confirm`. `useConfirm()` (`components/Confirm.tsx`, provider mounted in `main.tsx`) returns a promise: `if (await confirm({ title, message, confirmLabel, tone: 'danger' })) …`. Cancel has initial focus; use `tone: 'danger'` for deletes.
- **Dialogs:** native `<dialog>` via `useModalDialog` (`components/useModalDialog.ts`). To focus a field on open, mark it `data-autofocus` (and keep `autoFocus` for re-mounts); React's `autoFocus` alone fails because the field is created before the dialog is opened, so the ✕ button gets focus instead.
- **Nested transactions:** services call each other inside `db.transaction` (drizzle uses savepoints), e.g. `assignToSlot` reuses `startPlaythrough`/`togglePause`; a thrown `HttpError` rolls everything back.
- **Migrations:** edit `apps/server/src/db/schema.ts`, run `npm run db:generate`, commit the new file in `apps/server/drizzle/`. They run at startup and in every test DB.
- **Tests:** Vitest against in-memory SQLite via `createApp({db, config, igdb})` and `app.request()`; helpers in `apps/server/test/helpers.ts` (`makeApp`, `fakeIgdb`, `fakeGame`). Drizzle throws on empty `.values([])`, so guard inserts of possibly-empty arrays.
- **TypeScript** is pinned to 5.9 (npm lists 7.x; not tried).
- **Prod:** `npm run build && NODE_ENV=production npm start` serves API + built web on one port.
- Collection filter options come from `GET /entries/facets` (the plan's `GET /tags` was folded into it).
