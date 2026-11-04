# GameQueue UX Redesign: Claude Code Prompt

Nov 2, 2026 · @Joe Attardi

## Context

This brief turns a UX review and four mockups into a phased redesign of the GameQueue UI. The goal is the most beautiful and pleasant personal game collection manager, one that looks good with 2 games and with 2,000. Work in the existing repo and follow its conventions.

**What changes**

- A status color language used everywhere (cards, chips, filters, stats).
- A cover-first Collection with three densities (Wall, Grid, List), status visible at a glance, and filters in a compact top bar instead of a wide right-hand panel.
- One obvious primary action per screen.
- One lifecycle in the navigation: Play, Library, Explore, Insights. Backlog and Wishlist become views of the Collection, not separate destinations.
- One global search and jump palette (⌘K) replacing the three search boxes, plus a redesigned mobile search.
- Tags that belong to the user, separate from IGDB genres.
- No footer that duplicates the nav.

**What stays**

- Data model, auth, IGDB integration, API routes, Docker and Raspberry Pi deployment. This is a UI redesign; touch the backend only where a section below says so.
- Game states stay Not Started, Playing, Paused, Abandoned, Finished. "Backlog" in the mockups is a view of Not Started games, not a new state. "Up next" is the existing ordered queue.
- Wishlist stays a special list. Price tracking, grids and tier lists stay cut.

**Reference**

The mockups live on a canvas titled "GameQueue Redesign Mockups" with eight artboards: Collection, Game detail, Now playing, Command palette, Collection wall view, and three Mobile search screens (landing, results, quick add). Claude Code can't open that link, so export the artboards as PNGs into `docs/mockups/` and treat them as the visual target. Mockup data (hours played, sessions, the 50-hour estimates, the mood chips) is sample content, not a spec.

## Design tokens

