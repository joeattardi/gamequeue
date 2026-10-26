import { availableActions, type EntryDto } from '@gamequeue/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiRequestError } from '../api/client';
import { useEntryAction } from '../api/collection';
import { todayLocal } from '../lib';

const STATUS_ID = 'status';

/** Brings the Status panel (and its forms) into view. */
export function scrollToStatus() {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document
        .getElementById(STATUS_ID)
        ?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
}

/**
 * Phones only: the game page's main actions pinned above the tab bar, so starting, pausing,
 * resuming or finishing a game doesn't mean scrolling back up to the Status panel. It slides away
 * while that panel is on screen, since it would only repeat it. Anything that needs more input
 * than a tap (picking a platform, the finish form) hands over to the panel instead.
 */
export function EntryActionBar({
    entry,
    onFinish,
    children
}: {
    entry: EntryDto;
    /** Opens the finish form in the Status panel */
    onFinish: () => void;
    /** Extra controls at the end of the bar, e.g. the favorite heart */
    children?: ReactNode;
}) {
    const act = useEntryAction(entry.id);
    const [statusInView, setStatusInView] = useState(true);
    const [error, setError] = useState<string>();
    const actions = availableActions(entry.status);

    useEffect(() => {
        const el = document.getElementById(STATUS_ID);
        if (!el) return;
        const observer = new IntersectionObserver(([e]) => setStatusInView(!!e?.isIntersecting));
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const run = (action: Parameters<typeof act.mutate>[0]) => {
        setError(undefined);
        act.mutate(action, {
            onError: (e) =>
                setError(e instanceof ApiRequestError ? e.message : 'Something went wrong.')
        });
    };
    const start = () => {
        // Several platforms: the panel asks which one
        if (entry.platforms.length > 1) return scrollToStatus();
        const platform = entry.platforms[0];
        run({
            action: 'start',
            body: { date: todayLocal(), ...(platform ? { platformId: platform.id } : {}) }
        });
    };

    const hidden = statusInView;
    return (
        <div
            className={hidden ? 'action-bar is-hidden' : 'action-bar'}
            role="region"
            aria-label="Quick actions"
            inert={hidden}
        >
            {error && (
                <p className="action-bar__error" role="alert">
                    {error}
                </p>
            )}
            <div className="action-bar__row">
                {actions.includes('start') && (
                    <button
                        type="button"
                        className="btn btn--primary"
                        disabled={act.isPending}
                        onClick={start}
                    >
                        {entry.status === 'unplayed' ? 'Start playing' : 'Play again'}
                    </button>
                )}
                {actions.includes('resume') && (
                    <button
                        type="button"
                        className="btn btn--primary"
                        disabled={act.isPending}
                        onClick={() => run({ action: 'resume' })}
                    >
                        Resume
                    </button>
                )}
                {actions.includes('pause') && (
                    <button
                        type="button"
                        className="btn"
                        disabled={act.isPending}
                        onClick={() => run({ action: 'pause' })}
                    >
                        Pause
                    </button>
                )}
                {actions.includes('finish') && (
                    <button
                        type="button"
                        className={entry.status === 'playing' ? 'btn btn--primary' : 'btn'}
                        onClick={() => {
                            onFinish();
                            scrollToStatus();
                        }}
                    >
                        Mark finished
                    </button>
                )}
                {children}
            </div>
        </div>
    );
}
