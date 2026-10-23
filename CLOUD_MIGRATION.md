# GameQueue: Cloud Migration Plan

Moving GameQueue from the Raspberry Pi to a cloud VPS. Decisions are recorded one at a time, in order.

## 1. Hosting provider: DigitalOcean

GameQueue moves to a DigitalOcean Droplet in a US region, at about $13 a month all in (see decision 3 for why there are no Droplet backups).

| Item    | Choice                                                   | Monthly cost (USD) |
| ------- | -------------------------------------------------------- | ------------------ |
| Droplet | Basic, 1 shared vCPU, 2 GB RAM, 50 GB SSD, 2 TB transfer | $12.00             |
| Domain  | Registrar of choice                                      | about $1           |
| Region  | NYC3 (see decision 5)                                    | n/a                |

**Why DigitalOcean over Hetzner:** most users are in the US. Hetzner's cheap shared plans are Germany and Finland only. Its US plans start around $20.49 for 2 GB of RAM, so DigitalOcean is cheaper where the users are.

**Why 2 GB:** the app is one Node process plus SQLite. Share-card rendering is the main memory use and is capped by an in-memory LRU of 32. A Droplet resize is a single click if the IGDB mirror needs more.

**Disk:** 50 GB is plenty for the app and its cache of loaded games. If IGDB mirroring is added later (decision 2) and its measured size needs more, add a Volume (about $0.10 per GB per month, growable but not shrinkable) or do a disk resize then.

Prices are from third-party comparison sites as of 2026-10-22, not DigitalOcean's own pricing page. Confirm them before ordering. Sources: [infratally](https://infratally.com/articles/digitalocean-droplet-pricing-guide-2026/), [diyai.io](https://diyai.io/ai-tools/hosting/digitalocean-pricing/), [bestusavps (Hetzner US)](https://bestusavps.com/reviews/hetzner/).

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

Why keep the tunnel: nothing changes in the app or its config, the origin IP stays hidden, and the cutover is switching the tunnel's connector from the Pi to the Droplet, so rollback is switching it back, with no DNS propagation. Caddy can be added later if the site ever leaves Cloudflare.

Changes this needs:

- **amd64 image.** `.github/workflows/deploy.yml` builds only `linux/arm64` for the Pi, on a native arm64 runner. A Droplet is amd64, so the publish job must also build `linux/amd64`: set `platforms: linux/amd64,linux/arm64`, which makes the published tag a multi-arch image so the Pi keeps working until it is retired. Building the non-native half on one runner means emulation, which is slow; the alternative is one native job per architecture, merged into one manifest. Once the Pi is retired, drop arm64 and build amd64 only, natively.
- **Pi-specific wording.** `deploy.yml`, the header of `scripts/update.sh` and `DEPLOYMENT.md` describe the Pi. `update.sh` itself is plain `git`, `docker compose` and `flock`, so it needs no code change on the Droplet; update the wording as part of the migration.
- **Pull-based deploys.** The Droplet pulls from GHCR with `scripts/update.sh`, as the Pi does, so CI needs no SSH access to the server.
- **Tunnel connector.** Run `cloudflared` on the Droplet with the existing tunnel's token. Only one machine should run the connector for live traffic at a time during the cutover.

## 5. Region: NYC

The Droplet goes in New York (NYC3), as most users are in the US and NYC is closer to more of them than SFO. Latency between the coasts is about the same either way (roughly 60 to 80 ms), and Cloudflare's edge carries visitors most of the way, so the choice matters little for speed. Cost and features are identical in both regions, and Volumes are available in NYC3 if the IGDB mirror needs more disk.

A Droplet can't change region in place; moving means a snapshot and a rebuild, so this is worth getting right before provisioning.

## 6. Running the Pi and the Droplet side by side

Until the Pi is retired, both machines run the same flow: the same GHCR image and the same cron line for `scripts/update.sh`, so a push to `main` updates both. Four things must not overlap. The exact cutover steps come in a later section.

- **One tunnel connector for live traffic.** Two `cloudflared` instances with the same token are replicas of one tunnel, and Cloudflare spreads requests across them. During the overlap, either keep the Droplet's `cloudflared` stopped until cutover, or give it a second tunnel. At cutover, stop `cloudflared` on the Pi, then start it on the Droplet.
- **One writable database.** The Pi and the Droplet each have their own `gamequeue.db`. Users must only write to one. At cutover, stop the Pi's app, take a final backup, restore it on the Droplet, and only then start `cloudflared` there. Anything written on the Pi after that backup is lost, so the Pi stays stopped.
- **Separate backup targets.** While both run `backup.sh`, give the Droplet its own off-site path (or bucket prefix) and its own `HEALTHCHECK_URL`, so two machines don't overwrite each other's snapshots or hide a failure behind the other's pings. After cutover, remove the Pi's nightly backup line.
- **Rollback.** Before cutover, rolling back means starting `cloudflared` on the Pi again. After the Droplet has taken writes, rolling back loses them unless the Droplet's database is copied back to the Pi first.