Define these once as CSS variables (or the project's existing theme mechanism) and replace hard-coded colors as you go. Every text color below passes 4.5:1 on the surface it sits on.

| Token | Value | Use |
| --- | --- | --- |
| `--bg-0` | #080B14 | App background |
| `--bg-1` | #0E1220 | Sidebar, rail, inset fields |
| `--bg-2` | #151A2C | Cards, panels, filter chips |
| `--bg-3` | #1D2338 | Hover, selected rows, active nav |
| `--line` | #262D45 | Borders on cards and inputs |
| `--line-strong` | #343C5A | Borders on secondary buttons |
| `--text` | #EEF1FB | Primary text |
| `--text-2` | #A9B1CC | Secondary text |
| `--text-3` | #8A93B2 | Labels, counts (use for 12px+ only) |
| `--accent` | #6C8CFF | Primary buttons, focus ring, active icons |
| `--status-playing` | #6C8CFF | Playing |
| `--status-paused` | #F4B740 | Paused |
| `--status-finished` | #3DD6A0 | Finished |
| `--status-abandoned` | #F0707E | Abandoned |
| `--status-notstarted` | #8A93B2 | Not Started, Backlog, Up next |
| `--status-wishlist` | #B391FF | Wishlist |

**Type and shape**

- Display and headings: Outfit, weights 600 to 800, tight tracking (about -0.02em). Body and UI: Inter, 400 to 600.
- Radii: cards and covers 14px, panels 18 to 20px, buttons 12 to 14px, chips fully round.
- Surfaces get three levels of depth (bg-1, bg-2, bg-3) plus a soft shadow on covers; avoid one flat navy for everything.
- Never rely on color alone for status: every status chip shows a dot, the color, and a text label.
- Touch targets are at least 44px on mobile. Icon-only buttons need an aria-label.

A status color helper (`statusColor(state)`) should be the single place that maps game state to a token.

## Work order

Start on the `redesign` branch. Never work or open pull requests targeted to `main`, only `redesign`.

Build in six phases, one branch and one PR per phase, each deployable on its own. Stop after each phase and report before starting the next.

### Phase 0: Read and plan (no code)

- Read the repo and list the routes, layout components, theme setup, and how Collection, game detail, and Now playing are built today.
- Write a short plan to `docs/ux-redesign-plan.md`: which files each phase touches, and anything in this brief that conflicts with the existing code.
- Capture "before" screenshots of every screen at desktop and phone width.

### Phase 1: Foundation and shell

- Add the design tokens, load Outfit and Inter, and add the `statusColor` helper.
- Rebuild the app shell: sidebar with Play, Library, Explore, Insights groups; a collapsed icon rail; user menu holding Data and Account. Move the DEV badge into the user block so it never overlaps the wordmark.
- Remove the footer. Replace the "data could be lost" line with one dismissible banner.
- Done when: every existing page renders inside the new shell, nav labels match the structure below, and the profile page uses the same shell.

### Phase 2: Global search (⌘K)

- One palette that searches the user's library and IGDB, with quick actions and keyboard navigation. Remove the sidebar search box, the Collection page search box, and the footer Search link.
- Done when: ⌘K or `/` opens it from any page, arrow keys and Enter work, and adding an IGDB result to the library needs no page change.

* Mobile search: on phones, replace the current Search page with the three screens described under Screen specs (landing, results, quick add) and add the bottom tab bar. The palette above is the desktop and tablet version; both share one search API and one result model.
* Done when (mobile): at 390 px wide with the keyboard open you can see at least three results below the search field, and adding a game from a result takes one tap on + plus one confirmation, without leaving the results.

### Phase 3: Collection

- Cover-first grid with a status chip on every card, a progress bar on Playing games, and title and platform under each cover. Cards lift on hover.
- Status tabs (All, Playing, Paused, Finished, Abandoned, Not Started, Wishlist) with counts, plus a top filter bar. Hide filters with a single option.
- Separate user tags from IGDB genres. Stop importing IGDB keywords as tags, and normalize case.
- Sort options beyond title: recently added, IGDB score, release date.
- Done when: you can tell every game's state without opening it, the right-hand filter panel is gone, and a library of 2,000 games scrolls smoothly (virtualize or paginate if needed).

* Add a Wall, Grid, List density switch in the header and remember the choice per user. Wall is the default on desktop; on touch devices and below 768 px the default is Grid. Build Wall first (spec under Screen specs), then Grid and List.
* Wall mode: square-cornered covers edge to edge with a 1px seam, no titles at rest, and a 4px status-color bar along the bottom of every cover. On hover and keyboard focus, show the title, platform, status, and a quick action.
* Below 768 px and on touch devices, Wall falls back to Grid with titles visible, because there is no hover.
* Done when (Wall): status is readable without hovering, the overlay is reachable by keyboard, and a 2,000-game library stays smooth (lazy-load covers, virtualize rows).

### Phase 4: Game detail

- Blurred cover-colored backdrop hero, cover on the left, compact facts on the right (IGDB score ring, platform).
- One contextual primary button: Start playing for Not Started, Resume for Paused, and so on. "Add to queue" is a secondary button. A segmented control sets any status.
- Screenshots as a horizontal row with a lightbox. A clamped description with Read more. Playthroughs collapsed until used. Rating, notes, and tags in a "Your take" panel.
- Done when: the left column no longer runs far longer than the right and the page works at phone width.

### Phase 5: Now playing

- Replace the large greeting banner with a one-line header. Hero card for each game in progress, then the ordered Up next list with drag-to-reorder and a Start button.
- Demote activity: no weekly chart on this page, only a quiet "This week" line linking to Stats.
- Done when: the Finished and Abandon actions are no longer the loudest buttons and Up next reorders persist.

### Phase 6: Polish and cleanup

- Responsive pass at 390, 768, and 1280 px. Keyboard and focus pass. Contrast check on all text.
- Empty states for a brand-new account: add your first game, build your queue.
- Profile page: replace the grid of nine stat tiles with one stacked status bar and two or three real stats; fit the activity calendar to its container.
- Delete dead styles and components, and capture "after" screenshots for the PR.

## Screen specs

### Navigation

- **Play:** Now playing, Queue
- **Library:** Collection, Lists
- **Explore:** Pick for me (the existing random pick), Discover, Ask AI
- **Insights:** Stats, with Save File inside it

There is no separate Backlog or Wishlist page. Both are tabs on the Collection, and Wishlist stays a special list underneath.

### Command palette

Three result groups: In your library, Actions (start playing, add to queue for the highlighted game), and Add from IGDB. The highlighted row has an accent ring. Footer hints: ↑↓ navigate, ↵ open, ⇥ quick add. Show the same palette from the sidebar button "Search or jump to…".

### Mockup elements to adapt, not copy

Some mockup details assume data or features the app may not have. Check each against the code and follow this table.

| Mockup element | What to do |
| --- | --- |
| 5-star "Your take" rating | Keep the existing 1 to 10 rating, restyled to match |
| Hours played, sessions, progress % | Show only when playthrough data records them; otherwise hide, never fake |
| "Time to beat" filter and estimates | Include only if IGDB time-to-beat is available; otherwise omit |
| "Save as view" button | Out of scope; omit |
| Mood chips (Short, Cozy, Story-heavy, Co-op) | Out of scope; keep only a "Pick one for me" button wired to the existing random pick |
| "Log session" primary button | See open question in the rules below |
| Sample game names and gradient covers | Placeholders; real covers come from IGDB |

### Screen-level details worth keeping

- **Collection card:** cover at 2:3, status chip top-left (dot, color, label), progress bar flush to the bottom edge only for Playing, title and one meta line below. Active status tab is a filled light pill; active filters are accent-outlined chips with a clear button.
- **Game detail:** the status control shows one dot per status; the current state is filled. The IGDB score ring uses the Finished green for high scores.
- **Now playing:** hero card tinted from the cover; secondary actions (Pause, Mark finished) are outlined buttons, and Abandon moves into a ••• menu. Paused games appear in a small side card with a Resume button.

### Wall view (Collection density mode)

An uninterrupted wall of covers for browsing, with details on hover. Grid and List remain for detail-first browsing; List always shows full details.

- **Layout:** CSS grid with `repeat(auto-fill, minmax(150px, 1fr))`, 2:3 covers, no border radius, and a seam set by one variable (`--wall-seam`, default 1px, can be 0). Page background shows through the seam.
- **Status bar:** a 4px bar flush to the bottom edge of every cover, colored by `statusColor(state)`. It is always visible. Do not hide it on hover.
- **Resting state:** art only. Covers without art show the title as typography on a gradient, so no tile is blank.
- **Hover and focus:** the cover scales to about 1.06 above its neighbors (raised z-index, soft shadow). A gradient overlay fades in over about 150 ms with the title, a meta line (platform and status), a primary quick action, and a + button that adds to the queue.
- **Quick action by state:** Start (Not Started), Continue (Playing), Resume (Paused). For Finished, Abandoned, and Wishlist, omit the primary quick action unless the app already has an equivalent; keep the + button only where adding to the queue makes sense.
- **Markup:** each tile links to the game detail page. Do not nest buttons inside the link. Put the quick-action buttons in a sibling layer revealed with `:hover` and `:focus-within`, so keyboard users get the same details.
- **Focus ring:** a 2px accent outline drawn inside the tile (negative offset), so the neighbors don't clip it.
- **Touch and narrow screens:** fall back to the Grid layout with titles visible. Do not require a tap to reveal details.
- **Reduced motion:** disable the scale transform when `prefers-reduced-motion` is set; keep the overlay fade or make it instant.

### Mobile search (phones)

The current mobile search wastes the screen: a heading and subtitle push the field down, results are tall cards, and the keyboard leaves room for about one and a half of them. Rebuild it as three screens.

**Navigation**

- Phones get a bottom tab bar: Play, Library, Search, Stats, More. Search is the thumb-reach entry point; drop the hamburger menu on phones. Respect the bottom safe-area inset.

**1. Landing**

- A large tappable field ("Your library and IGDB") under a plain "Search" title with the library count.
- Recent searches (the last 5, per user, with Clear). Tapping one fills the field. Include the arrow control that fills the field without running the search.
- Jump back in: covers of games in Playing and the top of Up next, each linking to its detail page.

**2. Results**

- Search row at the top: field with a clear button and a Cancel text button. No heading or subtitle on this screen.
- A horizontal chip row for scope: All, In library, Add new (with counts), then the user's platforms. It scrolls sideways and hides its scrollbar.
- Results fill the space between the chips and the keyboard and scroll independently. Dragging the list dismisses the keyboard. Fade the bottom edge of the list. Size the area with `visualViewport` so it adapts to any keyboard height.
- Two groups, in this order: In your library, then Add from IGDB. Group headers are small caps labels.
- Result row, 80px high: 44 x 62 cover, title with the matching text highlighted in a light accent, one meta line (year, then up to three platforms and "+N"), and a small IGDB score pill. Trailing control: the status chip (dot, color, label) for games already in the library, or a 44px round + button for games that are not.
- Behavior: debounce typing by about 250 ms, start searching at two characters, show skeleton rows while loading, and cache results so repeated queries don't hit IGDB again.
- Tapping a library row opens its game detail page. Tapping an IGDB row or its + opens the quick-add sheet.

**3. Quick-add sheet**

- A bottom sheet with a grabber, the cover, title, year, developer, genre, and score.
- "Where do you own it?": platform chips from the game's IGDB platforms, multi-select, 44px high. Preselect the platform the user added most recently.
- "Add it as": a two-by-two choice. Play now sets the state to Playing and starts today. Up next sets Not Started and appends to the queue. Not started just saves it. Wishlist adds it to the Wishlist list.
- The primary button label follows the choice ("Add to Up next"). A secondary "View full details" link goes to the detail page.
- After adding: close the sheet, keep the query and results in place, update that row to show its new status chip, and show a toast with Undo. Do not move the user to another page.

**Rules for all three screens**

- Touch targets are at least 44px. Respect top and bottom safe-area insets.
- Mockup data is sample content. Only the Dragon Age: Origins cover and score came from the real app.
- Honor `prefers-reduced-motion` for the sheet and list transitions.

## Rules for the agent

- Work on a branch per phase and open a PR for each. Do not push to main.
- Keep scope tight: UI and the small data changes named above only. No database migrations that lose data, no new dependencies without a one-line reason in the PR.
- Reuse existing components and the project's styling approach. Do not introduce a second styling system.
- Never invent data. If a mockup element has no real data behind it, hide it and say so in the PR.
- Responsive from the start: check every screen at 390, 768, and 1280 px before calling a phase done.
- Accessibility: real buttons and links, visible focus rings, labels on icon-only buttons, and no information carried by color alone.
- After each phase, stop and report: what changed, screenshots (before and after), anything that conflicted with this brief, and what you skipped.
- If a decision is not covered here, pick the simplest option, note it in the PR, and keep going.

**Open question to settle in Phase 5:** the Now playing hero's primary button. If the app records sessions or hours, label it "Log session"; if it doesn't, use "Add journal entry" (when journals exist) or "Mark finished" instead. The primary button should be the action the user takes most often.

## Starter prompt

Export this doc as Markdown into the repo as `docs/ux-redesign.md`, add the mockup PNGs under `docs/mockups/`, then paste this into Claude Code:

```
I'm redesigning the GameQueue UI. Read docs/ux-redesign.md (the full brief: context, design tokens, six-phase work order, screen specs, rules) and look at the mockups in docs/mockups/.

Start with Phase 0 only. Do not write any application code yet:
1. Explore the repo and summarize how the layout, theme, Collection, game detail, and Now playing screens are built today.
2. Write docs/ux-redesign-plan.md: which files each phase will touch, and any conflicts between the brief and the existing code (for example, the 1-10 rating versus the 5-star mockup).
3. Take "before" screenshots of every screen at 390, 768, and 1280 px.

Then stop and show me the plan. After I approve it, do Phase 1 on its own branch, open a PR, and stop again for review. Follow the rules section of the brief for every phase.
Start your work on the `redesign` branch, and target the first PR to the `redesign` branch. NOTHING goes to `main`.
```

After each PR, use the same pattern: "Phase N is approved, start Phase N+1."
