import type { EntryDto, PlatformDto } from '@gamequeue/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAllPlatforms, useDeleteEntry, useEntry, usePatchEntry } from '../api/collection';
import { ApiRequestError } from '../api/client';
import { useConfirm } from '../components/Confirm';
import { StarRating } from '../components/StarRating';
import { ClampedText } from '../components/ClampedText';
import { FoldPanel } from '../components/FoldPanel';
import { platformText } from '../collectionModel';
import { EntryHero } from '../components/GameHero';
import { SimilarGames } from '../components/SimilarGames';
import { Screenshots } from '../components/Screenshots';
import { NotesPanel } from '../components/NotesPanel';
import { ListsPanel } from '../components/ListsPanel';
import { HistoryPanel, JournalPanel } from '../components/PlaythroughPanels';
import { EntrySkeleton, SelectSkeleton } from '../components/PageSkeletons';
import { PlatformTag } from '../components/PlatformIcon';
import { usePageTitle } from '../lib';
import { X } from 'lucide-react';
import { TimeToBeat } from '../components/TimeToBeat';

export function EntryPage() {
    const id = Number(useParams().id);
    const entry = useEntry(id);
    usePageTitle(entry.data?.game.name);
    if (entry.isPending) return <EntrySkeleton />;
    if (entry.isError || !entry.data)
        return (
            <div className="empty">
                <p>
                    <strong>That game isn't in your collection.</strong>
                </p>
                <Link to="/collection">Back to collection</Link>
            </div>
        );
    return <EntryDetail entry={entry.data} />;
}

/**
 * A game in your collection: the hero (cover, facts, the actions), then two columns of about the
 * same length. Left, the game and where it sits: description, screenshots, the journal of what you are playing,
 * time to beat, your lists and platforms, similar games. Right, your own record: your take, tags, playthroughs.
 */
function EntryDetail({ entry }: { entry: EntryDto }) {
    const { game } = entry;
    const navigate = useNavigate();
    const patch = usePatchEntry(entry.id);
    const del = useDeleteEntry(entry.id);
    const confirm = useConfirm();
    const [error, setError] = useState<string>();
    const save = (body: Parameters<typeof patch.mutate>[0]) => {
        setError(undefined);
        patch.mutate(body, {
            onError: (e) => setError(e instanceof ApiRequestError ? e.message : "Couldn't save.")
        });
    };

    return (
        <article className="game">
            <EntryHero
                entry={entry}
                favorite={
                    patch.isPending && patch.variables?.favorite !== undefined
                        ? patch.variables.favorite
                        : entry.favorite
                }
                onFavorite={(favorite) => save({ favorite })}
                removing={del.isPending}
                onRemove={async () =>
                    (await confirm({
                        title: `Remove ${game.name}?`,
                        message:
                            'It leaves your collection, your queue and your lists, and its playthrough history and notes are deleted.',
                        confirmLabel: 'Remove game',
                        tone: 'danger'
                    })) && del.mutate(undefined, { onSuccess: () => navigate('/collection') })
                }
            />
            <div className="game-cols">
                <div className="game-main">
                    {game.summary && (
                        <section aria-labelledby="about-h" className="game-section">
                            <h2 id="about-h">About</h2>
                            <ClampedText text={game.summary} />
                        </section>
                    )}
                    <Screenshots imageIds={game.screenshots} name={game.name} />
                    {entry.openPlaythrough && <JournalPanel playthrough={entry.openPlaythrough} />}
                    <TimeToBeat ttb={game.ttb} />
                    <ListsPanel entry={entry} />
                    <PlatformsEditor entry={entry} onSave={(ids) => save({ platformIds: ids })} />
                </div>
                <div className="game-side">
                    <section aria-labelledby="take-h" className="panel stack">
                        <h2 id="take-h">Your take</h2>
                        <StarRating
                            value={entry.rating}
                            onChange={(rating) => save({ rating })}
                            label="Rating"
                        />
                        <NotesPanel entry={entry} embedded />
                    </section>
                    <TagsEditor
                        key={entry.tags.join('|')}
                        tags={entry.tags}
                        onSave={(tags) => save({ tags })}
                    />
                    <HistoryPanel entry={entry} />
                    <p className="form-error" role="alert">
                        {error}
                    </p>
                </div>
            </div>
            <SimilarGames igdbId={game.id} />
        </article>
    );
}

function PlatformsEditor({ entry, onSave }: { entry: EntryDto; onSave: (ids: number[]) => void }) {
    const all = useAllPlatforms();
    const [chosen, setChosen] = useState(new Set(entry.platforms.map((p) => p.id)));
    const [extras, setExtras] = useState<PlatformDto[]>([]);
    const options = new Map(
        [...entry.game.platforms, ...entry.platforms, ...extras].map((p) => [p.id, p])
    );
    const dirty =
        chosen.size !== entry.platforms.length || entry.platforms.some((p) => !chosen.has(p.id));
    const toggle = (id: number) =>
        setChosen((s) => {
            const n = new Set(s);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });
    return (
        <FoldPanel id="plat-h" title="I own it on" hint={platformText(entry.platforms)}>
            <fieldset className="checks">
                <legend className="sr-only">Platforms you own this game on</legend>
                {[...options.values()].map((p) => (
                    <label key={p.id} className="check">
                        <input
                            type="checkbox"
                            checked={chosen.has(p.id)}
                            onChange={() => toggle(p.id)}
                        />{' '}
                        <PlatformTag platform={p} />
                    </label>
                ))}
            </fieldset>
            <div className="inline-form">
                <label className="field">
                    <span>Another platform</span>
                    {all.isPending ? (
                        <SelectSkeleton label="Loading platforms" />
                    ) : (
                        <select
                            value=""
                            onChange={(e) => {
                                const id = Number(e.target.value);
                                const p = all.data?.find((x) => x.id === id);
                                if (p) {
                                    setExtras((x) => [...x, p]);
                                    toggle(id);
                                }
                            }}
                        >
                            <option value="">Choose…</option>
                            {(all.data ?? [])
                                .filter((p) => !options.has(p.id))
                                .map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                        </select>
                    )}
                </label>
                <button
                    className="btn"
                    disabled={!dirty || chosen.size === 0}
                    onClick={() => onSave([...chosen])}
                >
                    Save platforms
                </button>
            </div>
        </FoldPanel>
    );
}

function TagsEditor({ tags, onSave }: { tags: string[]; onSave: (tags: string[]) => void }) {
    const [draft, setDraft] = useState('');
    function add(e: FormEvent) {
        e.preventDefault();
        const name = draft.trim();
        if (!name) return;
        if (!tags.some((t) => t.toLowerCase() === name.toLowerCase())) onSave([...tags, name]);
        setDraft('');
    }
    return (
        <section aria-labelledby="tags-h" className="panel">
            <h2 id="tags-h">My tags</h2>
            <ul className="chips">
                {tags.map((t) => (
                    <li key={t} className="chip">
                        {t}
                        <button
                            type="button"
                            aria-label={`Remove tag ${t}`}
                            onClick={() => onSave(tags.filter((x) => x !== t))}
                        >
                            <X />
                        </button>
                    </li>
                ))}
                {tags.length === 0 && <li className="muted">No tags yet.</li>}
            </ul>
            <form className="tag-add" onSubmit={add}>
                <label className="field">
                    <span className="sr-only">Add a tag</span>
                    <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        maxLength={60}
                        placeholder="Add a tag, e.g. turn-based"
                    />
                </label>
                <button className="btn" type="submit" disabled={!draft.trim()}>
                    Add
                </button>
            </form>
        </section>
    );
}
