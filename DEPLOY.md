# Deployment notes

Plan for running GameQueue on a Hetzner VPS, with step-by-step setup instructions. Nothing here is set up yet; this records the decisions and the procedure.

## Decisions so far

- **Host: Hetzner Cloud VPS**, not a Raspberry Pi. The app is for the owner and maybe a couple of friends, but the public profile pages (`/u/:username`) need to be reachable all the time. A VPS gives a public IP and a datacenter connection, with no home port forwarding or tunnel and no SD card to wear out.
- **Cost:** Hetzner raised prices twice in 2026 and the plan lineup is in flux (the budget CX and Arm CAX lines were reported sold out in September 2026). Expect roughly EUR 5.50-6/month net for the smallest orderable plan, plus EUR 0.50/month for the IPv4 address, so about $85-100/year. A Pi kit is $250+ plus power, so the VPS wins for about the first 3 years. Check Hetzner's cloud pricing page for the current cheapest plan; the app only needs 1 vCPU, 1-2 GB RAM and a few GB of disk. Cheaper hosts exist (Vultr, IONOS, Contabo, RackNerd, Oracle's always-free tier) but save only a few dollars a year, with more variable quality or signup caveats.
- **Keep the public IPv4 address** (about $6/year). Going IPv6-only or using a tunnel would save that, but the server needs outbound IPv4 for IGDB/Twitch, GitHub and npm, and the workarounds (NAT64, DNS challenge behind Cloudflare) are not worth the effort.
- **Domain: `gamequeue.app`**, registered. `.app` domains are HTTPS-only (HSTS preload), which fits the Caddy setup. Use a registrar with free WHOIS privacy and turn on auto-renew.
- **Deploy early**, while still developing. Production-only behaviour (`Secure` cookies, the `Origin`-based CSRF check, `TRUST_PROXY`, Caddy) and mobile layout are best tested on a real URL, and real data teaches more than test data. The ground rules are in "Developing while deployed" below.
- **Likely a single user.** Lock signups once the account exists, and treat backups as essential: losing the database means losing the whole collection.

## Layout

```
Internet :443 -> Caddy (automatic Let's Encrypt cert) -> Node on port 3000 -> SQLite file
```

`NODE_ENV=production` makes the Node process serve the API and the built web app from one port (`apps/server/src/index.ts`), so there is no separate static file server. A reverse proxy is only needed for HTTPS: in production the session cookie is `Secure`, so login silently fails over plain HTTP.

- **Caddy** terminates TLS and obtains and renews certificates itself. nginx works too, but needs certbot and more config.
- **Node app** runs as a systemd service under an unprivileged `gamequeue` user.
- **Firewall** allows only 22, 80 and 443. The app listens on all interfaces (the server calls `serve({ port })` with no hostname), so the firewall is what keeps port 3000 private. This matters because with `TRUST_PROXY=true` the login rate limit trusts `X-Forwarded-For`, which is spoofable if anyone can reach port 3000 directly.

Server directory layout:

```
/srv/gamequeue/app        git clone of the repo (built in place)
/srv/gamequeue/data       gamequeue.db (+ -wal and -shm files)
/srv/gamequeue/backups    nightly snapshots
/srv/gamequeue/backup.sh  backup script (run from cron)
/etc/gamequeue.env        environment file (root-owned, mode 600)
/etc/systemd/system/gamequeue.service
/etc/caddy/Caddyfile
```

## Environment variables

Defined in `apps/server/src/config.ts`.

| Variable                               | Value in production                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `NODE_ENV`                             | `production`                                                                                 |
| `PORT`                                 | `3000`                                                                                       |
| `DATABASE_PATH`                        | `/srv/gamequeue/data/gamequeue.db`                                                           |
| `ALLOWED_ORIGINS`                      | `https://gamequeue.app` (must match the real URL; the CSRF check rejects any other `Origin`) |
| `TRUST_PROXY`                          | `true`, only because Caddy is in front; makes the login rate limit see the real client IP    |
| `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` | Twitch credentials (see step 12)                                                             |
| `SIGNUPS_ENABLED`                      | `true` for the first signup, then `false`                                                    |

Without the IGDB credentials the app starts but search and add-game are disabled.

## Step-by-step setup

Commands assume Ubuntu 24.04 LTS. Replace `you` with your admin username. Commands starting `sudo -u gamequeue` run as the app user.

### 1. Create the server

