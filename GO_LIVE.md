# Going live to new signups

What to do, and what to find out and write down, before GameQueue opens signups beyond the first few
people. Not legal advice. It's a working checklist: tick things off, and put the answers in the
"Findings" section at the bottom, because the privacy policy has to be written from them.

Signups are off or limited until this is done: **Admin > signups toggle** (`SIGNUPS_ENABLED`).

## 1. What the code already tells us

Checked against the code on 2026-10-27. Re-check anything that has changed since.

**Personal data stored**

- Account: username, email, password hash (argon2id), role, optional first and last name, bio, social
  links (Steam, Xbox, PlayStation, Discord), uploaded avatar (BLOB) or preset icon.
- Collection and activity: games, statuses, ratings, playthroughs and dates, private and public notes,
  lists, queue, wishlist, grids, tier lists, favorites, the activity feed.
- Sessions: a hashed token plus expiry (30 days, sliding). No IP address or user agent is stored there.
- Error log (`error_events`): message, route, stack, JSON context. No IP column, but check that
  `context` never holds an email or username (see section 4). Pruned at 30 days / 5,000 rows.
- Email send counts per day (daily cap), one-time verification and reset tokens.

**What's public.** Profile, lists, stats, Save File, grids, tier lists, activity feed and public
notes are public. Real name is private unless the profile checkbox is on. Search-engine indexing is
opt-in and off by default. Social links are public once set.

**Where data goes**

| Service                               | What it receives                              | Notes                                                             |
| ------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| Resend                                | Email addresses, message content              | Only with `RESEND_API_KEY` + `MAIL_FROM`                          |
| Cloudflare                            | All traffic, visitor IPs                      | Rate limits read `CF-Connecting-IP`                               |
| Host (Raspberry Pi, or a VPS later)   | Everything                                    | See backups below                                                 |
| Off-machine backup (rclone `offsite`) | Whole database, if configured                 | Optional in `backup.sh`; retention there is not set by the script |
| healthchecks.io                       | Pings only, no user data                      | Verify nothing user-related is in the ping URLs                   |
| IGDB / Twitch                         | Search text and game IDs, never user identity | Attribution in `/credits`                                         |
| IsThereAnyDeal                        | Game IDs                                      | Optional, `ITAD_API_KEY`                                          |

**Cookies.** One httpOnly session cookie (`gq_session`) plus `localStorage` for theme, layout and
the dismissed preview notice. No analytics, and fonts are self-hosted (`@fontsource`), so no
third-party requests from the browser. No cookie banner is needed while that stays true.

**Already built:** account deletion (FK cascades), JSON export, password change/reset, email
verification, signup toggle, per-IP rate limits, preview notices.

## 2. Write

- [ ] **Privacy policy** at `/privacy`: what is collected and why, what's public, processors (the
      table above), cookies and local storage, retention, how to export or delete, how long
      deleted data lives in backups, security summary, contact address, minimum age, "last updated"
      date. Every sentence must match section 1 and the findings below.
- [ ] **Terms of service** at `/terms`: acceptable use, rules for public content (bios, notes,
      usernames, avatars, grids, tier lists), right to remove content or accounts, provided "as is"
      during preview with no guarantee of uptime or data retention, who runs it, changes to the
      terms, governing law.
- [ ] **Footer links** to both (next to Credits in `Footer`), and a "by signing up you agree to the
      Terms and Privacy Policy" line on the register form.
- [ ] **Contact email address** for privacy and abuse reports. A dedicated address, not a personal
      one if avoidable. Publish it in the policy, the terms and the footer. A postal address is not
      needed for this site; it would become relevant only if you start sending marketing email or
      taking payments, or if a lawyer says your situation needs an imprint.
- [ ] **Credits page**: confirm IGDB, ITAD, game-icons.net (CC BY 3.0) and fonts attribution is
      complete.
- [ ] **Update `ARCHITECTURE.md`** for the new pages (and `README`/`OVERVIEW` if the shape changes).

## 3. Decide

- [ ] **Minimum age.** 13+ is the usual floor; 16+ avoids a per-country consent age in parts of the
      EU. Say it in the terms and the policy. (Nothing in the app checks age today. Decide whether a
      checkbox on signup is wanted.)
- [ ] **Jurisdiction and governing law** for the terms, and where you are as the operator.
- [ ] **Open or closed signups.** Fully open, invite only, or capped. Keep the toggle as the brake.
- [ ] **Abuse handling.** How someone reports a profile or note, who looks at it, what you remove.
      Public text and avatars are user content, so there must be a way to take it down quickly.
      There is no report button yet: is an email address enough, or do you want one in the app?
- [ ] **Retention.** How long unconfirmed accounts live (7 days today), how long backups keep
      deleted accounts (14 days locally; offsite is unknown), error log (30 days). Write whatever
      you choose.
- [ ] **Account recovery without email.** Login is by username, and reset needs Resend. Decide
      what you do if someone loses access (admin reset exists).
- [ ] **Hosting.** Stay on the Pi, or move. See section 5, which has the checks that should decide it.
- [ ] **When the preview label comes off.** The notices, badge, footer line and Data page sentence
      are listed in `ARCHITECTURE.md` (Web client, landing page) so removal is one pass.

## 4. Find out and verify

Answer each one and record it under Findings.

