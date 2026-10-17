# Architecture

How GameQueue is put together. `CLAUDE.md` holds the working notes and product decisions; this file explains the structure and the main flows. **Keep it up to date whenever functionality is added or changed** (new routes, tables, services, auth or IGDB behaviour, web pages).

## Repo layout

npm workspaces monorepo.

```
apps/
  server/            Hono API + Drizzle (SQLite)
    src/
      index.ts       Entry point: load config, open DB, build app, serve built web, start listening
      app.ts         createApp({db, config, igdb}): middleware, route mounting, error handler
      config.ts      Env vars -> Config
      errors.ts      HttpError (status + message + extra JSON)
      http.ts        validate(zodSchema, value), parseId
      auth/          password hashing, sessions, requireAuth middleware, login rate limiter
      db/            schema.ts (Drizzle tables), client.ts (open + migrate)
      igdb/          IGDB client, token provider, request limiter, mappers, search cache
      routes/        Thin HTTP layer: parse + validate input, call a service, return JSON
      services/      Business logic; all DB work lives here
    drizzle/         Generated SQL migrations (committed)
    test/            Vitest suites + helpers (in-memory SQLite, fake IGDB)
  web/               React + Vite + TanStack Query + React Router
    src/
      main.tsx       Providers: QueryClient, Router, ConfirmProvider
      App.tsx        Auth gate + route table
      api/           fetch wrapper (client.ts) and TanStack Query hooks per area
      routes/        One component per page
      components/    Shared UI (dialogs, slot bay, score gauge, ...)
      styles/        tokens.css (design tokens, light/dark), app.css
packages/
  shared/            Zod schemas, DTO types and pure logic used by both apps (consumed as TS source)
```

`packages/shared` is the contract between the two apps: request schemas (`addEntrySchema`, `loginSchema`, ...), response DTOs (`EntryDto`, `SlotDto`, ...), the export file schema, status rules (`status.ts`), the random-pick algorithm (`pick.ts`, pure with an injectable RNG) and IGDB image URL helpers. There is no build step for it; both apps import the TypeScript directly.

Useful commands: `npm run dev` (server :3000 + web :5173, Vite proxies `/api`), `npm run build && NODE_ENV=production npm start` (one process serves API and built web), `npm test`, `npm run typecheck`, `npm run db:generate`.

## Request flow

```
Browser
  -> React component calls a TanStack Query hook (apps/web/src/api/*.ts)
  -> api() in client.ts: fetch('/api/...'), same-origin cookies, JSON body
  -> Hono app (apps/server/src/app.ts)
       1. csrf() on /api/*
       2. origin + content-type guard for POST/PUT/PATCH/DELETE
       3. router matched by prefix
       4. requireAuth(db, config)   (every router except /api/auth, /api/health and /api/profiles)
       5. route handler: validate(sharedSchema, input) -> service function(db, userId, ...)
  -> service reads/writes SQLite via Drizzle, returns a DTO
  -> JSON response; errors thrown as HttpError (or Zod failures via validate) are turned into
     { error, ...extra } by app.onError; anything else is a 500
  -> mutation hook's onSuccess invalidates related query keys, so the UI refetches
```

Details:

- **Route mounting** (`app.ts`): `/api/auth`, `/api/igdb`, `/api/entries` (two routers share the prefix: CRUD and playthrough/status actions), `/api/playthroughs`, `/api/slots`, `/api/lists`, `/api/queue`, `/api/pick`, `/api/data`, and the public `/api/profiles`. Each router applies `requireAuth` itself; `requireAuth` is a no-op if an earlier router on the same prefix already authenticated the request. Mount new routers under a specific prefix, never a `use('*', requireAuth)` router at `/api`, which would also gate login.
- **CSRF**: Hono's `csrf()` only checks form content types, so `app.ts` additionally rejects mutations whose `Origin` isn't same-origin or in `ALLOWED_ORIGINS` (403), and any body that isn't `application/json` (415). Body-less mutations (DELETE, logout) need an `Origin` header; browsers send one, curl and tests must add it.
- **Validation**: input schemas live in `packages/shared` and are applied with `validate()`; failure is a 400 with `details: [{path, message}]`.
- **Errors**: `HttpError(status, message, extra)` is thrown from services. Statuses in use: 400, 404, 409 (e.g. already collected, slot occupied; `extra` carries the conflicting data), 502 (IGDB down), 503 (IGDB not configured). Throwing inside `db.transaction` rolls it back.
- **Transactions**: services call each other inside `db.transaction` (Drizzle uses savepoints for nesting). For example `assignToSlot` reuses `startPlaythrough` and `togglePause`.
- **Services** (`apps/server/src/services/`): `entries` (collection CRUD, listing/filtering, facets, tags, hydrating `EntryDto`), `playthroughs` (status transitions, history, `vacateSlots`, `syncStatus`), `slots`, `lists` (lists and the queue), `pick`, `games` (IGDB-backed metadata cache), `export`, `import`.
- **Production serving** (`index.ts`): if the built web dir exists (`WEB_DIST`, default `../web/dist`) it is served statically with an SPA fallback to `index.html`. Expired sessions are purged at startup and every 6 hours.
- **Web client**: `App.tsx` calls `useMe()`; unauthenticated users get `/login`, `/register` and the public profile `/u/:username` and `/u/:username/:view` (`ProfilePage`, `ProfileGamesPage`, which brings its own header instead of the `Shell`; also reachable when logged in), authenticated users get the `Shell` layout with pages for home, collection, backlog, game (`games/:id`), queue, lists, list, pick and data (export/import). Query keys group by area (`entries`, `entry`, `facets`, `platforms`, `search`, `playthroughs`, lists, slots, queue); mutations invalidate the relevant groups. Confirmations use `useConfirm()` and dialogs use native `<dialog>` via `useModalDialog`.

## Data model

SQLite via better-sqlite3, WAL mode, `PRAGMA foreign_keys = ON`. Schema in `apps/server/src/db/schema.ts`; migrations in `apps/server/drizzle/` run automatically when the DB is opened (startup and every test DB). Timestamps are epoch milliseconds; game dates are `YYYY-MM-DD` text.

**Shared game metadata cache** (no `user_id`; ids are IGDB ids):

| Table                           | Purpose                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `games`                         | name, slug, summary, release date, cover `image_id`, IGDB rating, game type, time-to-beat (seconds), `fetched_at` |
| `platforms`, `genres`, `themes` | Lookup tables                                                                                                     |
| `game_platforms/genres/themes`  | Many-to-many join tables, cascade on game delete                                                                  |

**Per-user data** (every row carries `user_id`, directly or through its entry; all queries filter by it):

| Table                | Purpose                                                                                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`              | username (unique, stored lowercase), email (unique), argon2id `password_hash`                                                                                                                        |
| `sessions`           | `id` = SHA-256 of the cookie token, `expires_at`; cascades with the user                                                                                                                             |
| `entries`            | A game in a user's collection: `status` (unplayed/playing/paused/finished/abandoned), `rating` 1-5 stars, notes, time-to-beat override. Unique per `(user_id, game_id)`                              |
| `entry_platforms`    | Platforms the user owns the game on                                                                                                                                                                  |
| `tags`, `entry_tags` | Per-user tags, unique case-insensitively; unused tags are deleted when tags change                                                                                                                   |
| `playthroughs`       | Per entry: platform, `started_on`/`ended_on` (nullable = unknown), `outcome` (null = open, finished, abandoned), rating. Partial unique index: at most one open playthrough per entry                |
| `slots`              | Named "currently playing" slots with `position`; `entry_id` holds at most one game. Partial unique index on `(user_id, entry_id)` so a game can't be in two slots; `ON DELETE set null` on the entry |
| `lists`              | User lists. `kind` is `list` or `queue`; a partial unique index allows one `queue` per user (created lazily by `ensureQueue`)                                                                        |
| `list_items`         | `(list_id, entry_id)` primary key plus 0-based `position`; rewritten wholesale on reorder                                                                                                            |

Relationships to remember:

- A user owns entries; an entry points at a cached `games` row. Deleting an entry cascades to its platforms, tags, playthroughs and list items, and empties its slot.
- The backlog is not stored: it is every entry with status `unplayed`.
- Status is kept consistent with playthroughs by `syncStatus`; slot rules are enforced in `services/playthroughs.ts` and `services/slots.ts` (a slotted game is always `playing` or `paused`; starting a game removes it from the queue).
- Registering a user also inserts the default slots (`DEFAULT_SLOT_NAMES`).

**Changing the schema**: edit `schema.ts`, run `npm run db:generate`, commit the new SQL. Check generated SQL for added FK columns: drizzle-kit drops `ON DELETE` from `ALTER TABLE ... ADD COLUMN ... REFERENCES` on SQLite and it must be patched by hand (see `0003`).

**Export/import** (`services/export.ts`, `services/import.ts`, `packages/shared/src/export.ts`, routes `/api/data/*`): one versioned JSON file (`format: gamequeue-export`, `version: 1`) with a metadata snapshot per game so import never calls IGDB. Import is a merge matched on `igdb_id`, list and slot names, and playthrough platform+dates+outcome. `POST /api/data/import` is a dry run unless `?commit=true`; the dry run runs the real merge in a transaction and rolls it back. Changing the format means bumping `EXPORT_VERSION` and keeping a reader for the old one.

## Auth and sessions

- **Accounts**: `POST /api/auth/register` (403 when `SIGNUPS_ENABLED=false`) hashes the password with argon2id (`@node-rs/argon2`, parameters pinned in `auth/password.ts`), inserts the user and default slots in one transaction (the unique username and email indexes are the duplicate check; failure is a generic 409). Usernames are 3-30 chars of `a-z 0-9 _ -`, lowercased by `usernameSchema`; email is kept but is not used to log in, then logs the user in.
- **Login** (`POST /api/auth/login`): checks two in-memory `FailureLimiter`s first (per `username|ip`: 5 failures / 15 min; per IP: 30 / 15 min; 429 with `Retry-After`). It always runs an argon2 verify, against a dummy hash if the username is unknown, so timing doesn't reveal which accounts exist. Wrong credentials return one generic 401. Success resets the per-account counter. The client IP comes from the socket, or from `X-Forwarded-For` only when `TRUST_PROXY=true`. The limiters are per process, which is fine for a single-instance deployment.
- **Sessions** (`auth/sessions.ts`): on login a random 32-byte token is generated; only its SHA-256 hash is stored (`sessions.id`), so a DB leak doesn't yield usable cookies. The raw token goes to the browser in the `gq_session` cookie (httpOnly, SameSite=Lax, `Secure` when `NODE_ENV=production`, path `/`). TTL is 30 days, sliding: when less than half remains, the expiry is extended and the cookie re-issued. Expired sessions found on lookup are deleted, and a periodic purge removes the rest.
- **Per-request auth** (`auth/middleware.ts`): `requireAuth` reads the cookie, calls `resolveSession`, and sets `c.var.user = {id, username, email}`. A missing or invalid session returns 401 (and clears a stale cookie). Handlers get the user id from `c.get('user')`; every service query is scoped by it.
- **Public profile** (`GET /api/profiles/:username`, `routes/profile.ts` + `services/profile.ts`): no login. Returns username, join date, slot contents, a count per status plus the queue length (the web page shows these as icon stat tiles plus a status bar) and the user's lists with their games, as `PublicEntryDto` (no notes, email or slot/list internals). Unknown or malformed usernames are 404. It is read-only: it never calls `ensureQueue`. `GET /api/profiles/:username/:view` (`view` is one of `PROFILE_VIEWS`: queue, collection, backlog, playing, paused, finished, abandoned; anything else is 404) returns that list of games as `PublicEntryDto`: the queue in queue order (empty if they never queued anything), the rest by title. Each stat tile on the profile links to its web page `/u/:username/:view` (`ProfileGamesPage`, all rendering through the shared `PublicGameList` component, so layout tweaks happen in one place; it offers a cover-art grid, the default, or the row list (hover or focus a cover for name, status and rating), remembered in `localStorage`; while loading it shows shimmering skeletons built on the real list classes, with the layout selector and page heading always visible). Everything is public; there is no visibility setting.
- **Logout** (`POST /api/auth/logout`) deletes the session row and clears the cookie. `GET /api/auth/me` backs the web app's `useMe()` gate.
- **CSRF**: see the origin/content-type guard under Request flow.

## IGDB communication

All IGDB access is server-side; the browser never talks to IGDB or sees credentials. Code is in `apps/server/src/igdb/`, behind the `IgdbClient` interface (`search`, `fetchGame`, `fetchPlatforms`) so tests inject a fake. If `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` are unset, `igdb` is undefined and IGDB-backed endpoints return 503 (`requireIgdb`).

- **Token** (`token.ts`): Twitch client-credentials flow (`id.twitch.tv/oauth2/token`). The token is cached in memory and refreshed an hour before expiry; concurrent callers share one refresh. A 401 from IGDB invalidates it and retries once.
- **Rate limiting** (`limiter.ts`): every request goes through `RequestLimiter`, a queue that starts at most 4 requests per rolling second with at most 8 in flight (IGDB's documented limits). A 429 response is retried up to 3 times, honouring `Retry-After`.
- **Requests** (`client.ts`): POST to `https://api.igdb.com/v4/<endpoint>` with `Client-ID` and bearer headers, APICalypse bodies (user text escaped by `quote`).
    - `search`: `games` endpoint, text search with `version_parent = null` (drops editions), limit 30, then filtered by `isCollectable` and cut to 20.
    - `fetchGame`: one `/multiquery` combining the game and its `game_time_to_beats` row (seconds).
    - `fetchPlatforms`: the full platform list.
- **Mapping** (`mappers.ts`): raw IGDB shapes become `GameRecord` / `IgdbSearchHit`. Only add-on game types are excluded (`EXCLUDED_TYPES`: DLC, Mod, Pack / Addon); see the comment there before changing it. Covers are kept as `image_id` only and turned into URLs by `packages/shared/src/igdb-images.ts`.
- **Search flow** (`routes/igdb.ts`): `GET /api/igdb/search?q=` checks a 5-minute, 200-entry `TtlCache` keyed by lowercased query, otherwise calls IGDB. The result is then annotated per user with the `entryId` of already-collected games (never cached, since it is per user).
- **Adding a game** (`addEntry` -> `ensureGame` in `services/games.ts`): if the game isn't in the shared `games` table, `fetchGame` is called and `saveGame` writes it and its relations; cached metadata is never re-fetched. IGDB failures are wrapped by `callIgdb` as 502. The entry is then created with the chosen platforms, and tags default to the game's genres and themes.
- **Platforms** (`listPlatforms`): `GET /api/igdb/platforms` serves the platform table, doing a one-time full sync from IGDB when it holds fewer than 50 rows (only games' own platforms so far).
- **Import** never calls IGDB; it writes snapshot metadata from the file into the cache for games not cached yet (existing rows are never overwritten).
