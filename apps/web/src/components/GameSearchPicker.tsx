import type { SearchResultDto } from '@gamequeue/shared';
import { SearchX } from 'lucide-react';
import { useState } from 'react';
import { ApiRequestError } from '../api/client';
import { useGameSearch } from '../api/collection';
import { useDebounced } from '../lib';
import { Cover } from './Cover';
import { MetaLine } from './MetaLine';
import { PlatformTags } from './PlatformIcon';
import { ResultSkeletons } from './ResultSkeletons';

/**
 * An IGDB search box with clickable results, for picking one game (grid cells, tier lists).
 * `onPick` gets the result; `busy` disables the results while the pick is being saved.
 */
export function GameSearchPicker({
    onPick,
    busy = false,
    autoFocus = false
}: {
    onPick: (game: SearchResultDto) => void;
    busy?: boolean;
    autoFocus?: boolean;
}) {
    const [text, setText] = useState('');
    const q = useDebounced(text.trim(), 300);
    const search = useGameSearch(q);
    const searching = text.trim().length >= 2 && (search.isFetching || q !== text.trim());
    const noResults = !searching && !search.isError && search.data?.length === 0 && q.length >= 2;
    const status =
        text.trim().length < 2
            ? 'Type at least 2 characters.'
            : searching
              ? 'Searching…'
              : search.isError
                ? search.error instanceof ApiRequestError
                    ? search.error.message
                    : 'Search failed.'
                : noResults
                  ? 'No games found.'
                  : '';

    return (
        <div className="picker">
            <label className="field">
                <span>Search IGDB</span>
                <input
                    type="search"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    autoFocus={autoFocus}
                    data-autofocus={autoFocus || undefined}
                    autoComplete="off"
                    placeholder="e.g. Hades"
                />
            </label>
            <div aria-live="polite" className="sr-only">
                {status}
            </div>
            {search.isError && !searching && (
                <p className="form-error" role="alert">
                    {status}
                </p>
            )}
            <ul className="results picker__results" aria-busy={searching || busy}>
                {searching && <ResultSkeletons trailing="badge" />}
                {noResults && (
                    <li className="empty-state" aria-hidden="true">
                        <span className="empty-state__icon">
                            <SearchX />
                        </span>
                        <strong>No games found for “{q}”</strong>
                    </li>
                )}
                {!searching &&
                    search.data?.map((r) => (
                        <li key={r.igdbId}>
                            <button
                                type="button"
                                className="result"
                                disabled={busy}
                                onClick={() => onPick(r)}
                            >
                                <Cover imageId={r.coverImageId} name={r.name} size="cover_big" />
                                <span className="result__text">
                                    <strong>{r.name}</strong>
                                    <span className="muted">
                                        <MetaLine
                                            parts={[
                                                r.year,
                                                <PlatformTags
                                                    key="p"
                                                    platforms={r.platforms.slice(0, 4)}
                                                />
                                            ]}
                                        />
                                    </span>
                                </span>
                            </button>
                        </li>
                    ))}
            </ul>
        </div>
    );
}
