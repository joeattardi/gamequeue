# Deployment

GameQueue runs as a Docker container on a Raspberry Pi on the home network, exposed to the internet through a Cloudflare Tunnel. This file records the decisions and the full procedure: preparing the Pi, building the image, going live, updating and backing up.

## Decisions

- **Host: Raspberry Pi at home**, running Docker. The app is for the owner and maybe a couple of friends, and its resource needs are tiny (a Node process and a SQLite file).
- **Exposure: Cloudflare Tunnel.** A `cloudflared` container on the Pi makes an _outbound_ connection to Cloudflare, and Cloudflare forwards requests for `gamequeue.app` through it. No router port forwarding, no public IP or dynamic DNS, and the home IP address stays hidden.
- **SSL: handled by Cloudflare.** Visitors get HTTPS from Cloudflare's edge certificate (issued and renewed automatically). The hop from Cloudflare to the Pi travels inside the tunnel's own encrypted connection, so the Pi needs **no certificate, no Caddy/nginx and no Let's Encrypt**. Details in "How HTTPS works" below.
- **Domain: `gamequeue.app`**, registered. The DNS zone must be on Cloudflare (step 3). `.app` domains are HTTPS-only (HSTS preload), which suits this setup.
- **Updates: push to `main`.** GitHub Actions checks the code and publishes an arm64 image to GitHub's container registry (GHCR); a cron job on the Pi notices the new image, backs up the database and restarts the app. The Pi only makes outbound connections. The repo is public, so GitHub's native arm64 runners are free.
- **Deploy early**, while still developing. Production-only behaviour (`Secure` cookies, the `Origin`-based CSRF check, `TRUST_PROXY`) and mobile layout are best tested on a real URL. The ground rules are in "Developing while deployed".
- **Likely a single user.** Lock signups once the account exists, and treat backups as essential: losing the database means losing the whole collection.
- **Trade-off to accept:** the site is only as available as the home internet connection and power. If either drops, public profile pages go offline until it returns. The Cloudflare edge answers with an error page in the meantime; nothing is lost.

## Layout

```
Browser --HTTPS--> Cloudflare edge --tunnel--> cloudflared (container) --http--> gamequeue (container, :3000) --> /data/gamequeue.db
```

Both containers are defined in `compose.yaml` and share Docker's private network. **The app publishes no ports** (nothing is reachable at `<pi-ip>:3000`), so the only way in is the tunnel. That matters because with `TRUST_PROXY=true` the login rate limit trusts `X-Forwarded-For`, which anyone could spoof if they could reach the app directly.

Files in the repo that make this work:

| File                           | Purpose                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Dockerfile`                   | Multi-stage build (Node 22, Debian slim), runs as the unprivileged `node` user, health check on `/api/health`                       |
| `compose.yaml`                 | The `gamequeue` and `cloudflared` services                                                                                          |
| `.env.example`                 | Template for the `.env` file on the Pi                                                                                              |
| `.npmrc`                       | `legacy-peer-deps=true`; the lockfile was generated with it, and `npm ci` inside the image fails without it                         |
| `.dockerignore`                | Keeps `node_modules`, `dist`, databases and `.env` out of the build context                                                         |
| `.github/workflows/deploy.yml` | On every push/PR: format check, typecheck, tests. On `main`: builds the arm64 image and pushes it to `ghcr.io/joeattardi/gamequeue` |
| `scripts/update.sh`            | Run by cron on the Pi: pulls the repo and image, and if either changed, backs up, restarts and rolls back on failure                |
| `scripts/backup.sh`            | Safe snapshot of the live SQLite file, 14-day retention, optional off-machine copy                                                  |

On the Pi:

```
~/gamequeue/            git clone of the repo
~/gamequeue/.env        settings and secrets (mode 600, never committed)
~/gamequeue/data/       gamequeue.db (+ -wal and -shm files); mounted into the container at /data
~/gamequeue/backups/    nightly and pre-update snapshots
```

## Configuration

Defined in `apps/server/src/config.ts`. In Docker, `compose.yaml` sets the fixed values and reads the rest from `.env`.

| Variable                               | Value in production                                                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                             | `production` (set in the image; makes the session cookie `Secure` and serves the web app on one port)                                           |
| `PORT`                                 | `3000` (set in the image)                                                                                                                       |
| `DATABASE_PATH`                        | `/data/gamequeue.db` (set in the image; `/data` is the mounted `./data` directory)                                                              |
| `TRUST_PROXY`                          | `true` (set in `compose.yaml`; the login rate limit then sees the client IP, see the caveat below)                                              |
| `ALLOWED_ORIGINS`                      | `https://gamequeue.app` in `.env` (must match the real URL; the CSRF check rejects any other `Origin`)                                          |
| `PUBLIC_URL`                           | Optional; the site's address for link previews (`og:image`). Defaults to the first `ALLOWED_ORIGINS` entry                                      |
| `SIGNUPS_ENABLED`                      | `true` for the first signup, then `false`                                                                                                       |
| `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` | Twitch credentials (see step 10)                                                                                                                |
| `ITAD_API_KEY`, `ITAD_COUNTRY`         | Optional IsThereAnyDeal key for prices on the wishlist and game pages (see Game prices); `ITAD_COUNTRY` (default `US`) picks shops and currency |
| `RESEND_API_KEY`, `NOTIFY_EMAIL`       | Optional signup alerts by email (see Signup email alerts); both must be set, otherwise nothing is sent                                          |
| `NOTIFY_FROM`                          | Optional sender for those emails; defaults to `GameQueue <onboarding@resend.dev>`                                                               |
| `TUNNEL_TOKEN`                         | Cloudflare Tunnel token (see step 4); read by `cloudflared`, not by the app                                                                     |