1. In the Hetzner Cloud Console, create a project, then **Add Server**.
2. Pick a location near you, image **Ubuntu 24.04**, and the smallest x86 plan that shows a working Create button. Keep the IPv4 address enabled.
3. Add your SSH public key (paste `~/.ssh/id_ed25519.pub`). Do not rely on an emailed root password.
4. Optional: enable Hetzner's automatic server backups (about 20% of the server price) as an extra layer on top of the SQLite backups below.
5. Optional: create a Cloud Firewall allowing inbound TCP 22, 80 and 443 and attach it to the server. This is a second layer on top of `ufw` (step 3).
6. Create it and note the IPv4 address.

### 2. Point DNS at the server

At your registrar (or wherever `gamequeue.app` DNS is managed), add:

| Type  | Name  | Value                        |
| ----- | ----- | ---------------------------- |
| A     | `@`   | the server's IPv4 address    |
| AAAA  | `@`   | the server's IPv6 (optional) |
| CNAME | `www` | `gamequeue.app` (optional)   |

If the DNS is on Cloudflare, set the records to **DNS only** (grey cloud) so Caddy can reach Let's Encrypt directly. Check propagation before starting Caddy; Let's Encrypt rate-limits repeated failures:

```sh
dig +short gamequeue.app
```

### 3. Secure the server

SSH in as root once (`ssh root@<ip>`), then:

```sh
# admin user with sudo and your key
adduser you
usermod -aG sudo you
rsync --archive --chown=you:you ~/.ssh /home/you

# firewall: SSH, HTTP (certificate challenge + redirect), HTTPS
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# automatic security updates
apt update && apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

In a **second terminal**, confirm `ssh you@<ip>` works and `sudo` works. Then disable root and password logins:

```sh
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

Check `/etc/ssh/sshd_config.d/*.conf` too: a drop-in file can override those settings.

### 4. Install Node, Caddy and tools

Node 22 LTS (dev runs Node 22; `package.json` requires 20 or newer):

```sh
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git sqlite3 build-essential python3
node -v
```

`build-essential` and `python3` are only a fallback in case the native modules (`better-sqlite3`, argon2) have no prebuilt binary for the platform.

Caddy, from its official repository:

```sh
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

### 5. Create the app user and directories

```sh
sudo useradd --system --create-home --home-dir /srv/gamequeue --shell /bin/bash gamequeue
sudo -u gamequeue mkdir -p /srv/gamequeue/data /srv/gamequeue/backups
```

### 6. Get the code

If the repository is public, clone it over HTTPS. If it is private, create a read-only deploy key:

```sh
sudo -u gamequeue ssh-keygen -t ed25519 -N '' -f /srv/gamequeue/.ssh/id_ed25519
sudo cat /srv/gamequeue/.ssh/id_ed25519.pub
```

Add that public key in GitHub under the repo's **Settings > Deploy keys** (leave write access off), then:

```sh
sudo -u gamequeue git clone git@github.com:joeattardi/gamequeue.git /srv/gamequeue/app
```

Deploy from `main`, not a feature branch.

### 7. Build

```sh
sudo -u gamequeue bash -c 'cd /srv/gamequeue/app && npm ci && npm run build'
```

If the build dies with `Killed`, the server ran out of memory. Add swap and retry:

```sh
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
```

### 8. Create the environment file

```sh
sudo tee /etc/gamequeue.env >/dev/null <<'EOF'
NODE_ENV=production
PORT=3000
DATABASE_PATH=/srv/gamequeue/data/gamequeue.db
ALLOWED_ORIGINS=https://gamequeue.app
TRUST_PROXY=true
SIGNUPS_ENABLED=true
IGDB_CLIENT_ID=
IGDB_CLIENT_SECRET=
EOF
sudo chmod 600 /etc/gamequeue.env
sudo nano /etc/gamequeue.env   # fill in the IGDB credentials (step 12)
```

### 9. Create the systemd service

The working directory must be `apps/server`: the app finds the built web app at `../web/dist` and its migrations relative to there.

```sh
sudo tee /etc/systemd/system/gamequeue.service >/dev/null <<'EOF'
[Unit]
Description=GameQueue
After=network-online.target
Wants=network-online.target

[Service]
User=gamequeue
Group=gamequeue
WorkingDirectory=/srv/gamequeue/app/apps/server
EnvironmentFile=/etc/gamequeue.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/srv/gamequeue/data

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now gamequeue
sudo systemctl status gamequeue
```

Migrations run at startup. Smoke test locally on the server:

```sh
curl -s http://127.0.0.1:3000/ | head -5      # should print the app's HTML
journalctl -u gamequeue -n 50 --no-pager      # logs
```

### 10. Configure Caddy and get the SSL certificate

There is nothing to buy or install for HTTPS. Caddy requests a free Let's Encrypt certificate and renews it automatically, as long as DNS (step 2) points at the server and ports 80 and 443 are open.

```sh
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
gamequeue.app {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}

