# GameQueue Refactor: Milestones and Claude Code Handoff

Oct 31, 2026 · @Joe Attardi

**Baseline (R0, Oct 31, 2026, `main` at c75d5a3):** `npm run typecheck` passes; `npm test` passes with 753 tests (shared 96, server 611, web 46); `npm run format:check` passes on every tracked file.

Hand this to Claude Code one milestone at a time. Export this doc as Markdown, commit it to the repo root as `REFACTOR_PLAN.md`, paste the kickoff prompt below, and approve each milestone before the next starts.

The production database is being wiped, so there are no data migrations and no backward-compatibility work except where a milestone says so. That is why the old Beaten/Played idea is gone too: GameQueue's statuses are already `unplayed`, `playing`, `paused`, `finished` and `abandoned`, so the five game states you chose need no change except the label "Not Started" for `unplayed`.

## Working agreements

These apply to every milestone. Most come from the repo's own `CLAUDE.md`; the rest are new for this refactor.

- **One milestone at a time.** Work on a branch named `refactor/rN-short-name`. When done, stop and give a 3 to 5 line summary plus what to try by hand. Do not start the next milestone until Joe says so.
- **Done means green.** `npm run format:check`, `npm run typecheck` and `npm test` pass, and every acceptance box is checked or explained in the summary.
- **Do not merge to `main`.** Pushing to `main` publishes the image the Pi pulls. Open a pull request so CI runs; Joe merges.
- **Fresh database.** No data migrations. Change `apps/server/src/db/schema.ts` and run `npm run db:generate`. R1 resets the migration history to one baseline; after that, normal migrations. If a generated migration adds a foreign-key column, check the SQL, because drizzle-kit drops `ON DELETE` clauses on SQLite (see `CLAUDE.md`).
- **Ask, don't guess.** Product questions go to Joe. Technical choices inside the existing stack are yours to make; mention the notable ones.
- **Stay in scope.** Do only what the milestone lists. Ideas go in a "Later" list at the end of `REFACTOR_PLAN.md`.
- **Keep the docs true.** Update `ARCHITECTURE.md` in the same commit as any change to routes, tables, services, auth, IGDB or pages. Update `OVERVIEW.md` when a subsystem's shape changes. Replace outdated bullets in the `CLAUDE.md` product decisions instead of adding contradictions.
- **Existing UI rules still hold.** Loading skeletons on every data view, `useConfirm()` instead of `window.confirm`, `data-autofocus` in dialogs, light and dark themes, responsive down to 375 px, keyboard accessible.
- **Tests ship with behavior.** Vitest against in-memory SQLite with `makeApp` and the fake IGDB client. Delete tests for removed features. If a UI cannot be checked in a browser, say so in the summary instead of claiming it works.
- **Commit footer.** Follow the attribution line from the session's system reminder.

## Milestones

Eight milestones, in order. R1 to R3 simplify the app and are worth shipping even if the rest slips. R4 and R5 do not depend on each other and can swap.

| Milestone                 | Outcome                                                           | Size   |
| ------------------------- | ----------------------------------------------------------------- | ------ |
| R0 Baseline               | Green starting point, plan committed                              | Small  |
| R1 Cut and reset          | Grids, tier lists and price tracking gone; one baseline migration | Medium |
| R2 Playing replaces slots | Every Playing game shown; no slot concept                         | Medium |
| R3 Lists hold any game    | Wishlist becomes a special list                                   | Large  |
| R4 Journals               | Posts, hours, screenshots, finish form, share links               | Large  |
| R5 AI core                | Provider, usage and budget, game helper, summarize to notes       | Large  |
| R6 Picking                | Commit step and roll history, AI pick-my-next-game chat           | Medium |
| R7 Docs and cleanup       | Docs match the app; leftovers removed                             | Small  |

### R0: Baseline

**Goal.** Start from a known-good state and put the plan where Claude Code can read it.

**Do**