Without the IGDB credentials the app starts but search and add-game are disabled.

**Rate-limit caveat.** The login limiter keys on the _first_ entry of `X-Forwarded-For`. Cloudflare appends the real client IP to whatever the client sent, so a client that sends its own `X-Forwarded-For` can pick the key and sidestep the per-IP limit. Passwords are argon2id and login errors are generic, so the risk is modest for a personal app, but a fix is to read `CF-Connecting-IP` (which Cloudflare always sets to the true client address) in `clientIp` in `apps/server/src/routes/auth.ts`.

## Step-by-step setup

### 1. Hardware and Raspberry Pi OS

- **Pi 4 (2 GB or more) or Pi 5**, a proper power supply, and wired Ethernet if at all possible. A 32-bit-only board (Pi Zero, Pi 1) is not supported.
- **Storage:** SQLite writes constantly enough to wear out a cheap SD card over time. Prefer booting from a USB SSD (supported on Pi 4 and 5) or at least a high-endurance SD card, and keep the backups from step 11 regardless.
- Optional but cheap insurance: a small UPS or UPS HAT. A power cut mid-write is survivable (SQLite WAL is crash-safe), but a corrupted filesystem is not.

Flash the OS with Raspberry Pi Imager:

1. Choose **Raspberry Pi OS Lite (64-bit)**. No desktop is needed.
2. In the OS customisation settings, set a hostname (for example `gamequeue`), create your user (the first user is normally UID 1000, which step 6 relies on), enable **SSH with public-key authentication** and paste your `~/.ssh/id_ed25519.pub`. Set Wi-Fi only if you cannot use Ethernet, and set your locale and time zone.
3. Boot the Pi and connect: `ssh <user>@gamequeue.local`.

### 2. Secure and update the Pi

```sh
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y git sqlite3 ufw unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# firewall: SSH only. The tunnel needs no inbound ports.
sudo ufw allow OpenSSH
sudo ufw enable
```