www.gamequeue.app {
    redir https://gamequeue.app{uri} permanent
}
EOF
sudo systemctl reload caddy
```

Drop the `www` block if you did not add that DNS record. Then verify:

```sh
curl -I https://gamequeue.app
journalctl -u caddy -n 50 --no-pager
```

### 11. First login and lock signups

1. Open `https://gamequeue.app` and create your account.
2. Set `SIGNUPS_ENABLED=false` in `/etc/gamequeue.env`, then `sudo systemctl restart gamequeue`. Registration now returns 403. Flip it on briefly if a friend needs an account.

### 12. IGDB credentials

1. Create a Twitch account with two-factor authentication enabled and open the Twitch developer console.
2. Register an application: OAuth redirect URL `http://localhost`, category "Application Integration", client type **Confidential**.
3. Copy the Client ID and generate a Client Secret. Put them in `/etc/gamequeue.env` and `sudo systemctl restart gamequeue`.
4. Try searching for a game in the app to confirm.

IGDB is free for non-commercial use under Twitch's terms, with rate limits and attribution requirements.

### 13. Set up backups

See the Backups section below, and do it before entering much data.

## Updating

```sh
sudo -u gamequeue /srv/gamequeue/backup.sh     # snapshot first
sudo -u gamequeue bash -c 'cd /srv/gamequeue/app && git pull --ff-only && npm ci && npm run build'
sudo systemctl restart gamequeue
journalctl -u gamequeue -n 30 --no-pager
```

Run `npm test` and `npm run typecheck` before pushing to `main`: a bad push goes straight to the live site. A restart takes a few seconds.

Rollback: `git checkout <previous-commit>`, rebuild, restart. Migrations are forward-only, so if a migration was the problem, restore the pre-update backup (see Restoring).

## Developing while deployed

- Deploy only from `main` (or a `release` branch); never track a feature branch.
- Treat the production database as real data. Schema changes need proper migrations (`npm run db:generate`, committed under `apps/server/drizzle/`). Do not expect to recreate the database as was acceptable earlier in development. Check generated SQL for added foreign-key columns, since drizzle-kit drops `ON DELETE` from `ALTER TABLE ... ADD COLUMN ... REFERENCES` on SQLite.
- Keep a separate local dev database; never point a laptop at the server's file.
- Each finished milestone becomes a deploy.

## SQLite and concurrency

The app uses `better-sqlite3` in WAL mode (`apps/server/src/db/client.ts`). Readers never block writers, writes are tiny and serialized, and the synchronous driver means requests in one process cannot interleave mid-transaction. That is plenty for a small multi-user app.

- No `busy_timeout` is set. That is fine with a single process. If a second process ever writes to the same file, add `sqlite.pragma('busy_timeout = 5000')`.
- SQLite needs one process on one machine and does not work over network filesystems.

## Backups

Never copy the `.db` file while the app runs: in WAL mode recent data lives in a separate `-wal` file, so a plain copy can be inconsistent. Use `sqlite3 ... ".backup"` (or `VACUUM INTO`), which is safe on a live database.

Approach: a nightly snapshot kept locally for 14 days, plus a copy off the machine. A local-only backup does not survive disk loss.

### Backup script

Save as `/srv/gamequeue/backup.sh` (owned by `gamequeue`, `chmod 755`):

```sh
#!/bin/bash
set -euo pipefail

DB=/srv/gamequeue/data/gamequeue.db
OUT=/srv/gamequeue/backups
STAMP=$(date +%F)
FILE="$OUT/gamequeue-$STAMP.db"

mkdir -p "$OUT"
sqlite3 "$DB" ".backup '$FILE'"

# refuse to keep (or upload) a damaged snapshot
if [ "$(sqlite3 "$FILE" 'PRAGMA integrity_check;')" != "ok" ]; then
    echo "integrity check failed for $FILE" >&2
    rm -f "$FILE"
    exit 1
fi

gzip -f "$FILE"
find "$OUT" -name 'gamequeue-*.db.gz' -mtime +14 -delete

# off-machine copy, if an rclone remote named "offsite" is configured
if command -v rclone >/dev/null && rclone listremotes | grep -q '^offsite:'; then
    rclone copy "$FILE.gz" offsite:gamequeue-backups/
fi
```

