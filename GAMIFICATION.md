# Gamification: plan

Status: **design only, nothing built.** Wait for the user to say when to start.

The idea: reward using GameQueue with achievements, and maybe later XP and levels. This document records what was decided in the design discussion, so the milestone can be built without re-deriving it.

## Scope

- **First milestone: achievements only.** XP, levels and the ledger below are deferred (see "Later: XP").
- Every achievement is **derived from current state**, never from counting events. No counter or streak tables in v1.

## Decisions (confirmed by the user)

- **Public by default, can be toggled private.** Badges show on the public profile; an opt-out checkbox on the Account page, like `users.show_activity`.
- **Unlock toast:** yes.
- **Import counts.** Imported games count toward state-based achievements. An import that unlocks several shows one collapsed "N achievements unlocked" toast.
- **Hidden achievements:** yes, like real games. Locked hidden ones show as "?" and their name and description are never sent to the client.
- **Icons:** one Lucide icon per **group**, not per achievement. The ring colour shows the tier. The registry has an optional per-achievement `icon` override for later, and nothing else needs to change to use it.

## Why not count the activity feed

`activity_events` looks like the obvious source, but it is unreliable for counting:

- `recordActivity` folds a repeat of the latest event within an hour into one (re-rating, toggling a favorite).
- `forgetGame` / `forgetSubject` delete events when a game, grid or list is deleted.
- The feed has a `show_activity` opt-out, and an account delete cascades it away.

So achievements are computed from the real tables (entries, playthroughs, lists, ...). `recordActivity` is still the right **trigger**: it already runs inside the transaction of each action, so hooking the evaluation there covers every action without touching each service.

## Data model

One new table, `user_achievements`:

| Column        | Notes                                                              |
| ------------- | ------------------------------------------------------------------ |
| `user_id`     | references `users`, `ON DELETE CASCADE`                            |
| `key`         | the achievement key; permanent                                     |
| `unlocked_at` | ms since epoch; for a backfill or a new achievement, the eval time |

Unique index on `(user_id, key)`. Nothing else is stored: definitions live in code.

Two new `users` columns (names provisional):

- `show_achievements` (default on): the public-profile toggle.
- `achievements_seen_at`: drives the toast (see below).

The migration only creates the table and columns. Check the generated SQL for the FK/`ON DELETE` gotcha noted in CLAUDE.md.

Unlocks are **permanent**: deleting a game or rating afterwards does not take a badge back.

## Defining achievements

A declarative registry, one entry per achievement, so adding one is a single entry with no new route, table or UI code.

```ts
interface AchievementDef {
    key: string; // stored in the DB, so permanent
    name: string;
    description: string;
    group: AchievementGroup; // picks the badge icon
    icon?: string; // optional Lucide override of the group icon
    hidden?: boolean;
    retired?: boolean; // keeps existing unlocks, no longer awarded or shown as locked
    check: (s: AchievementStats) => boolean;
    progress?: (s: AchievementStats) => { current: number; target: number };
}
```

A helper builds counter tiers, which cover most achievements:

```ts
...tiers('rated', 'Critic', (s) => s.ratedCount, [1, 10, 100], { group: 'rating' })
// -> rated_1, rated_10, rated_100, each with check and progress filled in
```

One-offs are plain entries, e.g. Full House: `check: (s) => s.slotsTotal > 1 && s.slotsFilled === s.slotsTotal`.

### Stats snapshot

`AchievementStats` is a flat object of numbers and booleans, typed in `packages/shared`, computed on the server in `services/achievement-stats.ts` with a few aggregate queries.

- `check` and `progress` are **pure**: stats in, boolean/numbers out. No database access and no `Date.now()`; if an achievement needs the date, `now` is a field of the snapshot.
- Each achievement is then a one-line unit test with a hand-built stats object.
- Adding an achievement that needs a new stat means a field on the type plus a query; TypeScript forces both.

### Rules for keeping the registry safe

- **Keys are permanent.** Display text can change; keys cannot. Retire with `retired: true`.
- A **registry test** asserts: keys are unique; tier thresholds ascend; each `progress` target matches its `check` threshold; every group has an icon; no key from a checked-in list of known keys has disappeared.
- A new achievement reaches existing users on their next evaluation, plus a **sweep at server startup** over all users so they don't wait for their next action. `unlocked_at` is the evaluation time.

## Evaluation

`evaluateAchievements(db, userId)`:

1. Compute the stats snapshot.
2. Run every non-retired definition not yet unlocked.
3. Insert the satisfied ones with `ON CONFLICT DO NOTHING`.
4. Repeat until nothing new unlocks (the meta achievements depend on the unlocked set).
5. Return the new keys.

It is called from inside `recordActivity`'s transaction, so a rolled-back action unlocks nothing. Import commits and the backfill call it directly. A typical call is a handful of indexed counts, which is fine for SQLite at this scale. Verify the real hook points in the services before relying on `recordActivity` for all of them; some achievements may need a state the event doesn't carry.