After cutover, comment out `update.sh` on the Pi (or stop its containers) so it can't serve traffic or back up by accident, and keep its data for a few weeks as a fallback before wiping it.

## 7. Cutover sequence (draft)

No DNS change is needed: the public hostname is a Cloudflare Tunnel route to `http://gamequeue:3000`, so it works the same from the Droplet. Cutover is moving the database and then the tunnel connector. Expect a few minutes of downtime. Sessions live in the database, so users stay signed in.

### Before touching the Droplet

1. CI publishes the multi-arch image (decision 4), and the amd64 tag is pullable from GHCR.
2. Prices confirmed on DigitalOcean's own pricing page (decision 1).
3. Backblaze `rclone` credentials ready, with a separate path for the Droplet (section 6).

### Provision and harden

Mirrors steps 2 and 5 of `DEPLOYMENT.md`, for a Droplet instead of a Pi.

1. Create the Droplet: NYC3, Basic 2 GB, Ubuntu 24.04 LTS (assumed), SSH key only, no DigitalOcean backups.
2. Create a non-root sudo user. Check it gets UID 1000, because the container runs as UID 1000 and owns `data/`.
3. Disable root and password SSH logins (also check `/etc/ssh/sshd_config.d/`), then `ufw allow OpenSSH` and enable it. Optionally add a DigitalOcean Cloud Firewall allowing only SSH (free). No other inbound ports: the app publishes none.
4. Install `git`, `sqlite3`, `rclone` and `unattended-upgrades`. Install Docker, cap its logs with the same `daemon.json` as the Pi, and add the user to the `docker` group.
5. Check the clock is synced with `timedatectl` (the Twitch token flow and session expiry depend on it).

### Stage the app without taking traffic

1. Clone the repo, `cp .env.example .env`, `chmod 600 .env`, and copy the Pi's `.env` values over. Put a **placeholder** in `TUNNEL_TOKEN`: compose refuses to parse without one, and the real token would attach a second connector to the live tunnel.
2. `mkdir -p data backups && sudo chown 1000:1000 data`.
3. Start only the app: `docker compose up -d gamequeue`. Check `docker compose ps` shows `(healthy)`. Migrations run on an empty database.
4. Configure `rclone` with the `offsite` remote on its own path, set a new `HEALTHCHECK_URL` for the Droplet, and install the two cron lines (`update.sh` every 2 minutes, `backup.sh` nightly at 03:00).

### Rehearse the restore

Do this at least once, from the off-site copy, so the Backblaze path is tested too.

1. On the Pi, run `scripts/backup.sh` so the latest snapshot is uploaded.
2. On the Droplet, download it and restore as in `DEPLOYMENT.md` "Restoring": stop the app, move `data/gamequeue.db*` aside, `gunzip` the snapshot into `data/gamequeue.db`, `chown 1000:1000`, start the app.
3. Check that it boots and `/admin/database` shows the Pi's row counts. Without the tunnel the app is only reachable from inside Docker, so use `docker compose exec` for health checks, or a throwaway second tunnel and hostname for a browser test.

### Cutover (pick a quiet hour)

1. **Pi:** `docker compose stop gamequeue`. Downtime starts here.
2. **Pi:** run `scripts/backup.sh` for the final snapshot, then copy it to the Droplet (`rclone` or `scp`).
3. **Droplet:** restore it as in the rehearsal and start the app. Check `(healthy)`.
4. **Pi:** `docker compose stop cloudflared`. This must come before step 5, or Cloudflare splits requests between the Pi and the Droplet (section 6).
5. **Droplet:** put the real `TUNNEL_TOKEN` in `.env` and run `docker compose up -d`. The tunnel shows **Healthy** in the Cloudflare dashboard.
6. Check from outside: `curl -s https://gamequeue.app/api/health`, then sign in and look at a few pages.
7. Check `/admin`: the Server tile shows the Droplet and the new image, and the Backups panel is fine. Run `scripts/backup.sh` once by hand to confirm the off-site upload and the healthchecks.io ping.

### Afterwards

1. Leave the Pi stopped. Remove its `update.sh` and `backup.sh` cron lines so it can't serve traffic or back up, but keep its data for a few weeks as a fallback.
2. Confirm the external uptime monitor still points at the public URL (it should, since the URL hasn't changed).
3. Watch `/admin/errors` and `update.log` for a day or two.
4. Once the Pi is retired, drop arm64 from CI (decision 4).

### Rollback

| When                                         | What to do                                                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Before step 5                                | Start the Pi's app again (`docker compose start gamequeue`). The Pi never stopped being the live tunnel.                                  |
| After step 5, nothing written on the Droplet | Stop `cloudflared` on the Droplet, then `docker compose up -d` on the Pi.                                                                 |
| After the Droplet took writes                | Take a backup on the Droplet, restore it on the Pi, then switch the connector back. Skipping this loses everything written since cutover. |

IGDB is unchanged by the migration (decision 2): the app keeps talking to IGDB directly with the same credentials.
