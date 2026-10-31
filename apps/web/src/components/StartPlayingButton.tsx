import type { EntryDto } from '@gamequeue/shared';
import { Play } from 'lucide-react';
import { useState } from 'react';
import { ApiRequestError } from '../api/client';
import { useEntryAction } from '../api/collection';
import { todayLocal } from '../lib';

/**
 * Starts a game in one click: opens a playthrough, sets it to playing and takes it off the queue.
 * A game owned on several platforms needs to know which one, so a small select appears in place
 * (no dialog); with one platform, or none, the click starts it straight away.
 */
export function StartPlayingButton({
    entry,
    className = 'btn btn--primary',
    label = 'Start playing',
    onStarted
}: {
    entry: EntryDto;
    className?: string;
    label?: string;
    onStarted?: () => void;
}) {
    const act = useEntryAction(entry.id);
    const [choosing, setChoosing] = useState(false);
    const [platformId, setPlatformId] = useState('');
    const [error, setError] = useState<string>();

    const start = (id?: number) => {
        setError(undefined);
        act.mutate(
            { action: 'start', body: { date: todayLocal(), ...(id ? { platformId: id } : {}) } },
            {
                onSuccess: onStarted,
                onError: (e) =>
                    setError(e instanceof ApiRequestError ? e.message : "Couldn't start the game.")
            }
        );
    };
    const onClick = () => {
        if (entry.platforms.length > 1) return setChoosing(true);
        start(entry.platforms[0]?.id);
    };

    return (
        <span className="start-playing">
            {choosing ? (
                <span className="start-playing__choose">
                    <select
                        aria-label={`Platform for ${entry.game.name}`}
                        value={platformId}
                        onChange={(e) => setPlatformId(e.target.value)}
                        autoFocus
                    >
                        <option value="">Playing it on…</option>
                        {entry.platforms.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        className={className}
                        disabled={!platformId || act.isPending}
                        onClick={() => start(Number(platformId))}
                    >
                        <Play aria-hidden="true" />
                        Start
                    </button>
                </span>
            ) : (
                <button
                    type="button"
                    className={className}
                    disabled={act.isPending}
                    onClick={onClick}
                >
                    <Play aria-hidden="true" />
                    {label}
                </button>
            )}
            {error && (
                <span className="form-error" role="alert">
                    {error}
                </span>
            )}
        </span>
    );
}
