# GameQueue: Cloud Migration Plan

Moving GameQueue from the Raspberry Pi to a cloud VPS. Decisions are recorded one at a time, in order.

## 1. Hosting provider: DigitalOcean

GameQueue moves to a DigitalOcean Droplet in a US region, at about $7 a month all in (see decision 3 for why there are no Droplet backups).

| Item    | Choice                                                          | Monthly cost (USD) |
| ------- | --------------------------------------------------------------- | ------------------ |
| Droplet | Basic, 1 shared vCPU, 1 GiB RAM, 25 GiB SSD, 1,000 GiB transfer | $6.00              |
| Domain  | Registrar of choice                                             | about $1           |
| Region  | NYC3 (see decision 5)                                           | n/a                |

**Why DigitalOcean over Hetzner:** most users are in the US. Hetzner's cheap shared plans are Germany and Finland only. Its US plans start around $20.49 for 2 GB of RAM, so DigitalOcean is cheaper where the users are.

**Why the $6 plan (1 GiB):** the user base is one person, maybe up to half a dozen, so the cheapest plan that runs the stack is enough. The stack is Docker, one Node process with SQLite, and `cloudflared`, roughly 450 to 700 MB in total (an estimate, not measured). Nothing is built on the box, since CI builds the image. The risky moments are `docker compose pull` during an update and a share-card render (capped by an in-memory LRU of 32). The mitigations are 2 GB of swap and the Docker log caps.

**Check after a week:** run `free -m` and `docker stats`, and look at `/admin/errors` for `unclean_shutdown`. If swap is in constant use or the app is being killed, resize to the $12 plan (2 GiB).

**Resizing in place:** Droplet > Resize keeps the OS, Docker, containers, `.env`, data and IP address, and takes a few minutes of downtime. Choose **CPU and RAM only**, which stays reversible (the disk remains 25 GiB). A disk resize is permanent, since a disk can't shrink again. Take a manual snapshot first and delete it afterwards. Docker restarts the containers on boot, so check `docker compose ps` afterwards.

**Disk:** 25 GiB is plenty for the app, its cache of loaded games, two image versions during an update and 14 days of backups. If IGDB mirroring is added later (decision 2) and its measured size needs more, add a Volume (about $0.10 per GB per month, growable but not shrinkable) or do a disk resize then.

