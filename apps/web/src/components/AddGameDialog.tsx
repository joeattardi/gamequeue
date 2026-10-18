import type { SearchResultDto } from '@gamequeue/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAddEntry, useAllPlatforms, useGameSearch } from '../api/collection';
import { ApiRequestError } from '../api/client';
import { useDebounced } from '../lib';
import { MetaLine } from './MetaLine';
import { PlatformIcon, PlatformTags } from './PlatformIcon';
import { Cover } from './Cover';
import { ResultSkeletons } from './ResultSkeletons';
import { useModalDialog } from './useModalDialog';
import { ScoreGauge } from './ScoreGauge';
import { SearchX, X } from 'lucide-react';

export function AddGameDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const ref = useModalDialog(open);

    return (
        <dialog
            ref={ref}
            className="dialog dialog--fixed"
            onClose={onClose}
            aria-labelledby="add-title"
            onClick={(e) => e.target === ref.current && onClose()}
        >
            {open && <AddGameBody onDone={onClose} />}
        </dialog>
    );
}

function AddGameBody({ onDone }: { onDone: () => void }) {
    const [text, setText] = useState('');
    const q = useDebounced(text.trim(), 300);
    const search = useGameSearch(q);
    const [picked, setPicked] = useState<SearchResultDto>();
    const searching = text.trim().length >= 2 && (search.isFetching || q !== text.trim());

    const status =
        text.trim().length < 2
            ? 'Type at least 2 characters.'
            : searching
              ? 'Searching…'
              : search.isError
                ? search.error instanceof ApiRequestError
                    ? search.error.message
                    : 'Search failed.'
                : search.data?.length === 0
                  ? 'No games found.'
                  : '';
    const noResults = !searching && !search.isError && search.data?.length === 0 && q.length >= 2;
    const visible = status !== '' && !searching && !noResults;

    return (
        <div className="dialog__body dialog__body--fill">
            <div className="dialog__head">
                <h2 id="add-title">
                    {picked ? 'Which platforms do you own it on?' : 'Add a game'}
                </h2>
                <button className="btn btn--ghost" onClick={onDone} aria-label="Close">
                    <X />
                </button>
            </div>
            {picked ? (
                <PlatformStep game={picked} onBack={() => setPicked(undefined)} onDone={onDone} />
            ) : (
                <>
                    <label className="field">
                        <span>Search IGDB</span>
                        <input
                            type="search"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            autoFocus
                            data-autofocus
                            autoComplete="off"
                            placeholder="e.g. Hades"
                        />
                    </label>
                    {/* Always mounted so screen readers announce changes; only takes up room when there is text to see */}
                    <div aria-live="polite" className={visible ? 'search-status muted' : 'sr-only'}>
                        {status}
                    </div>
                    <ul className="results" aria-busy={searching}>
                        {searching && <ResultSkeletons />}
                        {noResults && (
                            <li className="empty-state" aria-hidden="true">
                                <span className="empty-state__icon">
                                    <SearchX />
                                </span>
                                <strong>No games found for “{q}”</strong>
                                <span className="muted">
                                    Check the spelling, or try a shorter or simpler title.
                                </span>
                            </li>
                        )}
                        {!searching &&
                            search.data?.map((r) => (
                                <li key={r.igdbId}>
                                    <button
                                        className="result"
                                        disabled={r.entryId !== null}
                                        onClick={() => setPicked(r)}
                                    >
                                        <Cover
                                            imageId={r.coverImageId}
                                            name={r.name}
                                            size="cover_big"
                                        />
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
                                        {r.entryId !== null && (
                                            <span className="badge">In collection</span>
                                        )}
                                        {/* A fixed-width slot keeps the scores lined up, rated or not */}
                                        <span className="result__score">
                                            {r.igdbRating !== null && (
                                                <ScoreGauge
                                                    value={r.igdbRating}
                                                    label="IGDB"
                                                    size={56}
                                                />
                                            )}
                                        </span>
                                    </button>
                                </li>
                            ))}
                    </ul>
                </>
            )}
        </div>
    );
}

function PlatformStep({
    game,
    onBack,
    onDone
}: {
    game: SearchResultDto;
    onBack: () => void;
    onDone: () => void;
}) {
    const navigate = useNavigate();
    const add = useAddEntry();
    const all = useAllPlatforms();
    const [chosen, setChosen] = useState<Set<number>>(
        () => new Set(game.platforms.length === 1 ? [game.platforms[0]!.id] : [])
    );
    const [error, setError] = useState<string>();
    const known = new Map(game.platforms.map((p) => [p.id, p]));
    const extras = (all.data ?? []).filter((p) => chosen.has(p.id) && !known.has(p.id));
    const options = [...game.platforms, ...extras];

    const toggle = (id: number) =>
        setChosen((s) => {
            const n = new Set(s);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });

    function submit() {
        setError(undefined);
        if (chosen.size === 0) return setError('Pick at least one platform.');
        add.mutate(
            { igdbId: game.igdbId, platformIds: [...chosen] },
            {
                onSuccess: (entry) => {
                    onDone();
                    navigate(`/games/${entry.id}`);
                },
                onError: (e) =>
                    setError(e instanceof ApiRequestError ? e.message : "Couldn't add the game.")
            }
        );
    }

    return (
        <div className="stack">
            <p>
                <strong>{game.name}</strong>{' '}
                {game.year && <span className="muted">({game.year})</span>}
            </p>
            <fieldset className="checks">
                <legend className="sr-only">Platforms</legend>
                {options.map((p) => (
                    <label key={p.id} className="check">
                        <input
                            type="checkbox"
                            checked={chosen.has(p.id)}
                            onChange={() => toggle(p.id)}
                        />{' '}
                        <PlatformIcon platform={p} /> {p.name}
                    </label>
                ))}
            </fieldset>
            <label className="field">
                <span>Another platform</span>
                <select value="" onChange={(e) => e.target.value && toggle(Number(e.target.value))}>
                    <option value="">{all.isPending ? 'Loading…' : 'Choose…'}</option>
                    {(all.data ?? [])
                        .filter((p) => !chosen.has(p.id) && !known.has(p.id))
                        .map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                </select>
            </label>
            <p className="form-error" role="alert">
                {error}
            </p>
            <div className="row">
                <button className="btn" onClick={onBack}>
                    Back
                </button>
                <button className="btn btn--primary" onClick={submit} disabled={add.isPending}>
                    {add.isPending ? 'Adding…' : 'Add to collection'}
                </button>
            </div>
        </div>
    );
}