**Backups and recovery**

- [ ] Where do backups go? Is the rclone `offsite` remote configured and working? To whom does it
      belong, in which country, and is it encrypted at rest?
- [ ] What is the offsite retention? Does it keep deleted users' data longer than the local 14 days?
- [ ] Has a restore ever been tried end to end on a clean machine? Do it once and note how long it took.
- [ ] Do backups appear in a cloud account that has other people's access, or shared credentials?

**Server and network**

- [ ] Is the Pi reachable only through Cloudflare (no open port on the home router, no public IP
      exposed)? Confirm the firewall and the tunnel or proxy setup.
- [ ] Who has SSH or shell access? Are keys the only way in, with password login off?
- [ ] Is disk encryption a concern for the Pi (it's a physical device at home)? Decide and note it.
- [ ] What happens on a power cut or SD-card failure? Is the data on a USB SSD or high-endurance
      card, as `DEPLOYMENT.md` recommends?
- [ ] Is uptime monitored from outside (healthchecks.io), and do alerts reach you?

**Logging and data flows**

- [ ] What do Cloudflare and the reverse proxy log, and for how long? (IP addresses count as
      personal data.)
- [ ] Does the container log or `error_events.context` ever include emails, usernames or request
      bodies? Grep `reportError` callers and skim a week of `/admin/errors`.
- [ ] Do the healthchecks.io ping URLs or any alert email contain user data?
- [ ] Confirm what Resend retains (message logs, recipients) and its data region. Read its privacy
      and DPA terms.
- [ ] Confirm Cloudflare's data processing terms apply to your plan.
- [ ] Is the Cloudflare traffic page (`CLOUDFLARE_API_TOKEN`) reading only aggregate data?

**Third-party terms**

- [ ] IGDB / Twitch API terms: is your use allowed, including the locally stored mirror (the
      partner data dumps), attribution and caching? Keep a copy of the terms you agreed to.
- [ ] IsThereAnyDeal API terms, if prices stay on.
- [ ] game-icons.net (CC BY 3.0) credit is in place and links to the author.
- [ ] Cover art and screenshots from IGDB: check the image-use terms for a public site.

**Email**

- [ ] SPF, DKIM and DMARC for the sending domain are verified in Resend. Send a test to Gmail and
      Outlook and check it doesn't land in spam.
- [ ] The `MAIL_FROM` address is monitored, or replies go somewhere you read.
- [ ] Verification and reset emails work end to end with real Resend sends. CLAUDE.md notes a real
      send has not been tried yet.

**Security**

- [ ] Run the security review again (`/security-review`) against the current code, and read
      `REVIEW.md` for anything still open.
- [ ] Confirm production env: `NODE_ENV=production`, `ALLOWED_ORIGINS` / `PUBLIC_URL` correct,
      `TRUST_PROXY` set only behind your proxy, `SIGNUPS_ENABLED` as intended.
- [ ] Confirm the first admin account has a strong, unique password and that there is only one
      way to become admin (SQL).
- [ ] Do you have a breach plan? Write it down: who you tell, how (email to all users), how fast. The
      GDPR clock for a regulator is 72 hours from when you become aware of a serious breach.

**Product behavior**

- [ ] Delete an account on a test user and confirm everything is gone (avatar, notes, grids, tier
      lists, activity, sessions), including from the public profile and share-card caches.
- [ ] Export a test account and check the file has everything the policy says it does.
- [ ] Confirm private notes and real names never appear on public pages, in share cards, in the
      feed or in CSV/JSON exports other than the owner's own.
- [ ] Check what an unconfirmed or deleted user's public URL shows (should be 404).

## 5. Hosting check (Pi or VPS)

Stay on the Pi only if all of these are true. If any isn't, fix it or move.

- [ ] Off-machine backups exist and a restore has been tested.
- [ ] The data is not on a worn microSD card with no backup. (The first mirror build failed on this
      Pi with an unexplained error: see `IGDB_MIRROR.md`.)
- [ ] The site is reachable only through Cloudflare.
- [ ] You can live with home power or internet outages as downtime.

If you move to a VPS (for example DigitalOcean), add the provider to the privacy policy's processor
list, choose an EU or US region on purpose and say which, and re-run section 4 for the new setup.
Moving does not block writing the policy: update the one line.

## 6. Order of work

1. Findings in section 4 (backups, Cloudflare, Resend, IGDB terms), since the policy depends on them.
2. Decisions in section 3.
3. Draft the privacy policy and terms, add the pages, footer links and signup line.
4. Final pass on the section 4 product checks with a real test account.
5. Remove or soften the preview notices when you're ready (or keep them: they're honest while the
   data-loss risk is real).
6. Turn signups on, and watch `/admin/errors`, the Resend dashboard and the Cloudflare traffic page for the first week.

## Findings

Fill these in as you go. The policy is written from this section.

- Hosting and region:
- Backup destination, owner, retention, encryption:
- Last successful restore test (date, how long it took):
- Cloudflare and proxy log retention:
- Resend region, retention, DPA link:
- IGDB terms reviewed on (date) and the key limits:
- ITAD terms reviewed on (date):
- Minimum age:
- Governing law and operator name:
- Contact and abuse email:
- Breach plan (who, how, how fast):
- Anything the code does that the policy must mention:
