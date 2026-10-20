# TODO

## Better IGDB error handling and a way to test it

Goal: refine the error UX for when IGDB fails or rate limits us, and make those scenarios easy to
reproduce. Decided against Mock Service Worker: the browser only talks to our own `/api/igdb/*`
routes, and the server tests already inject a fake `fetch` into the IGDB client.

- [ ] **Distinguishable errors.** `callIgdb` (`apps/server/src/services/games.ts`) turns every IGDB
      or Twitch failure into one generic 502. Add a machine-readable `code` to the error body
      (`igdb_rate_limited` with `retryAfter`, `igdb_unavailable`, `igdb_not_configured`) and have
      the UI show a specific message for each (e.g. "IGDB is busy, retry in Ns" with a retry
      button; "IGDB is down, your collection still works").
- [ ] **Dev-only fault switch.** Something like `IGDB_FAULT=rate_limit|down|slow|flaky` that wraps
      the IGDB client's `fetchFn`, ignored in production. Exercises the real limiter, 429 backoff,
      search cache and UI in the browser without a new dependency.
- [ ] **Tests.** Server tests assert status + `code` per failure mode via the existing fake fetch;
      component tests for the error UI can use plain mocked fetch responses.
- [ ] **Audit the other IGDB-touching flows.** Search and add-game call IGDB; slots, queue, stats
      etc. work from the cache. Check that add-game and the game page degrade cleanly too, not just
      search.
- [ ] **Open question:** when IGDB is down, should search serve stale cached hits for the same query
      (`TtlCache` in `apps/server/src/igdb/search-cache.ts`)?

## Favorites

Goal: allow the user to mark certain games as favorites, and let them browse/search by favorites and annotate
favorite games as such in the UI. Use a heart icon rather than a star so the favorite state isn't confused with a star rating.

## Pagination

Pagination of game lists.
