# Security review

Date: 2026-10-25. Commit reviewed: `1e7ed69` (`main`).

A read-only review: no code was changed. The only things run were `npm audit`, a throwaway in-memory test file (deleted afterwards) and a scratch script outside the repo. No requests were sent to IGDB, ITAD, Resend or Cloudflare.

**Result:** no Critical or High findings. Three Medium findings, each checked end to end in the code; two of them were reproduced locally.

## How the app is set up

- **Stack:** an npm workspaces monorepo. The server is Hono on Node 22 with Drizzle and better-sqlite3. The web app is React 19, Vite and TanStack Query. Zod schemas in `packages/shared` are used on both sides.
- **How it runs:** deployed publicly at `gamequeue.app` on a Raspberry Pi. It runs in Docker as the non-root `node` user, behind a Cloudflare Tunnel, and publishes no ports. A cron job (`scripts/update.sh`) pulls `ghcr.io/joeattardi/gamequeue:latest` after CI passes. In local dev, `tsx watch` runs the server on :3000 and Vite runs on :5173.
- **Entry points:** `apps/server/src/index.ts` starts the server and the background jobs. `app.ts` mounts about 20 routers under `/api/*`, and `web.ts` serves the built web app. The host scripts are `update.sh`, `backup.sh`, `mirror.sh` and `resources.sh`. There is also the mirror CLI (`apps/server/src/mirror/cli.ts`).
- **Data stored:** one SQLite file, `data/gamequeue.db`. It holds:
    - users: email, argon2id password hash, optional real name, bio, social IDs, role
    - SHA-256 hashes of session tokens, password reset tokens and email verification tokens
    - collections, private and public notes, avatar images
    - the error log and the shared game metadata cache

    The IGDB mirror is a separate file, `data/igdb.db`. Gzipped backups are kept for 14 days, with an optional rclone off-site copy.

- **External services:**
    - Twitch OAuth and the IGDB API, including the data dumps downloaded from S3
    - images.igdb.com, fetched by the server for share cards
    - IsThereAnyDeal, Resend and the Cloudflare GraphQL analytics API
    - healthchecks.io, from the scripts
    - GHCR, for the deploy image

    Every outbound URL is fixed in code or comes from the IGDB API. The server never fetches a user-supplied URL.

## Findings

### 1. Medium: any account can put its own images on the public landing page

**Status: fixed.** Import now refuses a `coverImageId` that isn't an IGDB image id, `coverUrl` and `screenshotUrl` URL-encode the id, and the landing page showcase picks from the IGDB mirror only (well-known games, never the Erotic theme), never from the shared cache.

**Where:**

- `packages/shared/src/export.ts:54`: `coverImageId` only has to be a string of up to 100 characters
- `apps/server/src/services/import.ts:114-131`: the import writes it into the shared game cache
- `packages/shared/src/igdb-images.ts:33-35`: `coverSrcSet` builds the `srcset` by string concatenation
- `apps/server/src/routes/showcase.ts:13-19`: a public endpoint that picks 3 random cached games
- `apps/web/src/routes/LandingPage.tsx:158-162`: the landing page renders those covers

**Risk:** an import writes the file's game metadata into the _shared_ cache for any IGDB id that isn't cached yet, and made-up ids are accepted. The web app builds `srcset` from the stored id without encoding it. A crafted id `x 1x, https://attacker.example/i.png?` produces this `srcset` (checked by running `coverSrcSet` with that id):

```
…/t_cover_big/x 1x, https://attacker.example/i.png?.jpg 1x, …/t_cover_big_2x/x 1x, https://attacker.example/i.png?.jpg 2x
```

On any high-DPI screen the browser picks the only `2x` candidate, which is the attacker's URL.

**Attack:** someone signs up and imports a file with a few thousand made-up IGDB ids, all using that cover id. `/api/showcase` needs no login and picks 3 random cached games for the anonymous landing page, so the attacker's rows take over most of the picks. Visitors on most phones and Macs then load an image the attacker chose. That allows defacement, and a tracking pixel that logs visitor IP addresses. The same images show to anyone viewing the attacker's profile, grids or tier lists.

**Why the existing safeguards don't stop it:** the mirror sync only overwrites ids the mirror knows, so made-up ids stay. `purgeUnusedGames` keeps them while the attacker's entries still point at them.

**Fix:**

- Accept only real IGDB image ids in the export schema, for example `z.string().regex(/^[a-z0-9]{1,40}$/)`. Check the same thing in `saveGame` so no path can store anything else. Apply the same check to screenshot ids.
- Have `coverUrl` and `coverSrcSet` apply `encodeURIComponent` to the id as a second guard.
- Limit the showcase to rows that came from IGDB or the mirror, not from an import. For example, add a `source` column, or require `screenshots IS NOT NULL` (imports store `null` there).

### 2. Medium: no request body size limit on the JSON API, including routes that need no login

**Status: fixed.** A 256 KB `bodyLimit` now covers all of `/api/*` (the import keeps its own 50 MB). Checked through a real local socket: 84 MB bodies, with and without `Content-Length`, get a 413 within 45 ms and memory doesn't grow.

**Where:** `apps/server/src/app.ts:91-110`. Body limits exist only on `routes/data.ts:52` (import) and `routes/avatar.ts:18`. The other handlers call `c.req.json()` directly, for example `routes/auth.ts:55`.

**Checked:** an 84 MB JSON body sent in-process to `POST /api/auth/login` was read and parsed in full, and the server answered `401 Invalid username or password`.

**Attack:** no account is needed. Cloudflare's free plan lets through request bodies up to 100 MB. A handful of parallel ~100 MB posts to `/api/auth/login` or `/api/auth/register` cost several times that in memory (the raw string plus the parsed objects), which can run the 8 GB Pi out of memory. The per-IP limit of 300 requests a minute doesn't help, because a few requests are enough. Docker restarts the container, and the attack can simply be repeated.

**Fix:** add a global `bodyLimit` of about 64 KB on `/api/*`. Skip it for `/api/data/import` and `/api/avatar`, which already set their own larger limits.

### 3. Medium (Low if signups are closed or email verification is on): import can fill the Pi's disk

**Status: fixed.** Import no longer stores the file's game metadata at all: uncached games are looked up in the mirror or on IGDB (100 per request), and ones IGDB doesn't know are skipped. Files hold at most 10,000 games (and queue and wishlist items), a run looks up at most 5,000 uncached games, and each user may commit 10 imports a day.

**Correction:** the first version of this review said the `games` array had no `.max()`. It did: 50,000. The finding stands, since 50,000 snapshots with 20,000-character summaries still fill a 50 MB request.

**Where:** `packages/shared/src/export.ts` capped the top-level `games` array at 50,000, and each game's `summary` can be up to 20,000 characters. `apps/server/src/services/import.ts:114-142` writes the rows.

**Attack:** an account sends 50 MB imports, using new made-up ids each time. The `data` rate limit allows 20 requests per 10 minutes per IP, which is roughly 1 GB of committed rows per 10 minutes from one IP. That fills the microSD card within hours. Once the disk is full, both the app and the backups fail.

**Mitigating factors:** it needs an account, and all the rows belong to that account. Deleting the user and then running Admin > purge unused games cleans it up.

**Fix:**

- Cap `games` (and wishlist, grid and tier list items) at a sensible number, for example 10,000.
- Cap the number of _new_ cache rows a single import may create.
- Add a per-user daily import quota.

### 4. Low: the dev server listens on every network interface

**Where:** `apps/server/src/index.ts:126`. `serve()` is called without a `hostname`. `@hono/node-server` then calls `server.listen(port, undefined)` (confirmed in its source), which binds every interface.

**Risk:** while `npm run dev` is running, anyone on the same Wi-Fi can reach `http://<mac-ip>:3000`. They can sign up there, use your IGDB credentials, and read the dev database's public profiles.

**Fix:** use `hostname: process.env.HOST ?? '127.0.0.1'`, and set `HOST=0.0.0.0` in the Dockerfile so the container still works.

### 5. Low: off-site backups are not encrypted

**Where:** `scripts/backup.sh:68-74`.

**Risk:** the `.db.gz` files contain emails, password hashes, real names and private notes. They are uploaded unencrypted to whatever the `offsite:` rclone remote points at. If that cloud account leaks, the user data leaks too, along with password hashes that can be cracked offline.

**Fix:** make `offsite` an rclone `crypt` remote that wraps the storage remote, and document that in DEPLOYMENT.md.

### Informational

No fix is strictly needed for these.

- **npm audit (6 moderate advisories):**
    - `fflate` 0.7.3 comes in through `satori`, which ships to production. The vulnerable `unzipSync` path only runs on font data, and the fonts are bundled from `@fontsource`, so attacker data can't reach it. Update `satori` when a fixed release is out.
    - `esbuild` ≤0.24 comes in through `drizzle-kit` and the abandoned `@esbuild-kit/*` packages. It is dev-only (used for `db:generate`) and doesn't run a dev server.
    - `npm audit --omit=dev` reports only the `fflate` pair.
- **No real Content-Security-Policy:** `app.ts:77` sets only `frame-ancestors`. A CSP with just `img-src 'self' data: blob: https://images.igdb.com` would have blocked finding 1. A full CSP needs a hash for the inline theme script in `apps/web/index.html:12`.
- **IGDB client secret in the URL:** the Twitch client secret is sent as a URL query parameter (`apps/server/src/igdb/token.ts:47-52`). It's protected by TLS and never logged here, but sending it in a form body would keep it out of URL logs along the way.
- **Avatar decoding:** uploaded avatars are decoded by sharp in `apps/server/src/og/render.ts:30`, on the share-card route, which needs no login. A 31 KB PNG declaring 16000×16000 pixels took about 0.4 s and 110 MB peak on a Mac, and would take longer on the Pi. It's bounded by sharp's default pixel limit and by the card cache. Setting `limitInputPixels: 4096 * 4096` and checking dimensions on upload would tighten it.
- **Deploy pipeline:** it auto-deploys `:latest`. `cloudflared:latest`, `node:22-bookworm-slim` and the GitHub Actions are pinned by tag, not by digest. Pinning by digest would stop a swapped upstream tag from reaching the Pi.
- **Signup reveals registered emails:** intentional and documented in `apps/server/src/routes/auth.ts:122`.
- **Session cookie name:** `gq_session` has no `__Host-` prefix. Adding it would be a small extra hardening step.