## Hidden achievements

- The API must not send the name or description of a locked hidden achievement, only a placeholder.
- The web app must not ship achievement text either, or the JSON restriction is pointless. So the **definitions with text are served by the API** (`GET /api/achievements`), and the web bundle contains no achievement names. Adding an achievement then never needs a web change.
- The public profile endpoint applies the same rule, and returns nothing when `show_achievements` is off.

## Unlock toast

- A light poll (and a check on window focus) asks for unlocks newer than `users.achievements_seen_at`; the client toasts them and marks them seen with one call.
- This also covers startup-sweep and backfill unlocks without a burst: they are collapsed into one "N achievements unlocked" toast, as is an import.
- Chosen over adding `newAchievements` to a dozen mutation responses, which would touch every route.

## API and UI

- `GET /api/achievements`: all definitions with unlocked state and date, and progress for counter-style ones ("63 / 100"). Hidden locked ones are placeholders.
- A seen-marker call for the toast.
- Account page: the visibility checkbox.
- Public profile: a badges section, hidden when the owner has turned it off (plus a sub-page if the list is long).
- An **Achievements page** with a grid of badges grouped by category; locked ones greyed with a progress arc.
- `AchievementBadge` component, drawn in code like `ScoreGauge` and the identicons: shape plus a ring coloured by tier (bronze / silver / gold for tiered rows, neutral for one-offs), the group's Lucide icon, "?" for hidden. Colour is never the only cue (tier also as pips or text, as the score gauge does), and it respects reduced motion and light/dark.
- Loading skeleton for every new page and panel, built on the real classes, as the project rules require.

### Groups and icons

One Lucide icon per group (the exact icons are still to be picked and checked to exist in the installed version): collection, rating, finishing, queue and slots, wishlist and discover, organizing, profile, meta.

## First set of achievements

About 92 individual unlocks (tiered rows count each threshold), 8 hidden. Names are placeholders. **(H)** = hidden.

### Collection

| Achievement                                                     | Unlocks when                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------ |
| First Save → Stash → Hoard → Library → Archive → Vault → Museum | 1 / 10 / 50 / 100 / 250 / 500 / 1000 games in the collection |
| Console Hopper (2 tiers)                                        | games on 3 / 6 distinct platforms                            |
| Genre Explorer (2 tiers)                                        | collection spans 5 / 10 genres                               |
| Series Fan                                                      | 3+ games from one IGDB series                                |
| Time Traveler                                                   | own a game released before 1990                              |
| Fresh Release                                                   | own a game released in the last 30 days                      |
| Tagger (2 tiers)                                                | used 1 / 10 distinct tags                                    |

### Rating and favorites

| Achievement       | Unlocks when                                                    |
| ----------------- | --------------------------------------------------------------- |
| Critic (5 tiers)  | rated 1 / 10 / 50 / 100 / 250 games                             |
| Masterpiece       | gave a 5-star rating                                            |
| Full Spectrum     | used all five star values at least once                         |
| Fair and Balanced | rated every finished game (needs 10+ finished)                  |
| Ouch (H)          | gave a 1-star rating                                            |
| Hot Take (H)      | 5 stars on a game IGDB scores below 50, or 1 star on one at 80+ |
| Fan (3 tiers)     | 1 / 10 / 25 favorites                                           |

### Playing and finishing

| Achievement           | Unlocks when                                                 |
| --------------------- | ------------------------------------------------------------ |
| Press Start           | started a game                                               |
| Finisher (6 tiers)    | finished 1 / 10 / 25 / 50 / 100 / 250 games (distinct games) |
| Marathoner            | finished a game with time-to-beat of 40h or more             |
| Quick Fix             | finished a game with time-to-beat of 2h or less              |
| One Sitting           | finished a playthrough started the same or the next day      |
| Hot Streak            | 3 playthroughs finished within 7 days                        |
| Banner Year (3 tiers) | 10 / 25 / 50 finished in one calendar year                   |
| Replayer              | finished the same game twice                                 |
| Groundhog Day (H)     | finished the same game 3+ times                              |
| Letting Go (H)        | abandoned a game                                             |
| Cutting Losses        | 10 abandoned playthroughs                                    |
| Redemption (H)        | finished a game you had previously abandoned                 |
| Long Haul             | a finished playthrough that took 100+ days                   |
| Dust Off              | finished a game added to the collection 365+ days earlier    |
| Time Sink (3 tiers)   | 100 / 500 / 1000 hours of logged play time                   |
| Series Complete       | finished every owned game of a series with 3+ owned          |
| Genre Hopper          | finished games in 5 different genres                         |
| Retro                 | finished a game released before 2000                         |
| Current               | finished a game released this year                           |
| Juggler               | 3 games `playing` at once                                    |
| Inbox Zero (H)        | empty backlog with 10+ games in the collection               |

### Queue and slots