In a **second terminal**, confirm you can still SSH in. Then disable password logins (Imager's key setup usually already does):

```sh
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

Check `/etc/ssh/sshd_config.d/*.conf` too: a drop-in file can override that setting.

**Do not forward any ports on your router.** The tunnel is outbound-only; nothing needs to reach the Pi from the internet. Optionally give the Pi a fixed address with a DHCP reservation on your router so SSH always finds it, but the site does not depend on it.

The Pi has no battery-backed clock. It syncs time on boot via `systemd-timesyncd` (enabled by default), which the Twitch token flow and session expiry rely on; check `timedatectl` says `System clock synchronized: yes`.

### 3. Put the domain on Cloudflare

A tunnel's public hostname needs the domain's DNS to be served by Cloudflare.

1. Create a free Cloudflare account and **Add a site**: `gamequeue.app`, on the Free plan.
2. Cloudflare shows two nameservers. At the registrar where `gamequeue.app` is registered, replace the existing nameservers with those two.
3. Wait until Cloudflare shows the site as **Active** (minutes to a few hours). Check with `dig +short NS gamequeue.app`.
4. Remove any old DNS records for the domain (for example an A record pointing at a previous host). The tunnel creates the one it needs in step 4.

### 4. Create the tunnel

In the Cloudflare dashboard open **Zero Trust** (the menu may be labelled "Networks > Tunnels" or "Networks > Connectors" depending on the dashboard version; Cloudflare reorganises it from time to time). Zero Trust asks you to pick a team name on first use and may ask for a payment method even for the free plan; the free plan has no charge for tunnels.

1. **Create a tunnel**, type **Cloudflared**, name it `gamequeue`.
2. On the "install connector" screen, pick any OS and copy the **token**: the long string after `--token` or `service install` in the command shown. Do not run that command; the container does this job. Treat the token like a password: anyone holding it can run a connector for your tunnel.
3. Go to the tunnel's **Published application routes** (or "Public Hostname") tab and add a route:
    - Hostname: `gamequeue.app` (leave the subdomain empty)
    - Service type: **HTTP**
    - URL: `gamequeue:3000` (the compose service name and port, not `localhost`)
4. Optional: add a second route for `www.gamequeue.app` with the same service, and later a redirect rule from `www` to the apex. Skip it if you do not need `www`.

Cloudflare creates the proxied DNS record (`gamequeue.app` CNAME to `<id>.cfargotunnel.com`) for you. The apex works because Cloudflare flattens CNAMEs at the root.

### 5. Install Docker on the Pi

```sh
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Log out and back in so the group applies, then check:

```sh
docker run --rm hello-world
docker compose version
```

Docker starts on boot (`systemctl is-enabled docker` should print `enabled`) and brings the containers back up thanks to `restart: unless-stopped`.

Docker's default logging never rotates, so a chatty container can eventually fill the disk. Cap it:

```sh
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
EOF
sudo systemctl restart docker
```

### 6. Get the code and configure it

```sh
git clone https://github.com/joeattardi/gamequeue.git ~/gamequeue
cd ~/gamequeue
```

For a private repository, create a read-only deploy key (`ssh-keygen -t ed25519 -N '' -f ~/.ssh/gamequeue_deploy`), add the `.pub` file in GitHub under the repo's **Settings > Deploy keys** (leave write access off), and clone with the SSH URL (using `GIT_SSH_COMMAND='ssh -i ~/.ssh/gamequeue_deploy'` or an `~/.ssh/config` entry). Deploy from `main`, never a feature branch.

Create the settings file and the data directory:

```sh
cp .env.example .env
chmod 600 .env
nano .env      # set TUNNEL_TOKEN (step 4); IGDB credentials come in step 10

mkdir -p data backups
sudo chown 1000:1000 data    # the container runs as UID 1000 ("node")
```

The `chown` matters: if the directory does not exist or belongs to root, the app cannot create `gamequeue.db` and exits with `SQLITE_CANTOPEN`. If your Pi user is not UID 1000, still chown to 1000.

### 7. Get the image

`compose.yaml` runs `ghcr.io/joeattardi/gamequeue:latest`, which GitHub Actions builds and publishes on every push to `main` (`.github/workflows/deploy.yml`).

**Once, from your Mac:**

1. Push to `main` and watch the run under the repo's **Actions** tab. When it finishes, the package appears on your GitHub profile under **Packages**.
2. Open the package, **Package settings**, and set visibility to **Public**. New packages start private, and the Pi pulls anonymously. (If you prefer to keep it private, run `docker login ghcr.io` on the Pi with a personal access token that has only `read:packages`.)

The image is then pulled automatically when you start it (step 8).

**Fallback: build on the Pi** if the image is not available, for example before the first workflow run:

```sh
cd ~/gamequeue
docker compose build
```

Expect around 10 minutes on a Pi 4 the first time. If the build dies with `Killed`, it ran out of memory: add swap (`sudo dphys-swapfile swapoff && sudo sed -i 's/^CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile && sudo dphys-swapfile setup && sudo dphys-swapfile swapon`) and retry. The locally built image gets the same tag, and `scripts/update.sh` replaces it with the published one as soon as there is a newer one.

### 8. Start it

```sh
cd ~/gamequeue
docker compose up -d
docker compose ps          # both services Up; gamequeue shows (healthy) after ~20 s
docker compose logs -f     # Ctrl-C to stop following
```

Migrations run at startup. A healthy start logs `GameQueue listening on http://localhost:3000` (and a warning about IGDB credentials until step 10). In the Cloudflare dashboard the tunnel's status turns **Healthy**, and `cloudflared` logs `Registered tunnel connection`.

From any computer:

```sh
curl -s https://gamequeue.app/api/health      # {"ok":true}
curl -I https://gamequeue.app
```

If you see Cloudflare error 1033 or 502, see Troubleshooting.

### 9. First login and lock signups

1. Open `https://gamequeue.app` and create your account.
2. Set `SIGNUPS_ENABLED=false` in `~/gamequeue/.env`, then `docker compose up -d` (this recreates the app container with the new value). Registration now returns 403. Flip it on briefly if a friend needs an account. Admins can also change this without a restart from the Settings tile on `/admin`; a saved choice there overrides the environment value.

### Game prices (optional)

Wishlist and game-page prices come from [IsThereAnyDeal](https://isthereanydeal.com/). Register an app at <https://isthereanydeal.com/apps/> to get an API key, then add to `~/gamequeue/.env`:

```
ITAD_API_KEY=your-key
ITAD_COUNTRY=US
```

Run `docker compose up -d` (a plain restart does not re-read `.env`). Without a key the app works as before and simply shows no prices. Prices are cached (6 hours on the wishlist, 30 minutes on game pages), well inside ITAD's limit of 1000 requests per 5 minutes. Treat the key like a password. Failures show up on `/admin/errors` as "Price refresh".

### Site traffic (optional)

The admin Traffic page (`/admin/traffic`, and a tile on `/admin`) shows requests, page views, visitors, data served and how much Cloudflare answered from its cache, for the last 30 days. It reads Cloudflare's analytics, which already see everything that comes through the tunnel, so nothing is logged on the Pi.

1. In the Cloudflare dashboard open the `gamequeue.app` site. On the **Overview** page, copy the **Zone ID** (right-hand column).
2. Open **My Profile > API Tokens > Create Token > Create Custom Token**. Give it **Zone > Analytics > Read** permission, limited to the `gamequeue.app` zone (the token can read nothing else), and create it. Copy the token; it is shown once.
3. Add to `~/gamequeue/.env`:

```
CLOUDFLARE_API_TOKEN=your-token
CLOUDFLARE_ZONE_ID=your-zone-id
```

4. Run `docker compose up -d` (a plain restart does not re-read `.env`).

Without both values the page says it isn't set up and the app is otherwise unaffected. The server asks Cloudflare at most once every five minutes. Treat the token like a password. If the page shows an error, it quotes Cloudflare's message (a rejected token or a wrong zone ID are the usual causes). The numbers come from Cloudflare's edge, so crawlers and bots are included, days are UTC, and game covers (served by IGDB directly) aren't counted. This has not been checked against a live Cloudflare account yet; if the figures look wrong, compare them with the dashboard's own Analytics.

### 10. IGDB credentials

1. Create a Twitch account with two-factor authentication enabled and open the Twitch developer console.
2. Register an application: OAuth redirect URL `http://localhost`, category "Application Integration", client type **Confidential**.
3. Copy the Client ID and generate a Client Secret. Put them in `~/gamequeue/.env`, then `docker compose up -d`.
4. Try searching for a game in the app to confirm.

IGDB is free for non-commercial use under Twitch's terms, with rate limits and attribution requirements.

### 11. Automatic updates and backups

Install the two cron lines from the Updating section, and see Backups below for the off-machine copy. Do this before entering much data.

### 12. Cloudflare settings worth checking

In the Cloudflare dashboard for `gamequeue.app` (all available on the free plan):

- **SSL/TLS > Overview:** the encryption mode is irrelevant for tunnel traffic, but set it to **Full (strict)** so nothing ever falls back to a weaker mode.
- **SSL/TLS > Edge Certificates:** enable **Always Use HTTPS** and **Automatic HTTPS Rewrites**. HSTS is optional here since `.app` is already on the browser preload list.
- **Security > WAF > Rate limiting rules:** optionally add one rule limiting `POST /api/auth/login` per IP. This also covers the `X-Forwarded-For` caveat above, because Cloudflare keys it on the real client IP.
- Do not put Cloudflare Access (login wall) in front of the whole site: the public profile pages (`/u/:username`) must stay reachable by everyone.

## Signup email alerts

The app can email you when someone creates an account. It uses [Resend](https://resend.com)'s HTTPS API, so there is no SMTP server to run. The email says only that `<username>` signed up (no email address or other details), and it is sent in the background: if Resend is unreachable or rejects the request, the app logs a warning and the signup still succeeds. Accounts created by an admin on the Users page don't trigger it. It is off unless both variables below are set.

### Setup

1. Create a Resend account (the free tier is plenty for this).
2. In the Resend dashboard open **API Keys** and create a key with the "Sending access" permission. Copy it; it is shown once.
3. Add to `~/gamequeue/.env` on the Pi:

    ```
    RESEND_API_KEY=re_xxxxxxxx
    NOTIFY_EMAIL=you@example.com
    ```

    `NOTIFY_EMAIL` must be **the address you registered your Resend account with**. Until you verify a domain, Resend's shared sender (`onboarding@resend.dev`, the default) only delivers to that address.

4. Run `docker compose up -d` (a plain restart does not re-read `.env`).
5. Check it works: with signups on, register a throwaway account and look for "New GameQueue signup" in your inbox (check spam the first time), then delete the account from the Users page.

Treat the API key like a password: `.env` is mode 600 and never committed. If it leaks, delete the key in Resend and make a new one.

### Sending from your own domain (optional)

Only needed if you want a nicer sender or, later, to email other people (password resets, welcome emails). In Resend open **Domains**, add a domain or subdomain (a subdomain such as `mail.gamequeue.app` keeps sending reputation separate), and create the SPF, DKIM and optional DMARC DNS records it shows. Since DNS is on Cloudflare, add them there and set them to **DNS only** (grey cloud). Click Verify, then set:

```
NOTIFY_FROM=GameQueue <alerts@mail.gamequeue.app>
```

and run `docker compose up -d` again.

If something is wrong, `docker compose logs gamequeue` shows a `Notification email failed: <status> <Resend's message>` line.

## Making a user an admin

Roles are `gamer` (default) and `admin`; there is no UI to change them. On the Pi (the host `sqlite3` from step 2 is safe on the live database, and the app picks the change up on the user's next request, no restart or new login):

```sh
sqlite3 ~/gamequeue/data/gamequeue.db "UPDATE users SET role = 'admin' WHERE username = 'jattardi';"
sqlite3 ~/gamequeue/data/gamequeue.db "SELECT username, role FROM users;"
```

For a local dev database use `apps/server/data/gamequeue.db` (or your `DATABASE_PATH`). Set it back with `role = 'gamer'`. Back up first (`scripts/backup.sh`) if you want to be careful.

## How HTTPS works

- **Browser to Cloudflare:** a certificate for `gamequeue.app` that Cloudflare issues and renews itself (Universal SSL). Nothing to buy or install. A brand-new zone can take several minutes to get its first certificate; until then browsers show a certificate error.
- **Cloudflare to the Pi:** `cloudflared` keeps an outbound, encrypted connection to Cloudflare, and requests flow back through it. Because that tunnel is the encryption, the `http://gamequeue:3000` hop inside Docker is not exposed to any network, and no origin certificate is needed.
- **Why it matters for the app:** in production the session cookie is `Secure`. Browsers see HTTPS on `gamequeue.app`, so login works. Reaching the app by plain HTTP some other way (for example `http://<pi-ip>:3000` after publishing the port for debugging) makes login silently fail.

## Updating

Updates are automatic: **push to `main` and wait a few minutes.**

1. GitHub Actions runs the format check, typecheck and tests, and only if they pass builds the arm64 image and publishes it as `ghcr.io/joeattardi/gamequeue:latest` (also tagged with the commit SHA). A failing check means nothing is deployed. Pull requests run the checks but never publish.
2. `scripts/update.sh` runs on the Pi from cron every 2 minutes. It does a `git pull` (so changes to `compose.yaml` and the scripts apply too) and pulls the image. If nothing changed it exits at once.
3. If something changed, it takes a database backup (`scripts/backup.sh`), tags the running image as `gamequeue:previous`, runs `docker compose up -d`, and waits up to a minute for the container's health check. If the new version is not healthy it switches back to the previous image and exits non-zero.

### One-time setup on the Pi

```sh
chmod +x ~/gamequeue/scripts/*.sh
crontab -e
```

Add these two lines (replace `<user>`):

```
*/2 * * * * /home/<user>/gamequeue/scripts/update.sh >> /home/<user>/gamequeue/update.log 2>&1
0 3 * * * /home/<user>/gamequeue/scripts/backup.sh >> /home/<user>/gamequeue/backup.log 2>&1
```

The first line keeps the app current, the second is the nightly backup. Cron runs with a minimal environment; if `docker` is not found, add `PATH=/usr/local/bin:/usr/bin:/bin` as the first line of the crontab. Run `~/gamequeue/scripts/update.sh` by hand once and check `docker compose ps`.

### Everyday use

- **Deploy:** `git push` to `main`. Typically live within 5 to 8 minutes (build, then the next cron tick). Watch the Actions tab; `tail -f ~/gamequeue/update.log` on the Pi shows `update ok`.
- **Deploy right now:** `ssh <user>@gamequeue.local ./gamequeue/scripts/update.sh` forces a check without waiting for cron.
- **Hold deploys:** `crontab -e` and comment out the `update.sh` line, or work on a branch/PR (they never publish).
- **cloudflared:** `cloudflared:latest` is pulled only when missing. Refresh it now and then (monthly is plenty): `docker compose pull cloudflared && docker compose up -d`.

### Rollback

A failed health check rolls back by itself. To go back manually:

```sh
cd ~/gamequeue
crontab -l | sed 's|^\(.*update.sh.*\)$|#\1|' | crontab -   # pause auto-updates, or edit by hand
docker tag gamequeue:previous ghcr.io/joeattardi/gamequeue:latest
docker compose up -d --no-build
```

Migrations are forward-only: if a migration was the problem (or ran before the rollback), also restore the pre-update backup (see Restoring), because the older code may not understand the newer schema. Remember to re-enable the cron line, and fix `main` (revert the commit) so the next push does not redeploy the bad version.

## Developing while deployed

- Only `main` deploys. Use branches and pull requests for anything not ready; they get the checks but never go live.
- Treat the production database as real data. Schema changes need proper migrations (`npm run db:generate`, committed under `apps/server/drizzle/`). Do not expect to recreate the database as was acceptable earlier in development. Check generated SQL for added foreign-key columns, since drizzle-kit drops `ON DELETE` from `ALTER TABLE ... ADD COLUMN ... REFERENCES` on SQLite.
- Keep a separate local dev database; never point a laptop at the Pi's file.
- Each finished milestone becomes a deploy.
- To try the production image locally: `docker build -t gamequeue:test . && docker run --rm -p 3000:3000 -v "$PWD/data-test:/data" -e ALLOWED_ORIGINS=http://localhost:3000 gamequeue:test`. Over plain HTTP the `Secure` cookie is dropped by most browsers, so log in via `http://localhost` (browsers treat localhost as secure) rather than a LAN IP.

## SQLite and concurrency

The app uses `better-sqlite3` in WAL mode (`apps/server/src/db/client.ts`). Readers never block writers, writes are tiny and serialized, and the synchronous driver means requests in one process cannot interleave mid-transaction. That is plenty for a small multi-user app.

- No `busy_timeout` is set. That is fine with a single process. If a second process ever writes to the same file, add `sqlite.pragma('busy_timeout = 5000')`.
- SQLite needs one process on one machine and does not work over network filesystems. Keep `./data` on the Pi's local disk, not an NFS/SMB share. Never run two copies of the app container against the same directory.

## Backups

Never copy the `.db` file while the app runs: in WAL mode recent data lives in a separate `-wal` file, so a plain copy can be inconsistent. Use `sqlite3 ... ".backup"` (or `VACUUM INTO`), which is safe on a live database. The `sqlite3` CLI installed on the Pi host (step 2) works directly on the bind-mounted `./data` directory, so nothing extra is needed in the image.

Approach: a nightly snapshot kept locally for 14 days, plus a copy off the machine. A local-only backup does not survive loss of the Pi or its disk, and a home Pi is exactly the kind of machine that gets unplugged, spilled on or hit by a power surge.

### Backup script

`scripts/backup.sh` (in the repo) does the snapshot: `sqlite3 .backup` into `~/gamequeue/backups/gamequeue-<date-time>.db.gz`, an integrity check that refuses to keep a damaged snapshot, deletion of snapshots older than 14 days, and an `rclone copy` to a remote named `offsite` if one is configured. `scripts/update.sh` runs it before every update, and the nightly cron line from "Updating" runs it at 03:00. Both run as your Pi user, who owns the data directory.

Every run also writes `~/gamequeue/data/backup-status.json` (success or failure), which the **Admin > Backups** panel in the app reads: last run, last success, whether the off-site upload worked, and a red banner if the last run failed or no backup has succeeded in 26 hours. This is the way to notice a silently broken cron job or B2 key. The file lives in `data/` because that is the only directory the container can see.

### Monitoring with healthchecks.io

The admin panel only helps when you look at it, and it can't notice a dead Pi or a cron job that never runs. `backup.sh` therefore also pings [healthchecks.io](https://healthchecks.io) when `HEALTHCHECK_URL` is set: `/start` when it begins, a plain ping on success, and `/fail` (with the error text) on failure. If no ping arrives within the check's period plus grace, healthchecks.io emails you, and again when it recovers.

1. In healthchecks.io create a check for the nightly job: period **1 day**, grace **a few hours** (the job runs at 03:00), and an email integration.
2. Copy its ping URL (`https://hc-ping.com/<uuid>`) and add it to `~/gamequeue/.env` on the Pi: `HEALTHCHECK_URL=https://hc-ping.com/<uuid>`. The script reads that one line from `.env` (or the environment); the app and compose ignore it. Treat the URL as a secret, since anyone holding it can fake a success.
3. Run `~/gamequeue/scripts/backup.sh` by hand and check the check turns green in the dashboard.

Pings never fail the backup (short timeout, a few retries, errors ignored). `update.sh` runs the backup before each update, so those runs ping too; extra pings are harmless. Healthchecks does not email on every success, only on down and recovery.

### Uptime monitoring with UptimeRobot

The healthchecks.io check only proves the Pi and cron were alive at 03:00; it would take up to a day to notice a crashed app. The container's own `HEALTHCHECK` only marks it unhealthy (and `update.sh` reads it), nothing notifies you. So an outside service polls the public URL, which also covers the Docker, app and Cloudflare tunnel path end to end.

1. In [UptimeRobot](https://uptimerobot.com) add a monitor: type **HTTP(s)**, URL `https://gamequeue.app/api/health`, interval 5 minutes (the free plan's minimum).
2. Optionally set keyword monitoring for `"ok":true`, so a Cloudflare error page that still returns 200 counts as down.
3. Add your email as an alert contact. It emails when the monitor goes down and again when it recovers.
4. To test it, run `docker compose stop gamequeue` on the Pi, wait for the alert, then `docker compose start gamequeue`.

No app configuration is needed: `/api/health` is public and returns `{"ok":true}`. A crash the app can report itself (an uncaught exception) lands in **Admin > Errors**, and so does a hard kill (out of memory, `kill -9`, power loss), reported as "Stopped without shutting down" the next time the app starts. What only this monitor catches is the app staying down: nothing runs to report it.

Run it once by hand and confirm a `.db.gz` file appears in `~/gamequeue/backups`:

```sh
~/gamequeue/scripts/backup.sh && ls -l ~/gamequeue/backups
```

### Off-machine copy

Pick one:

- **Backblaze B2, S3 or similar via rclone** (cheap, recommended): `sudo apt install -y rclone`, then `rclone config` and create a remote named `offsite`. Set a lifecycle rule on the bucket to expire old files.
- **rsync or SFTP to another machine** you own (a NAS, a desktop that is on at night).
- A second USB drive with a weekly copy is better than nothing, but it sits in the same house.

Alternatives considered:

- Backup inside the app via `better-sqlite3`'s `db.backup(path)`. Works on a live database, but adds code for something cron does well.
- Litestream: continuous WAL streaming to S3-compatible storage. Strongest (loses seconds, not up to a day), but another service and overkill for a personal app.

The app's own JSON export (`/api/data/export`) is a good second layer: it is portable across schema changes, and import is a merge into any instance. Also consider making an image of the SD card/SSD after the setup is working, so rebuilding the Pi is quick.

### Restoring

```sh
cd ~/gamequeue
docker compose stop gamequeue
mkdir -p data/old && mv data/gamequeue.db* data/old/
gunzip -c backups/gamequeue-YYYY-MM-DD-HHMMSS.db.gz > data/gamequeue.db
sudo chown 1000:1000 data/gamequeue.db
docker compose start gamequeue
```

Try a restore on a scratch machine once, so the first time is not during an emergency.

## Troubleshooting

| Symptom                                                           | Likely cause                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare error 1033 ("Argo Tunnel error")                       | `cloudflared` is not connected: container stopped, wrong `TUNNEL_TOKEN`, or the Pi has no internet. Check `docker compose logs cloudflared`.                                                                                                                  |
| Cloudflare 502 Bad Gateway                                        | Tunnel is up but the app is not answering: crashed or still starting, or the route's URL is not exactly `http://gamequeue:3000`. Check `docker compose ps` and logs.                                                                                          |
| Browser certificate error on a brand-new domain                   | Cloudflare is still issuing the edge certificate; wait a few minutes. Also confirm the zone is Active (step 3).                                                                                                                                               |
| Site loads but login fails / "forbidden" on writes                | `ALLOWED_ORIGINS` doesn't exactly match `https://gamequeue.app` (scheme, no trailing slash), or you are on plain HTTP.                                                                                                                                        |
| App container restarts, logs show `SQLITE_CANTOPEN`               | `./data` is missing or not owned by UID 1000: `sudo chown 1000:1000 data`.                                                                                                                                                                                    |
| Everyone shares one login rate limit                              | `TRUST_PROXY` is not `true` (it is set in `compose.yaml`), so every request appears to come from the tunnel container.                                                                                                                                        |
| `docker compose` complains about `TUNNEL_TOKEN` / origins         | `.env` is missing or incomplete; compose refuses to start without `TUNNEL_TOKEN` and `ALLOWED_ORIGINS`.                                                                                                                                                       |
| No prices on the wishlist or game pages                           | `ITAD_API_KEY` unset or wrong in `.env`, or `docker compose up -d` not run after editing it. Check `/admin/errors` for "Price refresh" entries.                                                                                                               |
| Search and add-game disabled                                      | IGDB credentials missing or wrong in `.env`; after editing, run `docker compose up -d` (a plain restart does not re-read `.env`).                                                                                                                             |
| No signup alert email arrives                                     | `RESEND_API_KEY` or `NOTIFY_EMAIL` unset, or `docker compose up -d` not run after editing `.env`. Without a verified domain, `NOTIFY_EMAIL` must be your Resend account's own address. Check `docker compose logs gamequeue` for `Notification email failed`. |
| `curl` DELETE/logout returns 403                                  | Body-less mutations need an `Origin` header (browsers send it; curl must add it).                                                                                                                                                                             |
| `docker compose` says `denied` / `unauthorized` pulling the image | The GHCR package is still private: make it public (step 7) or `docker login ghcr.io`.                                                                                                                                                                         |
| Pushed to `main` but nothing changed on the site                  | Check the Actions run passed (failed checks never publish), then `tail ~/gamequeue/update.log` and that the cron line is installed (`crontab -l`).                                                                                                            |
| Build dies with `Killed`                                          | Out of memory while building on the Pi; add swap (step 7), or use the published image instead of building on the Pi.                                                                                                                                          |
| `npm ci` in the build reports the lockfile is out of sync         | `.npmrc` (`legacy-peer-deps=true`) is missing from the build context.                                                                                                                                                                                         |
| Site went down after a power cut                                  | Check the Pi booted and `docker compose ps`; if the filesystem is damaged, restore from a backup onto a fresh card/SSD.                                                                                                                                       |

Useful commands: `docker compose ps`, `docker compose logs -f gamequeue`, `docker compose logs -f cloudflared`, `docker stats`, `docker compose exec gamequeue sh`.

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
