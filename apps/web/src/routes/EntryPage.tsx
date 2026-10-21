import type { EntryDto, PlatformDto } from '@gamequeue/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAllPlatforms, useDeleteEntry, useEntry, usePatchEntry } from '../api/collection';
import { ApiRequestError } from '../api/client';
import { useConfirm } from '../components/Confirm';
import { StarRating } from '../components/StarRating';
import { Cover } from '../components/Cover';
import { Screenshots } from '../components/Screenshots';
import { ListsPanel } from '../components/ListsPanel';
import { SeriesLinks } from '../components/SeriesLinks';
import { ScoreGauge } from '../components/ScoreGauge';
import { HistoryPanel, StatusPanel } from '../components/PlaythroughPanels';
import { EntrySkeleton, SelectSkeleton } from '../components/PageSkeletons';
import { PlatformTag } from '../components/PlatformIcon';
import { formatMinutes, yearOf, usePageTitle } from '../lib';
import { ArrowLeft, Trash2, X } from 'lucide-react';

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
        <article className="entry">
            <Link to="/collection" className="back">
                <ArrowLeft /> Collection
            </Link>
            <div className="entry__layout">
                <div className="entry__cover">
                    <Cover imageId={game.coverImageId} name={game.name} size="720p" />
                    <Screenshots imageIds={game.screenshots} name={game.name} />
                </div>
                <div className="stack">
                    <header className="entry__head">
                        <div>
                            <h1>{game.name}</h1>
                            <p className="muted">
                                {[yearOf(game.releaseDate), game.genres.join(', ')]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </p>
                            <SeriesLinks series={game.series} />
                        </div>
                        {game.igdbRating !== null && (
                            <ScoreGauge value={game.igdbRating} label="IGDB" />
                        )}
                    </header>
                    {game.summary && <p className="summary">{game.summary}</p>}

                    <StatusPanel entry={entry} />
                    <HistoryPanel entry={entry} />

                    <section aria-labelledby="ttb-h" className="panel">
                        <h2 id="ttb-h">Time to beat</h2>
                        {game.ttb ? (
                            <dl className="ttb">
                                <div>
                                    <dt>Hasty</dt>
                                    <dd>{formatMinutes(game.ttb.hastily)}</dd>
                                </div>
                                <div>
                                    <dt>Normal</dt>
                                    <dd>{formatMinutes(game.ttb.normally)}</dd>
                                </div>
                                <div>
                                    <dt>Completionist</dt>
                                    <dd>{formatMinutes(game.ttb.completely)}</dd>
                                </div>
                            </dl>
                        ) : (
                            <p className="muted">IGDB has no time-to-beat data for this game.</p>
                        )}
                        <TtbOverride
                            entry={entry}
                            onSave={(m) => save({ ttbOverrideMinutes: m })}
                        />
                    </section>

                    <ListsPanel entry={entry} />
                    <PlatformsEditor entry={entry} onSave={(ids) => save({ platformIds: ids })} />
                    <RatingNotes entry={entry} onSave={save} />
                    <TagsEditor
                        key={entry.tags.join('|')}
                        tags={entry.tags}
                        onSave={(tags) => save({ tags })}
                    />

                    <p className="form-error" role="alert">
                        {error}
                    </p>
                    <div>
                        <button
                            className="btn btn--danger"
                            onClick={async () =>
                                (await confirm({
                                    title: `Remove ${game.name}?`,
                                    message:
                                        'It leaves your collection, your queue and your lists, and its playthrough history and notes are deleted.',
                                    confirmLabel: 'Remove game',
                                    tone: 'danger'
                                })) &&
                                del.mutate(undefined, { onSuccess: () => navigate('/collection') })
                            }
                            disabled={del.isPending}
                        >
                            <Trash2 />
                            Remove from collection
                        </button>
                    </div>
                </div>
            </div>
        </article>
    );
}

function TtbOverride({
    entry,
    onSave
}: {
    entry: EntryDto;
    onSave: (minutes: number | null) => void;
}) {
    const [hours, setHours] = useState(
        entry.ttbOverrideMinutes ? String(entry.ttbOverrideMinutes / 60) : ''
    );
    function submit(e: FormEvent) {
        e.preventDefault();
        const h = Number(hours);
        onSave(hours.trim() === '' ? null : Math.max(1, Math.round(h * 60)));
    }
    return (
        <form className="inline-form" onSubmit={submit}>
            <label className="field">
                <span>My estimate (hours)</span>
                <input
                    inputMode="decimal"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    placeholder={
                        entry.game.ttb?.normally
                            ? String(Math.round(entry.game.ttb.normally / 6) / 10)
                            : 'e.g. 12'
                    }
                />
            </label>
            <button className="btn" type="submit">
                Save
            </button>
        </form>
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
        <section aria-labelledby="plat-h" className="panel">
            <h2 id="plat-h">I own it on</h2>
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
        </section>
    );
}

function RatingNotes({
    entry,
    onSave
}: {
    entry: EntryDto;
    onSave: (b: { rating?: number | null; notes?: string }) => void;
}) {
    const [notes, setNotes] = useState(entry.notes);
    return (
        <section aria-labelledby="mine-h" className="panel">
            <h2 id="mine-h">My take</h2>
            <StarRating value={entry.rating} onChange={(rating) => onSave({ rating })} />
            <label className="field">
                <span>Notes</span>
                <textarea
                    rows={5}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={() => notes !== entry.notes && onSave({ notes })}
                />
            </label>
        </section>
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
            <h2 id="tags-h">Tags</h2>
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
            <form className="inline-form" onSubmit={add}>
                <label className="field">
                    <span>Add a tag</span>
                    <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        maxLength={40}
                        placeholder="e.g. turn-based"
                    />
                </label>
                <button className="btn" type="submit">
                    Add
                </button>
            </form>
        </section>
    );
}