| Achievement       | Unlocks when                                       |
| ----------------- | -------------------------------------------------- |
| Planner (3 tiers) | 1 / 5 / 20 games in the queue                      |
| Slotted           | a game in a slot                                   |
| Full House (H)    | every slot filled at once (needs at least 2 slots) |

### Wishlist and Discover

| Achievement              | Unlocks when                                 |
| ------------------------ | -------------------------------------------- |
| Window Shopper (3 tiers) | 1 / 10 / 50 wishlist items                   |
| Picky (2 tiers)          | dismissed 1 / 25 games with "Not interested" |

### Organizing and writing

| Achievement          | Unlocks when               |
| -------------------- | -------------------------- |
| List Maker (2 tiers) | 1 / 5 lists                |
| Big List             | a list with 25+ games      |
| Filter Bubble        | made a smart list          |
| Rules Lawyer         | a smart list with 4+ rules |
| Gridlock             | made a grid                |
| Tier Maker           | made a tier list           |
| Note Taker (2 tiers) | 1 / 10 notes               |
| Open Book            | a public note              |

### Profile and account

| Achievement              | Unlocks when                                  |
| ------------------------ | --------------------------------------------- |
| Face Value               | set an avatar (upload or preset icon)         |
| About Me                 | wrote a bio                                   |
| Introductions            | set a real name                               |
| Well Connected (2 tiers) | 1 / all 4 social links                        |
| Out There                | allowed search-engine indexing of the profile |
| Regular (3 tiers)        | account is 30 days / 1 year / 2 years old     |

### Meta

| Achievement                  | Unlocks when                             |
| ---------------------------- | ---------------------------------------- |
| Achievement Hunter (3 tiers) | 10 / 25 / 50 other achievements unlocked |
| Platinum (H)                 | every non-hidden achievement unlocked    |

## Caveats

- **Metadata-dependent ones** (series, genre, release year, time-to-beat, IGDB score) silently skip games with missing metadata. Series Complete and Time Traveler depend on mirror and cache coverage.
- **Inbox Zero** can be earned by deleting games. Accepted for now; could require at least one finished game.
- **Meta achievements** depend on the unlocked set, hence the evaluation loop. Test it.
- **Import** can unlock many at once, collapsed into one toast. `unlocked_at` can't be backdated, so they all show the import date.
- **Replay and Redemption** read playthrough rows: an abandoned one, then a later finished one for the same entry.

## Not in v1 (needs history, not state)

Random-pick usage, login streaks, "finished a game from the queue" (starting a game dequeues it), "moved a game from wishlist to collection", visits to Stats or Save File. These need a counter table that something increments. The registry could later take an optional `counter` key without changing existing entries.

## Later: XP and levels

Deferred by the user ("just achievements for now"). Assumed design if it is added, with **XP permanent** (never taken away when a game, rating or playthrough is deleted):

- An `xp_events` ledger (`user_id`, `source_key`, `amount`, `at`), unique on `(user_id, source_key)`, no foreign keys except the user (cascade on account delete). Awards use `ON CONFLICT DO NOTHING`, so they are idempotent.
- Keys must **outlive the thing they reward**, or delete-and-re-add farms XP: key by IGDB game id (`added:<igdbId>`, `rated:<igdbId>`, `favorited:<igdbId>`), and for finishes either once per game or `finished:<igdbId>:<nth>`.
- The `amount` is stored on each row. Because XP is permanent, rebalancing later is an explicit migration, not a free recompute. Total XP is a `SUM`; the level comes from a pure curve function in shared code.
- Awarded where the action happens (`recordActivity` already carries `type`, `gameId` and `detail`). Achievements can award XP through the same ledger (`ach:<key>`).
- Imports do not earn XP (a 500-game import would be an instant level-up), though they do count for achievements. Write their ledger rows with `amount = 0` so the keys are burned and export, delete and re-import can't farm XP later.
- Backfill is a one-time grant from current state; already-deleted history can't be reconstructed.
- UI: level and XP bar on Account and home, level on the public profile (same private toggle), and the existing toast extended with "+N XP" and "Level up!".
- The real work is the economy (amounts, curve, caps), not the code. Ship conservative: sources can be added later but permanent XP can't be clawed back.

## Open items

- Final names and thresholds (everything above is a placeholder).
- Exact column names (`show_achievements`, `achievements_seen_at`).
- The Lucide icon for each group, checked against the installed version.
- Whether the public profile needs a badges sub-page or just a highlight row.
- Whether the startup sweep runs for all users or only when the registry changed.
- Confirm the evaluation hook points against the actual services before building.

## Docs to update when built

`ARCHITECTURE.md` (table, routes, evaluation, toast, Account and profile pages), `CLAUDE.md` status and product decisions, and a short mention in `OVERVIEW.md`. Tests use `makeApp`: each definition gets a not-yet / now case, plus idempotence, rollback leaving no unlock, backfill, the meta loop, and the hidden-placeholder rule in the API.