- Create branch `refactor/r0-baseline`. Run `npm run format:check`, `npm run typecheck` and `npm test`. Record the results, including the number of tests.
- Add `REFACTOR_PLAN.md` to the repo root (Joe supplies the file).
- In `CLAUDE.md`, replace the final "Wait for the user to name the next thing" with a pointer to `REFACTOR_PLAN.md` and its one-milestone-at-a-time rule.

**Acceptance criteria**

- [ ] The three checks pass on a clean checkout and the numbers are written at the top of `REFACTOR_PLAN.md`.
- [ ] `REFACTOR_PLAN.md` is in the repo root and `CLAUDE.md` points to it.
- [ ] No application code changed.

### R1: Cut and reset

**Goal.** Remove what you decided to cut and reset the migration history, so every later milestone starts from a clean schema.

**Do**

- Remove grids, tier lists and price tracking (IsThereAnyDeal). Based on a search of the repo, that covers: `services/grids.ts`, `services/tier-lists.ts`, `services/prices.ts`; `routes/grids.ts`, `routes/tier-lists.ts`; the `itad/` client; the `grids`, `grid_cells`, `tier_lists`, `tiers`, `tier_items` and `game_prices` tables; share-card code for grids and tier lists in `og/`; the shared grid and tier constants; the web boards, download-image components, skeletons and `GameOffers`; nav, footer, profile, landing page and `/credits` references; the `grid` and `tier` activity types; the `ITAD_API_KEY` setting. Search for anything else before deleting.
- Delete everything in `apps/server/drizzle/` and generate one baseline migration from the resulting `schema.ts`.
- Leave slots, lists and the wishlist alone in this milestone. The wishlist stays, minus prices.

**Acceptance criteria**

- [ ] On an empty database the app starts, `/api/health` returns 200, and you can register, log in and add a game (using the fake IGDB in tests).
- [ ] `schema.ts` no longer defines the six removed tables, and `apps/server/drizzle/` holds a single baseline migration that creates the whole schema.
- [ ] A case-insensitive search of `apps/` and `packages/` for `grid`, `tier`, `itad`, `game_prices` and `offers` finds no feature code. Remaining hits (for example CSS grid layout) are listed in the summary with the reason each stays.
- [ ] The old API routes, share-card routes and web pages return 404 or the not-found page. No link anywhere points to them.
- [ ] `ACTIVITY_TYPES`, the verbs, the DTOs and the feed UI no longer mention `grid` or `tier`.
- [ ] The importer accepts a current export file that still contains grids, tier lists and slots, and ignores those parts (test with a fixture). New exports no longer contain grids or tier lists.
- [ ] The wishlist works without prices; `ITAD_API_KEY` is gone from config, `.env.example`, compose files and `DEPLOYMENT.md`.
- [ ] Tests for removed features are deleted; the summary explains the change in test count.
- [ ] `ARCHITECTURE.md`, `OVERVIEW.md` and `CLAUDE.md` no longer describe the removed features.

### R2: Playing replaces slots

**Goal.** No named slots. The Home page shows every game whose status is `playing`.

**Background.** Today a slot row holds at most one game, assigning a game starts a playthrough, and a displaced game is paused. A slotted game is always `playing` or `paused`, so no status data needs converting.

**Do**

- Remove the `slots` table, `services/slots.ts`, `routes/slots.ts`, the shared slots module and `MAX_SLOTS`, `vacateSlots` and `assignToSlot` in `playthroughs.ts`, the `slotted` activity type, and the web `SlotBay`, `ManageSlotsDialog`, `AssignDialog`, `useAssign` and `api/slots`. Also clear slot references from Home, Welcome, UpNext, PickResult, PickChoosePage, AddGameDialog, the profile page, the data page, the landing page mock, the share cards, and export/import. Check `CartridgeArt` before deleting it.
- Home shows a **Playing** section with every game in `playing` status, no cap, each with quick Pause, Finish and Abandon actions. Paused games appear in a smaller **Paused** row below it. Keep the playing glow and pulsing icon on those cards.
- Replace every "assign to slot" action (queue items, game page, pick result, add dialog) with **Start playing**, which uses the existing start flow: open a playthrough, set `playing`, remove from the queue.
- The public profile shows playing games where it showed slot games.
- Show the label **Not Started** wherever the UI says Unplayed. The stored value stays `unplayed`, and "Backlog" stays the name of that view.