## Checked and found clean

- **Secrets:**
    - `.env`, `*.db` and `data/` are in `.gitignore` and `.dockerignore`.
    - None of the 293 commits in git history contains a key.
    - The built web bundle contains no secrets; the only match was help text on an admin page.
    - The ITAD key is sent in a header and Resend uses a bearer token. Neither appears in logs or in admin responses (`server-info.ts` reports only `igdbConfigured`).
    - The download of the IGDB dumps from S3 doesn't send the IGDB token.
- **Injection:**
    - Every database query is a parameterized Drizzle statement.
    - `sql.raw` is only used in `database-stats.ts`. That code is admin-only, and it takes table names from `sqlite_master` and quotes them.
    - The mirror's full-text search turns the input into quoted words, and its id lists go through `json_each(?)`.
    - In IGDB queries, the search text is escaped by `quote()` and ids are integers.
    - There is no shell call, `eval` or user-controlled file path anywhere. Mirror and backup paths are fixed, and the scripts read `.env` by variable name instead of sourcing it.
- **Authentication and access control:**
    - Passwords use argon2id. Session tokens are 32 random bytes and only their SHA-256 hash is stored. The cookie is httpOnly, SameSite=Lax, and Secure in production.
    - Failed logins are rate-limited per account and IP, and per IP. A dummy hash check hides whether a username exists.
    - Changing or resetting a password signs out other sessions and voids reset links. Reset and verification tokens are hashed, single-use, carried in the URL fragment, and checked against the current email.
    - The admin role is read from the database on every request.
    - Every owner route filters by `userId`. Checked: entries, notes, lists and the queue, smart lists, slots (including the `entryId` in the request body), playthroughs, wishlist, grids, tier lists (including the `tierId`) and random pick.
    - Zod strips unknown keys, so a request can't set `role` or other unexpected fields on the account.
- **Web:**
    - There is no `dangerouslySetInnerHTML` or `innerHTML`.
    - Open Graph and meta tags are escaped, and inserted with a function replacer (so `$` patterns in user text can't break them).
    - Social links are validated with a regex and URL-encoded.
    - ITAD shop links can't be `javascript:` URLs, because React 19.3.1 blocks them (confirmed in react-dom).
    - CSRF protection: Hono's `csrf()`, plus an Origin check, plus requiring a JSON content type on mutations.
    - No CORS headers are sent.
    - There is no redirect parameter, so no open redirect.
    - There is no SSRF, since the server only fetches fixed hosts.
- **Files and data:**
    - Avatars are checked by magic bytes, limited to 128 KB, and served with `nosniff` and a content type from a fixed list.
    - Export only includes the signed-in user's data.
    - The import dry run runs inside a transaction that is rolled back.
    - CSV export defuses formula-like cells.
    - Public responses strip notes and email (`toPublicEntry`; `getProfileGame` keeps only public notes) and respect the real-name and activity opt-outs.
- **Error handling and logging:** clients only ever get `Internal server error`, and stack traces stay in the admin-only error log. Logged routes don't include query strings. Reset and verification links are printed to the console only outside production.
- **Config and deployment:**
    - There are no default credentials and no debug mode in production.
    - The container runs as a non-root user.
    - No ports are published, so the trusted proxy headers (`TRUST_PROXY`) can't be spoofed from outside.
    - The firewall and SSH setup in DEPLOYMENT.md is sound, and `.env` is mode 600 on the Pi.
    - Rate-limit tiers cover signup, email, data, share cards and everything that reaches IGDB. IGDB calls also go through a limiter of 4 requests per second and at most 8 open requests.
- **Lockfile:** lockfile v3. All 364 packages resolve from registry.npmjs.org with integrity hashes. No workspace has install scripts, and CI and Docker both use `npm ci`.

## Fix order

1. ~~**Global request body limit** (finding 2). A small change in `app.ts` that removes the only attack that needs no account.~~ Done.
2. ~~**Check IGDB image ids and keep imported rows out of the showcase** (finding 1).~~ Done.
3. ~~**Cap import size, new cache rows and imports per day** (finding 3).~~ Done; import also stopped storing the file's metadata.
4. **Encrypt off-site backups** with an rclone crypt remote (finding 5). This is setup on the Pi plus a docs change.
5. **Bind the dev server to 127.0.0.1** (finding 4).
6. **Lower-priority hardening:**
    - a CSP with `img-src`
    - `limitInputPixels` for avatars
    - moving the Twitch secret into the request body
    - pinning images by digest
    - updating `satori` and `drizzle-kit` once fixed versions are out
