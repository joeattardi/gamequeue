import { coverUrl, type EntryDto } from '@gamequeue/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useViewTransitionState, type createBrowserRouter } from 'react-router';

type DataRouter = ReturnType<typeof createBrowserRouter>;
type NavigateOptions = Parameters<DataRouter['navigate']>[1];

/** The `view-transition-name` a game's cover carries on both ends of a card → game page morph. */
export const COVER_TRANSITION = 'game-cover';

/**
 * Whether a navigation gets a view transition: only moves to another page (not search-param
 * changes such as filters or paging), not redirects (`replace`), and only where the browser can
 * and the user hasn't asked for reduced motion.
 */
function wantsTransition(to: unknown, opts: NavigateOptions): boolean {
    if (opts?.replace) return false;
    if (typeof document.startViewTransition !== 'function') return false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    const path = typeof to === 'string' ? to : (to as { pathname?: string } | null)?.pathname;
    if (path == null) return false;
    return new URL(path, window.location.href).pathname !== window.location.pathname;
}

/**
 * The browser aborts a running view transition when the viewport changes size (a phone's address
 * bar sliding away, rotating, a resized window) and rejects the transition's `ready` and
 * `finished` promises with an `InvalidStateError`. Nobody awaits those here, so each abort shows up
 * as an "Uncaught (in promise)" console error even though the navigation itself went through. Mark
 * the promises as handled. The page update still runs (`updateCallbackDone` is left alone, so a
 * real error in it is still reported).
 */
let quieted = false;
function quietAbortedTransitions() {
    if (quieted || typeof document.startViewTransition !== 'function') return;
    quieted = true;
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = ((...args: Parameters<typeof start>) => {
        const transition = start(...args);
        transition.ready.catch(() => {});
        transition.finished.catch(() => {});
        return transition;
    }) as typeof document.startViewTransition;
}

/**
 * Turns on React Router's `viewTransition` for every link and `navigate()` that leaves the page,
 * so no call site has to ask for it. Every link, `useNavigate` and `<Navigate>` goes through
 * `router.navigate`; an explicit `viewTransition` option still wins. Browser back and forward
 * (history pops) never animate.
 */
export function withPageTransitions(router: DataRouter): DataRouter {
    quietAbortedTransitions();
    const navigate = router.navigate.bind(router);
    router.navigate = ((to: unknown, opts?: NavigateOptions) =>
        typeof to === 'number'
            ? navigate(to)
            : navigate(to as Parameters<typeof navigate>[0], {
                  viewTransition: wantsTransition(to, opts),
                  ...opts
              })) as DataRouter['navigate'];
    return router;
}

/**
 * For a link to an owned game's page: names this cover for the morph only while that page is
 * opening (names must be unique on the page), and on click seeds the game page's query with the
 * entry already in hand, so the page renders with its cover at once instead of a skeleton. The
 * seed is stale straight away, so the page still refetches it.
 */
export function useEntryLink(entry: EntryDto) {
    const qc = useQueryClient();
    const to = `/games/${entry.id}`;
    const morphing = useViewTransitionState(to);
    return {
        to,
        onClick: () => {
            qc.setQueryData<EntryDto>(['entry', entry.id], (old) => old ?? entry);
            // Start fetching the game page's larger cover now, so it is there when the morph lands
            if (entry.game.coverImageId)
                new Image().src = coverUrl(entry.game.coverImageId, '720p');
        },
        coverTransition: morphing ? COVER_TRANSITION : undefined
    };
}