**Acceptance criteria**

- [ ] The `slots` table and all slot code are gone. A case-insensitive search for `slot` in `apps/` and `packages/` finds only unrelated uses, each listed in the summary.
- [ ] Starting four games in a row works with no dialog, and all four appear under Playing on Home. Pausing moves a game to the Paused row; finishing or abandoning removes it from both.
- [ ] Start playing from the queue, the game page, the pick result and the add dialog each open a playthrough, set `playing` and dequeue the game. API tests cover each path.
- [ ] The public profile and its share card show playing games and contain no slot wording.
- [ ] The visible UI says Not Started, never Unplayed. Filters, smart lists and stats behave as before.
- [ ] The importer still accepts an export file with a `slots` key and ignores it. New exports have no `slots`.
- [ ] Home is checked at 375 px width in light and dark, with zero, one and five playing games.
- [ ] The "Slots" bullets in `CLAUDE.md` product decisions are replaced by a short Playing description; `ARCHITECTURE.md` and `OVERVIEW.md` are updated.

### R3: Lists hold any game; the wishlist becomes a list

**Goal.** A list can hold games you do not own. The wishlist is just a special list.

**Background.** Today `list_items` is keyed by `entryId`, so lists hold collection games only. The wishlist has its own tables (`wishlists`, `wishlist_items`) keyed by IGDB game id, with order, target platform, note and release dates. A game cannot be both owned and wishlisted: adding it to the collection removes it from the wishlist.

**Do**

- Key `list_items` by `(listId, gameId)` and add nullable `platformId`, a `note` (default empty) and `addedAt`. A game's collection entry is found by joining on `(userId, gameId)`.
- Extend `lists.kind` to `list`, `queue` and `wishlist`, with one queue and one wishlist per user (partial unique indexes), created lazily like `ensureQueue`.
- The queue accepts collection games only; the service rejects others with a clear error.
- Regular lists show, per game, whether it is in your collection and its status.
- Move the wishlist onto the wishlist-kind list. Keep its behavior: order, target platform, note, release-date refresh, "releasing soon", public page without notes, and the "Got it" move into the collection. Choose whether `/api/wishlist` stays as a thin wrapper or merges into `/api/lists`, and document the choice.
- Drop `wishlists` and `wishlist_items`.
- Random pick from a list counts only owned, Not Started games, and tells the user when it skipped unowned ones.
- Export and import carry lists, queue and wishlist items by IGDB id.

**Acceptance criteria**

- [ ] A list holds a game that is not in the collection. Adding, removing, reordering and deleting work, and collection counts and stats ignore unowned items (tests).
- [ ] The queue rejects an unowned game with a clear error, and starting a game still dequeues it.
- [ ] The wishlist works end to end as before: add, reorder, target platform, note, release-date refresh, releasing soon, public page without notes, and "Got it" moving the game into the collection and off the wishlist.
- [ ] `wishlists` and `wishlist_items` are gone, and the existing list and wishlist tests are ported and passing, with no duplicate list code paths.
- [ ] Random pick from a list with unowned games skips them and still works (pick tests cover it).
- [ ] Export, then import into an empty database, preserves lists, the queue and the wishlist with their order.
- [ ] Public list and wishlist pages render unowned games without a status.
- [ ] If this turns out to touch far more than the files above, stop and report before continuing.

### R4: Playthrough journals

**Goal.** Each playthrough has a journal of posts and its own share link.

**Data**

- `playthrough_posts`: id, playthrough id (cascade), user id, kind (`note`, `screenshot`, `hours`), body, minutes (for `hours`), spoiler flag, created at.
- `post_images`: id, post id (cascade), content-hash file name, width, height, bytes.
- On `playthroughs`: `share_slug` (unique, nullable, random with at least 128 bits, base64url), `visibility` (`private` default, `unlisted`, `public`) and `final_thoughts`.
- A `settings` value for the screenshot storage cap, default 1 GiB.
- Started and Finished or Abandoned markers are derived from the playthrough's own dates and outcome. Pauses and resumes are not posts.

