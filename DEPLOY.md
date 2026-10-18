# Deployment notes

Plan for running GameQueue on a Hetzner VPS. Nothing here is set up yet; this records the decisions so far.

## Hosting choice: Hetzner VPS vs Raspberry Pi

A Hetzner VPS (about EUR 4-5/month, e.g. CX22) is cheaper than a Raspberry Pi kit (over $250 plus about $5-10/year for power) for the first 4-5 years, and break-even is around that point. The VPS also gives a public IP and a datacenter connection with no hardware to look after. A Pi only wins if it runs for 5+ years (SD cards fail, so budget an SSD) or is wanted for other projects. It also has to be exposed from home (Cloudflare Tunnel, Tailscale, or port forward plus dynamic DNS).

## Layout

```
Internet :443 -> Caddy (automatic Let's Encrypt cert) -> Node on 127.0.0.1:3000 -> SQLite file
```

`NODE_ENV=production npm start` serves the API and the built web app from one port, so no separate static file server is needed. A reverse proxy is only needed for HTTPS: in production the session cookie is `Secure`, so login silently fails over plain HTTP.

- **Caddy** terminates TLS and renews certificates itself. nginx works too, but needs certbot and more config.
- **Node app** runs as a systemd service under an unprivileged user with `Restart=always`.
- **Data directory** holds the SQLite file and the nightly backups.
- **Firewall** (`ufw`) allows only 22, 80 and 443. Port 3000 stays bound to localhost.

Caddyfile:

```
games.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

## Environment variables

Defined in `apps/server/src/config.ts`.

| Variable                               | Value in production                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                             | `production`                                                                                     |
| `PORT`                                 | `3000`                                                                                           |
| `DATABASE_PATH`                        | e.g. `/srv/gamequeue/data/gamequeue.db`                                                          |
| `ALLOWED_ORIGINS`                      | `https://games.example.com` (must match the real URL; the CSRF check rejects any other `Origin`) |
| `TRUST_PROXY`                          | `true`, only because Caddy is in front; makes the login rate limit see the real client IP        |
| `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` | Twitch credentials                                                                               |
| `SIGNUPS_ENABLED`                      | `false` once the wanted accounts exist                                                           |

Keep these in a root-owned `.env` file that the systemd unit reads.

## Deploy steps

1. Create the server, add an SSH key, disable password SSH login.
2. Install Node (same version as dev), Caddy and sqlite3.
3. Clone the repo, run `npm ci && npm run build`, and create the `.env` file.
4. Add the systemd unit, point the domain's DNS at the server IP, start Caddy.
5. To update: `git pull && npm ci && npm run build && systemctl restart gamequeue`. Migrations run at startup.

Docker (app plus Caddy in compose) is a reasonable alternative, but plain systemd is less to maintain for one app on one server.

## SQLite and concurrency

The app uses `better-sqlite3` in WAL mode (`apps/server/src/db/client.ts`). Readers never block writers, writes are tiny and serialized, and the synchronous driver means requests in one process cannot interleave mid-transaction. That is plenty for a small multi-user app.

- No `busy_timeout` is set. That is fine with a single process. If a second process ever writes to the same file, add `sqlite.pragma('busy_timeout = 5000')`.
- SQLite needs one process on one machine and does not work over network filesystems.

## Backups

Never copy the `.db` file while the app runs: in WAL mode recent data lives in a separate `-wal` file, so a plain copy can be inconsistent. Use `sqlite3 ... ".backup"` (or `VACUUM INTO`), which is safe on a live database.

Planned approach: a nightly cron job plus an off-machine copy.

```sh
#!/bin/sh
set -e
DB=/srv/gamequeue/data/gamequeue.db
OUT=/srv/gamequeue/backups
mkdir -p "$OUT"
sqlite3 "$DB" ".backup '$OUT/gamequeue-$(date +%F).db'"
find "$OUT" -name 'gamequeue-*.db' -mtime +14 -delete
```

Crontab: `0 3 * * * /srv/gamequeue/backup.sh`

A local backup does not survive disk loss, so also copy the snapshots elsewhere (Hetzner Storage Box, Backblaze B2 or S3 via `rclone copy`, or `rsync` to another machine).

Alternatives considered:

- Backup inside the app via `better-sqlite3`'s `db.backup(path)`. Works on a live database, but adds code for something cron does well.
- Litestream: continuous WAL streaming to S3-compatible storage. Strongest, but another service and overkill for a personal app.

The app's own JSON export (`/api/data/export`) is a good second layer: it is portable across schema changes and users can run it themselves.

## Moving to PostgreSQL later

Not planned, and not needed at this scale. Moderate effort if it ever is (a few days plus a data migration):

- About 167 synchronous `.get()` / `.all()` / `.run()` calls become async, touching most of the 23 service and route files. This is the bulk of the work.
- The 19 `db.transaction((tx) => ...)` blocks become async callbacks.
- `schema.ts` moves from `sqlite-core` to `pg-core` (identity columns, `bigint` for the millisecond timestamps), and migrations are regenerated from scratch.
- About 26 raw SQL spots need equivalents: `unixepoch() * 1000` defaults, `instr(lower(...))` search (becomes `strpos` or `ILIKE`), `res.changes` (becomes `rowCount`).
- Tests currently use in-memory SQLite; they would need a Postgres test database (Testcontainers or PGlite).
- Data moves via the existing export/import feature.

Partial unique indexes and the Drizzle query-builder code carry over largely unchanged. Reasons to actually switch would be multiple app servers, heavy concurrent writes, or wanting managed backups and replicas.