The $6 (1 GiB, 25 GiB SSD, 1,000 GiB transfer) and $12 (2 GiB, 50 GiB SSD, 2,000 GiB transfer) prices were confirmed on DigitalOcean's own Droplet pricing page on 2026-10-22. Hetzner's US prices are from third-party comparison sites. Sources: [infratally](https://infratally.com/articles/digitalocean-droplet-pricing-guide-2026/), [diyai.io](https://diyai.io/ai-tools/hosting/digitalocean-pricing/), [bestusavps (Hetzner US)](https://bestusavps.com/reviews/hetzner/).

## 2. Application stack: unchanged

The app stays Node, Hono, Drizzle, SQLite and React as it is. The migration changes where it runs, not what it is built with. SQLite stays through the migration: moving to Postgres would make every query async, regenerate the schema and migrations, change the test setup and add a second change to the cutover, for no benefit at this scale. Reassess after the IGDB mirror is loaded, as its own milestone, if the mirror's size or query needs call for it (or if the app ever needs more than one instance). A managed platform can be revisited at the same point.

**IGDB: direct, with the local cache.** The app keeps calling IGDB directly and caching the games it loads in its own database, as it does today. The mirror in `IGDB_MIRROR.md` is deferred, not part of this migration. If it is picked up later, its first step is to measure the real size, which then settles whether the disk needs a Volume or a resize (decision 1) and whether the mirror lives in a separate, un-backed-up `igdb.db`.

## 3. Backups: backup.sh to Backblaze, no Droplet backups

`scripts/backup.sh` already snapshots the database, uploads it off-site, records its status for `/admin` and pings healthchecks.io. It stays the only backup of the data, run from cron on the Droplet. Droplet backups are skipped, saving $2.40 a month: they are crash-consistent disk images, which is a weak way to restore a SQLite file in WAL mode.

What replaces them:

- The compose file and cron line live in git, and a rebuild runbook will be written in a later step.
- `.env` is the one thing not in git. Keep a copy in a password manager.
- Take a manual Droplet snapshot (about $0.06 per GB per month) before risky changes such as the cutover or an OS upgrade.
- Restore a Backblaze snapshot onto a scratch machine and check the app boots before the cutover.
- Set up the healthchecks.io ping on the new server so a stopped backup is noticed.

## 4. Deployment shape: Docker compose and the Cloudflare Tunnel

The Droplet runs the same `compose.yaml` as the Pi: the `gamequeue` container plus `cloudflared`. HTTPS stays with the Cloudflare Tunnel, so there is no Caddy, no Let's Encrypt, no Coolify and no inbound ports except SSH. The app still publishes no ports, which keeps `TRUST_PROXY=true` safe. See `DEPLOYMENT.md` for how the tunnel works today.

Why keep the tunnel: nothing changes in the app or its config, the origin IP stays hidden, and the cutover is moving the `gamequeue.app` route from the Pi's tunnel to the Droplet's, so rollback is moving it back, with no DNS propagation wait. Caddy can be added later if the site ever leaves Cloudflare.

Changes this needs:

- **amd64 image.** `.github/workflows/deploy.yml` builds only `linux/arm64` for the Pi, on a native arm64 runner. A Droplet is amd64, so the publish job must also build `linux/amd64`: set `platforms: linux/amd64,linux/arm64`, which makes the published tag a multi-arch image so the Pi keeps working until it is retired. Building the non-native half on one runner means emulation, which is slow; the alternative is one native job per architecture, merged into one manifest. Once the Pi is retired, drop arm64 and build amd64 only, natively.
- **Pi-specific wording.** `deploy.yml`, the header of `scripts/update.sh` and `DEPLOYMENT.md` describe the Pi. `update.sh` itself is plain `git`, `docker compose` and `flock`, so it needs no code change on the Droplet; update the wording as part of the migration.
- **Pull-based deploys.** The Droplet pulls from GHCR with `scripts/update.sh`, as the Pi does, so CI needs no SSH access to the server.
- **Second tunnel.** The Droplet gets its own tunnel and token, with a staging hostname for testing, and takes over the `gamequeue.app` route at cutover (sections 6 and 7). The Pi keeps its tunnel until then.

## 5. Region: NYC

The Droplet goes in New York (NYC3), as most users are in the US and NYC is closer to more of them than SFO. Latency between the coasts is about the same either way (roughly 60 to 80 ms), and Cloudflare's edge carries visitors most of the way, so the choice matters little for speed. Cost and features are identical in both regions, and Volumes are available in NYC3 if the IGDB mirror needs more disk.

A Droplet can't change region in place; moving means a snapshot and a rebuild, so this is worth getting right before provisioning.

## 6. Running the Pi and the Droplet side by side

The Droplet is built, run and tested for real while the Pi keeps serving `gamequeue.app`. Each machine has its **own** Cloudflare Tunnel, so they never share a connector or split traffic. Both run the same flow (same GHCR image, same cron line for `scripts/update.sh`), so a push to `main` updates both. Five things need care:

- **Two tunnels, two hostnames.** The Pi's tunnel keeps `gamequeue.app`. The Droplet's tunnel serves `staging.gamequeue.app` until cutover, when the `gamequeue.app` route moves to it. Don't reuse the Pi's token on the Droplet: two connectors on one tunnel are replicas and Cloudflare spreads requests across them.
- **One live database.** The Pi's database is the real one until cutover. The Droplet's copy is for testing and is overwritten by a fresh final restore, so anything written on staging is thrown away.
- **Staging holds a copy of real data.** Protect `staging.gamequeue.app` with a Cloudflare Access policy (free; only your email), or keep the route up only while testing. Keep `SIGNUPS_ENABLED=false` on staging.
- **Separate backup targets.** Give the Droplet its own off-site path (or bucket prefix) and its own `HEALTHCHECK_URL`, so two machines don't overwrite each other's snapshots or hide a failure behind the other's pings. After cutover, remove the Pi's nightly backup line.
- **Rollback.** Before the route moves, the Pi is still live and nothing needs undoing. After it moves, rollback is moving the route back; if the Droplet took writes, copy its database to the Pi first or they are lost.

After cutover, stop the Pi's containers and remove its cron lines so it can't back up or serve anything by accident. Keep its data for a few weeks as a fallback before wiping it.

## 7. Cutover sequence (draft)

No DNS record is edited by hand: the hostname is a Cloudflare Tunnel route to `http://gamequeue:3000`, and cutover moves that route to the Droplet's tunnel. Cloudflare updates the proxied record, so it takes effect in seconds. Expect a few minutes of downtime for the final data sync. Sessions live in the database and the cookie is for `gamequeue.app`, so users stay signed in.

### Before touching the Droplet

1. CI publishes the multi-arch image (decision 4), and the amd64 tag is pullable from GHCR.
2. Backblaze `rclone` credentials ready, with a separate path for the Droplet (section 6).

### Provision and harden

Mirrors steps 2 and 5 of `DEPLOYMENT.md`, for a Droplet instead of a Pi.

1. Create the Droplet: NYC3, Basic (shared CPU, regular SSD) 1 GiB at $6, Ubuntu 24.04 LTS (assumed), SSH key only, no DigitalOcean backups.
2. Create a non-root sudo user. Check it gets UID 1000, because the container runs as UID 1000 and owns `data/`.
3. Disable root and password SSH logins (also check `/etc/ssh/sshd_config.d/`), then `ufw allow OpenSSH` and enable it. Optionally add a DigitalOcean Cloud Firewall allowing only SSH (free). No other inbound ports: the app publishes none.
4. Install `git`, `sqlite3`, `rclone` and `unattended-upgrades`. Install Docker, cap its logs with the same `daemon.json` as the Pi, and add the user to the `docker` group.
5. Check the clock is synced with `timedatectl` (the Twitch token flow and session expiry depend on it).
6. Add 2 GB of swap, since the 1 GiB plan has little headroom (decision 1).

### Stage it as a full copy

1. In Cloudflare, create a second tunnel (for example `gamequeue-do`) and add a route `staging.gamequeue.app` to `http://gamequeue:3000`. Add an Access policy that only allows you.
2. On the Droplet, clone the repo, `cp .env.example .env`, `chmod 600 .env`, and copy the Pi's `.env` values over, except: `TUNNEL_TOKEN` is the **new** tunnel's token, `ALLOWED_ORIGINS` and `PUBLIC_URL` are `https://staging.gamequeue.app`, and `SIGNUPS_ENABLED=false`.
3. `mkdir -p data backups && sudo chown 1000:1000 data`, then `docker compose up -d`. Check `docker compose ps` shows `(healthy)` and the new tunnel shows **Healthy** in the dashboard.
4. Configure `rclone` with the `offsite` remote on its own path, set a new `HEALTHCHECK_URL`, and install the two cron lines (`update.sh` every 2 minutes, `backup.sh` nightly at 03:00).

### Restore and test

Restore from the off-site copy at least once, so the Backblaze path is tested too.

1. On the Pi, run `scripts/backup.sh` so the latest snapshot is uploaded.
2. On the Droplet, download it and restore as in `DEPLOYMENT.md` "Restoring": stop the app, move `data/gamequeue.db*` aside, `gunzip` the snapshot into `data/gamequeue.db`, `chown 1000:1000`, start the app.
3. In a browser at `https://staging.gamequeue.app`, check:
    - sign in, and the home page, collection and lists match the Pi
    - search and add a game (IGDB credentials and rate limits)
    - avatar upload, wishlist, stats and `/recap`
    - the `/admin` pages (Server, Database, Backups, IGDB, Errors) and a share-card image URL
    - `docker compose restart gamequeue`, and the app comes back
    - the deploy flow: push a trivial commit to `main`, and watch `update.sh` on the Droplet pick up the new image (`tail update.log`)

### Cutover (pick a quiet hour)

1. **Pi:** `docker compose stop gamequeue`. Downtime starts here (the site shows 502).
2. **Pi:** run `scripts/backup.sh` for the final snapshot, then copy it to the Droplet (`rclone` or `scp`).
3. **Droplet:** stop the app, restore the snapshot as in the rehearsal, start the app, and check it on the staging URL.
4. **Droplet:** set `ALLOWED_ORIGINS` and `PUBLIC_URL` to `https://gamequeue.app` in `.env` and run `docker compose up -d` (a plain restart doesn't re-read `.env`). `ALLOWED_ORIGINS` takes a comma-separated list, so keeping the staging URL in it for a while is fine, but `PUBLIC_URL` must be the real one.
5. **Cloudflare:** remove the `gamequeue.app` route from the Pi's tunnel and add it to the Droplet's tunnel, confirming the DNS record replacement when asked. Remove the staging route and Access policy when you no longer need them.
6. Check from outside: `curl -s https://gamequeue.app/api/health`, then sign in and look at a few pages.
7. Check `/admin`: the Server tile shows the Droplet and the new image, and the Backups panel is fine. Run `scripts/backup.sh` once by hand to confirm the off-site upload and the healthchecks.io ping.

### Afterwards

1. Stop the Pi's containers and remove its `update.sh` and `backup.sh` cron lines. Keep its data for a few weeks as a fallback.
2. Confirm the external uptime monitor still points at the public URL (it should, since the URL hasn't changed).
3. Watch `/admin/errors` and `update.log` for a day or two.
4. Once the Pi is retired, drop arm64 from CI (decision 4).

### Rollback

| When                                         | What to do                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before step 5                                | Start the Pi's app again (`docker compose start gamequeue`). The Pi never stopped being the live site.                                                  |
| After step 5, nothing written on the Droplet | Move the `gamequeue.app` route back to the Pi's tunnel and start the Pi's app.                                                                          |
| After the Droplet took writes                | Take a backup on the Droplet, restore it on the Pi, start the Pi's app, then move the route back. Skipping this loses everything written since cutover. |

IGDB is unchanged by the migration (decision 2): the app keeps talking to IGDB directly with the same credentials.

## 8. TODO checklist

Items marked (Claude) are repo work. The rest are manual.

### Accounts and access

- [ ] DigitalOcean account: payment method, and two-factor authentication
- [ ] SSH key (existing, or a new ed25519 key) added to the DigitalOcean account
- [ ] Cloudflare: check that a second tunnel and an Access policy can be created under Zero Trust
- [ ] Backblaze: find the bucket and `rclone` credentials (`rclone config show` on the Pi), and pick the Droplet's separate path or prefix
- [ ] healthchecks.io: a new check for the Droplet's backups, and its ping URL for `HEALTHCHECK_URL`

### From the Pi

- [ ] Copy of the Pi's `.env` stored in a password manager
- [ ] Note the Pi's current image version (`/admin`) and its cron lines (`crontab -l`) to compare after the move
- [ ] Check that the external uptime monitor points at `https://gamequeue.app`

### Repo work

- [ ] (Claude) Multi-arch CI build on a branch, with a temporary non-`latest` publish to verify the amd64 image, then merge (decision 4). This blocks the Droplet.
- [ ] (Claude) Update the Pi-specific wording in `DEPLOYMENT.md`, `deploy.yml` and the `update.sh` header, and add the staging details

### Droplet (section 7)

- [ ] Provision and harden the Droplet
- [ ] Stage the full copy on `staging.gamequeue.app`
- [ ] Restore from Backblaze and run the browser test checklist
- [ ] Cut over, then retire the Pi