**Do**

- API and UI to add, edit and delete notes, hours and screenshot posts on a playthrough, from the game page. Only the owner can write.
- Finishing a playthrough opens one dialog: total time (prefilled from the sum of logged hours, editable), a 1 to 5 rating and final thoughts.
- Visibility control and share link on the playthrough. Public journal page at `/p/:slug` and `GET /api/journals/:slug`. Public playthroughs also appear in a Journals section on the owner's profile.
- Screenshot handling: accept JPEG, PNG and WebP; reject originals over 8 MB; strip metadata; re-encode to WebP with the longest side at most 1920 px; store under `/data/screenshots/` by content hash; at most 6 images per post. Pick an image library that builds in the arm64 Docker image, and prove it in CI.
- Upload route needs its own body limit and a CSRF exception for image content types, with the `Origin` check kept (see `OWN_BODY_LIMIT` and the CSRF note in `CLAUDE.md`).
- Storage cap: refuse an upload that would exceed it with a clear message. Add an Admin tile with a gauge of space used against the cap, the free disk space, and a control to change the cap.
- Cleanup: deleting a post, playthrough, game entry or account removes its files. A daily job removes orphan files and rows.
- `scripts/backup.sh` also backs up `data/screenshots`, and `DEPLOYMENT.md` documents the restore.

**Acceptance criteria**

- [ ] Notes, hours and screenshots can be added, edited and deleted on an open playthrough. Another user gets 404 on someone else's posts and cannot write to them (tests).
- [ ] The hours total shows on the playthrough, and the finish dialog prefills total time from it.
- [ ] The finish dialog stores time, rating and final thoughts on the playthrough, and the final thoughts show on the journal.
- [ ] The journal shows Started and Finished or Abandoned markers from the playthrough dates (none when dates are unknown), then posts in time order.
- [ ] Private journals return 404 to everyone but the owner. Unlisted works by link and is not on the profile. Public is on the profile. Setting back to private cuts off the page and its image URLs at once (tests for all three).
- [ ] Spoiler-flagged posts are collapsed for visitors until clicked.
- [ ] Uploads work under the CSRF and body-limit rules. Oversized, wrong-type and over-cap uploads are refused with clear messages. Stored files have no EXIF data and are at most 1920 px.
- [ ] Deleting a post, playthrough, entry or account removes its files, tested against a temporary directory. The orphan cleanup job is tested.
- [ ] The Admin gauge shows used, cap and free disk, and changing the cap takes effect immediately.
- [ ] The CI image build passes with the image library, and `backup.sh` includes the screenshots folder.
- [ ] The public journal page has a loading skeleton, works at 375 px in light and dark, opens images in a lightbox, carries `noindex`, and has link-preview tags that show no notes (generic title, per the share-card rule in `CLAUDE.md`).
- [ ] Private entry notes never appear in a journal.

**Out of scope.** Comments, reactions, video, post edit history, exporting posts.

### R5: AI core

**Goal.** A spoiler-aware game helper, a summary that lands in your notes, and an Admin card that tracks what it costs.

**Do**

- Configuration: `ANTHROPIC_API_KEY` and `AI_MODEL` (default `claude-sonnet-5-5`) as environment variables. With no key, AI routes return a clear "not configured" response and no AI control appears in the UI.
- A small provider module with one `generate()` function that returns text plus token usage. Anthropic is the only implementation, and a fake implementation serves tests. Keep it small; no streaming is required.
- `ai_usage` table: id, user id, feature, model, input tokens, output tokens, estimated cost, created at. A price-per-million-tokens table in code, with a comment saying cost is an estimate.
- Budget: a monthly budget setting (calendar month, UTC). At 80% the Admin card warns; at 100% new AI calls are refused with a clear message until the next month or the budget is raised. Reuse the existing per-IP and per-user rate limit code.
- Game helper: a chat box on the game page. The server builds the prompt from the game's IGDB data, the latest journal posts for the open playthrough, and the user's notes (a visible toggle, on by default), and instructs the model not to reveal anything beyond the progress the user has written down. The client sends the conversation each turn, capped in turns and total characters. Nothing is stored server-side except the usage row.
- Summarize to notes: a button that asks for the main points of the conversation. The user edits the draft and chooses to save it as a private note, a public note, or a journal post. Nothing saves without that click.
- Admin AI card and `/admin/ai`: spend this month against budget, split by feature, the last 20 calls, and a control for the budget.

**Acceptance criteria**

- [ ] With no API key, AI endpoints say so and no AI control renders. With a key (fake provider in tests), the helper answers and writes a usage row.
- [ ] Cost is computed from the price table and checked by a test. The Admin card shows month spend, budget, the split by feature and recent calls.
- [ ] At 80% of budget the card shows a warning; at 100% a call is refused with a clear message (tests with a tiny budget).
- [ ] The prompt contains the game data, the recent journal text and, when the toggle is on, the user's notes. A test asserts that the system prompt includes the no-spoiler instruction and that other users' data never appears.
- [ ] Turn and size caps are enforced server-side.
- [ ] Summarize to notes produces an editable draft and saves only after the user chooses a destination. Each destination is tested.
- [ ] The UI says plainly what is sent to the AI provider.
- [ ] No conversation text is stored in the database or logs.
- [ ] The API key never reaches the browser, logs or error events.

### R6: Picking

**Goal.** Make the random pick end in a decision, and add an AI chat that helps choose from your backlog.

**Background.** The picker already works: sources, filters, an injectable RNG in `packages/shared/src/pick.ts`, re-roll with `excludeEntryIds`, and a flip-reveal result card. A `PickChoosePage` exists; read it first, because it may already cover part of the "pick three" idea.

**Do**

- Result card: **Start playing** is the primary button. Add to queue is secondary.
- Roll history: keep this session's earlier results in a strip under the card. Selecting one makes it the current result again.
- Pick of three: a button next to Roll that draws three distinct games (add a `count` of 1 to 3 to the pick logic and API) and asks the user to choose one. Reuse `PickChoosePage` if it fits.
- Pick-my-next-game chat, as a top-level page. The server sends the model: your last 15 Finished games with ratings and genres, the queue, and up to 150 Not Started games with genres, tags, time to beat and IGDB score (sampled when there are more). The model replies with a message plus suggestions that cite game ids from that list. The server drops any id not in the list. The UI shows each suggestion as a card with Start playing and Add to queue buttons. The chat never changes anything by itself. The AI budget, rate limits and "not configured" behavior from R5 apply.

**Acceptance criteria**

- [ ] Start playing from the result card opens a playthrough, sets `playing` and removes the game from the queue.
- [ ] Re-rolling keeps earlier results in the strip, and selecting one restores it as the current result.
- [ ] Pick of three returns three distinct eligible games, honors every existing filter and source, and falls back gracefully when fewer than three exist (pick tests with a fixed RNG).
- [ ] The chat's request contains only the signed-in user's data, and suggestions with ids outside the candidate list are dropped (tests with the fake provider).
- [ ] Suggestions render as cards, and the buttons work. The chat shows a budget or not-configured message instead of failing.
- [ ] Pages have loading skeletons and work at 375 px in light and dark.

### R7: Docs and cleanup

**Goal.** The docs describe the app as it now is, and nothing left over from the old design remains.

**Do**

- Rewrite the `CLAUDE.md` status and product decisions so they describe the current model: statuses, Playing, queue, lists, wishlist as a list, journals, AI. Remove stale detail instead of appending.
- Update `OVERVIEW.md` and `ARCHITECTURE.md` for the new tables, routes and pages.
- Remove unused dependencies, dead components, unused CSS and unused exports. List what was removed.
- Update `DEPLOYMENT.md` for the new environment variables (`ANTHROPIC_API_KEY`, `AI_MODEL`) and the screenshots folder.
- Add a manual smoke-test checklist to `DEPLOYMENT.md`.