Schedule it nightly from the `gamequeue` user's crontab (`sudo -u gamequeue crontab -e`):

```
0 3 * * * /srv/gamequeue/backup.sh >> /srv/gamequeue/backup.log 2>&1
```

Run it once by hand and confirm a `.db.gz` file appears in `/srv/gamequeue/backups`.

### Off-machine copy

Pick one:

- **Backblaze B2, S3 or similar via rclone** (cheap, recommended): `sudo apt install -y rclone`, then `sudo -u gamequeue rclone config` and create a remote named `offsite`. Set a lifecycle rule on the bucket to expire old files.
- **Hetzner Storage Box** over `rsync` or SFTP: a few EUR/month, same datacenter network.
- **rsync to another machine** you own.

Alternatives considered:

- Backup inside the app via `better-sqlite3`'s `db.backup(path)`. Works on a live database, but adds code for something cron does well.
- Litestream: continuous WAL streaming to S3-compatible storage. Strongest (loses seconds, not up to a day), but another service and overkill for a personal app.

The app's own JSON export (`/api/data/export`) is a good second layer: it is portable across schema changes, and import is a merge into any instance. Hetzner's server backups/snapshots are a third layer for rebuilding the whole machine.

### Restoring

```sh
sudo systemctl stop gamequeue
cd /srv/gamequeue/data
sudo -u gamequeue mkdir -p old && sudo -u gamequeue mv gamequeue.db* old/
sudo -u gamequeue bash -c 'gunzip -c /srv/gamequeue/backups/gamequeue-YYYY-MM-DD.db.gz > gamequeue.db'
sudo systemctl start gamequeue
```

Try a restore on a scratch machine once, so the first time is not during an emergency.

## Troubleshooting

| Symptom                                            | Likely cause                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Caddy can't get a certificate                      | DNS doesn't point at the server yet, or port 80 is blocked (check `ufw status` and the Hetzner firewall). See `journalctl -u caddy`. |
| Site loads but login fails / "forbidden" on writes | `ALLOWED_ORIGINS` doesn't exactly match `https://gamequeue.app`, or you are on plain HTTP.                                           |
| Everyone shares one login rate limit               | `TRUST_PROXY` is not `true`, so every request appears to come from Caddy at 127.0.0.1.                                               |
| Service won't start                                | `journalctl -u gamequeue -n 50`; check the env file and that `npm run build` produced `apps/server/dist`.                            |
| Search and add-game disabled                       | IGDB credentials missing or wrong in `/etc/gamequeue.env`.                                                                           |
| `curl` DELETE/logout returns 403                   | Body-less mutations need an `Origin` header (browsers send it; curl must add it).                                                    |
| Build dies with `Killed`                           | Out of memory while building; add swap (step 7).                                                                                     |

## Moving to PostgreSQL later

Not planned, and not needed at this scale. Moderate effort if it ever is (a few days plus a data migration):

- About 167 synchronous `.get()` / `.all()` / `.run()` calls become async, touching most of the 23 service and route files. This is the bulk of the work.
- The 19 `db.transaction((tx) => ...)` blocks become async callbacks.
- `schema.ts` moves from `sqlite-core` to `pg-core` (identity columns, `bigint` for the millisecond timestamps), and migrations are regenerated from scratch.
- About 26 raw SQL spots need equivalents: `unixepoch() * 1000` defaults, `instr(lower(...))` search (becomes `strpos` or `ILIKE`), `res.changes` (becomes `rowCount`).
- Tests currently use in-memory SQLite; they would need a Postgres test database (Testcontainers or PGlite).
- Data moves via the existing export/import feature.

Partial unique indexes and the Drizzle query-builder code carry over largely unchanged. Reasons to actually switch would be multiple app servers, heavy concurrent writes, or wanting managed backups and replicas.

## IGDB request volume

For one to a few users, IGDB's limit (4 requests/second) is not a concern. What already keeps requests down:

- Game metadata is fetched once per game and shared across users (`ensureGame` in `services/games.ts`); cached metadata is never re-fetched.
- The platform list is synced once, then served from the database.
- Search results are cached in memory for 5 minutes (`routes/igdb.ts`, `TtlCache`), and the search box is debounced by 300 ms.
- Requests are throttled by `RequestLimiter`, and the Twitch token is cached.
- Import never calls IGDB; the export file carries a metadata snapshot per game.

If it ever matters: raise the search cache TTL (search results barely change), or persist the cache in SQLite so it survives restarts.