**Acceptance criteria**

- [ ] A reader who has only the docs can name every table, route group and page, and none of the removed features appear anywhere.
- [ ] `npm run format:check`, `npm run typecheck` and `npm test` pass, and the production Docker image builds.
- [ ] A search for leftover names (`slot`, `grid`, `tier`, `itad`, `Beaten`) finds nothing outside this plan.
- [ ] The smoke checklist covers: register, add a game, start, journal post with screenshot, finish, share link, AI help (with key), random pick, wishlist.

## Kickoff prompt

Paste this into Claude Code in the `gamequeue` repo after `REFACTOR_PLAN.md` is committed.

```text
We are refactoring GameQueue. Read CLAUDE.md, OVERVIEW.md, ARCHITECTURE.md and REFACTOR_PLAN.md before doing anything.

REFACTOR_PLAN.md is the plan. It has milestones R0 to R7, each with a goal, tasks and acceptance criteria. Follow its "Working agreements" section exactly. The most important rules:
- Work on one milestone at a time, on a branch named refactor/rN-short-name.
- Stop after each milestone with a 3 to 5 line summary and what I should try by hand. Do not start the next milestone until I say so.
- Do not merge to main. Open a pull request so CI runs.
- The production database will be wiped, so write no data migrations and no backward-compatibility code unless an acceptance criterion asks for it.
- Ask me when something is ambiguous or needs a product decision. Do not guess.
- Stay in scope: do only what the milestone lists, and put other ideas in a "Later" list at the end of REFACTOR_PLAN.md.
- Update ARCHITECTURE.md, OVERVIEW.md and CLAUDE.md in the same commit as the change they describe.

Start with R0, then R1. Before changing any code for R1, show me a short plan: the files you intend to delete or edit, and anything in the plan that does not match what you find in the repo. Then do R1, check every acceptance box, and stop.
```

## Before you hand off

Things only you can do, and a few choices I made for you that you can change.

- [ ] **Export your data.** Download the JSON from the app's Data page and keep it. If you want your collection back after the wipe, importing it into the fresh database is the way; R1 and R2 make sure the importer tolerates the old format.
- [ ] **Commit the plan.** Export this doc as Markdown, save it as `REFACTOR_PLAN.md` in the repo root, and commit it to a branch.
- [ ] **Decide when the Pi gets wiped.** The cron job pulls whatever the `main` image is, so the first merge to `main` deploys to the Pi. Until you merge, the Pi keeps running the current app. When you are ready: run `backup.sh`, move `data/gamequeue.db` aside, then let the new image start with an empty database. The IGDB mirror file `igdb.db` is separate and unaffected.
- [ ] **Use pull requests.** CI (format, typecheck, tests, arm64 build) only runs on a pull request or on `main`, so each milestone should go through a PR before you merge it.
- [ ] **Anthropic key before R5.** Create an API key, set a spend limit in the Anthropic console as a second safety net, and add `ANTHROPIC_API_KEY` to the Pi's `.env`.
- [ ] **Check Pi disk space before R4.** `CLAUDE.md` says the Pi runs from an 8 GB microSD, so a 1 GB screenshot cap is a big share of it. Look at free space on the Admin Server page, and lower the cap or move the data volume if it is tight.
- [ ] **Live IGDB checks.** Claude Code can only verify against real IGDB if `apps/server/.env` has your credentials locally. Do not commit it.
- [ ] **Confirm the defaults I picked:** paused games sit in a small row under Playing; screenshots are re-encoded to WebP at most 1920 px, 8 MB upload limit, 6 per post; journals send `noindex`; the monthly AI budget is a setting you choose in the Admin card.
- [ ] **Rename later, separately.** The rename and domain are not part of this plan. When you choose a name, it is a small standalone milestone (UI text, logo, package scope, docs).
