import {
    MAX_TIERS,
    MAX_TIER_LIST_DESCRIPTION,
    MAX_TIER_LIST_TITLE,
    MAX_TIER_NAME,
    TIER_COLORS,
    TIER_COLOR_KEYS,
    type SearchResultDto,
    type TierColor,
    type TierItemDto,
    type TierListDto
} from '@gamequeue/shared';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMe } from '../api/auth';
import { ApiRequestError } from '../api/client';
import { useDeleteTierList, usePatchTierList, useTierEdits, useTierList } from '../api/tiers';
import { useConfirm } from '../components/Confirm';
import { DownloadTierImage } from '../components/DownloadTierImage';
import { GameSearchPicker } from '../components/GameSearchPicker';
import { ShareLink } from '../components/ShareLink';
import { TierBoard, TierBoardSkeleton, type TierDrop } from '../components/TierBoard';
import { useModalDialog } from '../components/useModalDialog';
import { usePageTitle } from '../lib';

const message = (e: unknown) =>
    e instanceof ApiRequestError ? e.message : 'Something went wrong.';

/** The tier list editor: the board (drag games between tiers, or click one), add games, details, sharing. */
export function TierListPage() {
    const id = Number(useParams().id);
    const list = useTierList(id);
    const me = useMe();
    const edits = useTierEdits(id);
    const [error, setError] = useState<string>();
    const [adding, setAdding] = useState(false);
    const [item, setItem] = useState<TierItemDto | null>(null);
    const [tierId, setTierId] = useState<number | null>(null);
    usePageTitle(list.data?.title ?? 'Tier list');

    if (list.isError)
        return (
            <section>
                <Link to="/tiers" className="back-link">
                    <ArrowLeft aria-hidden="true" /> Tier lists
                </Link>
                <p role="alert">
                    {list.error instanceof ApiRequestError && list.error.status === 404
                        ? 'That tier list does not exist.'
                        : "Couldn't load the tier list."}
                </p>
            </section>
        );

    const data = list.data;
    const drop = (igdbId: number, to: TierDrop) => {
        setError(undefined);
        edits.moveItem.mutate(
            { igdbId, tierId: to.tierId, toIndex: to.index },
            { onError: (e) => setError(message(e)) }
        );
    };

    return (
        <section className="tier-page">
            <Link to="/tiers" className="back-link">
                <ArrowLeft aria-hidden="true" /> Tier lists
            </Link>
            {data ? (
                <>
                    <div className="page-head">
                        <div>
                            <h1>{data.title}</h1>
                            <p className="muted">
                                Drag games between tiers, or click a game to move it. Click a tier's
                                gear to rename or recolor it.
                            </p>
                        </div>
                        <button className="btn btn--primary" onClick={() => setAdding(true)}>
                            <Plus />
                            Add games
                        </button>
                    </div>
                    <p className="form-error" role="alert">
                        {error}
                    </p>
                    <TierBoard list={data} onItem={setItem} onTier={setTierId} onDrop={drop} />
                    <div className="row">
                        <button
                            className="btn"
                            disabled={data.tiers.length >= MAX_TIERS || edits.addTier.isPending}
                            onClick={() =>
                                edits.addTier.mutate(
                                    { name: nextTierName(data), color: 'gray' },
                                    { onError: (e) => setError(message(e)) }
                                )
                            }
                        >
                            <Plus />
                            Add tier
                        </button>
                    </div>
                    <div className="grid-page__side">
                        {me.data && <ShareLink path={`/u/${me.data.username}/tiers/${data.id}`} />}
                        <DownloadTierImage list={data} username={me.data?.username} />
                        <Details list={data} />
                    </div>
                    <AddGamesDialog list={data} open={adding} onClose={() => setAdding(false)} />
                    <ItemDialog
                        list={data}
                        item={item}
                        onClose={() => setItem(null)}
                        onError={(e) => setError(message(e))}
                    />
                    <TierDialog list={data} tierId={tierId} onClose={() => setTierId(null)} />
                </>
            ) : (
                <TierBoardSkeleton />
            )}
        </section>
    );
}

/** "G", "H"… the next letter after the last tier's name, or "Tier N" once names stop being letters. */
function nextTierName(list: TierListDto) {
    const last = list.tiers.at(-1)?.name ?? '';
    return /^[A-Y]$/i.test(last)
        ? String.fromCharCode(last.charCodeAt(0) + 1).toUpperCase()
        : `Tier ${list.tiers.length + 1}`;
}

function Details({ list }: { list: TierListDto }) {
    const patch = usePatchTierList(list.id);
    const del = useDeleteTierList();
    const confirm = useConfirm();
    const navigate = useNavigate();
    const [title, setTitle] = useState(list.title);
    const [description, setDescription] = useState(list.description);
    const [error, setError] = useState<string>();
    const [saved, setSaved] = useState(false);

    function submit(e: FormEvent) {
        e.preventDefault();
        setError(undefined);
        setSaved(false);
        patch.mutate(
            { title: title.trim(), description: description.trim() },
            { onSuccess: () => setSaved(true), onError: (err) => setError(message(err)) }
        );
    }

    async function remove() {
        if (
            await confirm({
                title: 'Delete this tier list?',
                message: 'Its public link stops working.',
                confirmLabel: 'Delete',
                tone: 'danger'
            })
        )
            del.mutate(list.id, { onSuccess: () => navigate('/tiers', { replace: true }) });
    }

    return (
        <form className="stack" onSubmit={submit}>
            <h2>Details</h2>
            <label className="field">
                <span>Title</span>
                <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={MAX_TIER_LIST_TITLE}
                    required
                />
            </label>
            <label className="field">
                <span>Description (optional)</span>
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={MAX_TIER_LIST_DESCRIPTION}
                    rows={2}
                />
            </label>
            <p className="form-error" role="alert">
                {error}
            </p>
            <div className="row row--center">
                <button className="btn btn--primary" disabled={patch.isPending || !title.trim()}>
                    Save details
                </button>
                <button type="button" className="btn btn--danger" onClick={remove}>
                    <Trash2 />
                    Delete tier list
                </button>
                <span className="muted" role="status">
                    {saved ? 'Saved' : ''}
                </span>
            </div>
        </form>
    );
}

/** Search IGDB and add games to the unranked pool; stays open so several can be added in a row. */
function AddGamesDialog({
    list,
    open,
    onClose
}: {
    list: TierListDto;
    open: boolean;
    onClose: () => void;
}) {
    const ref = useModalDialog(open);
    const edits = useTierEdits(list.id);
    const [note, setNote] = useState<{ text: string; error: boolean }>();
    const have = new Set([
        ...list.unranked.map((i) => i.igdbId),
        ...list.tiers.flatMap((t) => t.items.map((i) => i.igdbId))
    ]);

    function pick(g: SearchResultDto) {
        if (have.has(g.igdbId))
            return setNote({ text: `${g.name} is already in this list.`, error: false });
        setNote(undefined);
        edits.addItem.mutate(
            { igdbId: g.igdbId },
            {
                onSuccess: () => setNote({ text: `Added ${g.name} to Unranked.`, error: false }),
                onError: (e) => setNote({ text: message(e), error: true })
            }
        );
    }

    return (
        <dialog
            ref={ref}
            className="dialog dialog--fixed"
            onClose={onClose}
            aria-labelledby="add-tier-games-title"
            onClick={(e) => e.target === ref.current && onClose()}
        >
            {open && (
                <div className="dialog__body dialog__body--fill dialog__body--cell">
                    <div className="dialog__head">
                        <h2 id="add-tier-games-title">Add games</h2>
                        <button className="btn btn--ghost" onClick={onClose} aria-label="Close">
                            <X />
                        </button>
                    </div>
                    <p className="muted">Pick a game to add it to Unranked. You can add several.</p>
                    <p className={note?.error ? 'form-error' : 'muted'} role="status">
                        {note?.text}
                    </p>
                    <div className="row">
                        <button className="btn btn--primary" onClick={onClose}>
                            Done
                        </button>
                    </div>
                    <GameSearchPicker autoFocus busy={edits.addItem.isPending} onPick={pick} />
                </div>
            )}
        </dialog>
    );
}

/** Move one game to another tier (the keyboard route besides dragging), earlier/later, or remove it. */
function ItemDialog({
    list,
    item,
    onClose,
    onError
}: {
    list: TierListDto;
    item: TierItemDto | null;
    onClose: () => void;
    onError: (e: unknown) => void;
}) {
    const ref = useModalDialog(item !== null);
    const edits = useTierEdits(list.id);
    const place = item
        ? [
              ...list.tiers.map((t) => ({ tierId: t.id as number | null, items: t.items })),
              { tierId: null, items: list.unranked }
          ]
              .map((c) => ({
                  tierId: c.tierId,
                  index: c.items.findIndex((i) => i.igdbId === item.igdbId),
                  len: c.items.length
              }))
              .find((c) => c.index !== -1)
        : undefined;

    const go = (to: { tierId: number | null; toIndex: number }) =>
        edits.moveItem.mutate({ igdbId: item!.igdbId, ...to }, { onSuccess: onClose, onError });

    return (
        <dialog
            ref={ref}
            className="dialog"
            onClose={onClose}
            aria-labelledby="tier-item-title"
            onClick={(e) => e.target === ref.current && onClose()}
        >
            {item && place && (
                <div className="dialog__body stack">
                    <div className="dialog__head">
                        <h2 id="tier-item-title">{item.game.name}</h2>
                        <button className="btn btn--ghost" onClick={onClose} aria-label="Close">
                            <X />
                        </button>
                    </div>
                    <fieldset className="tier-moves">
                        <legend>Move to</legend>
                        <div className="row">
                            {list.tiers.map((t) => (
                                <button
                                    key={t.id}
                                    className="btn tier-chip"
                                    style={
                                        { '--tier-bg': TIER_COLORS[t.color] } as React.CSSProperties
                                    }
                                    disabled={place.tierId === t.id || edits.moveItem.isPending}
                                    onClick={() => go({ tierId: t.id, toIndex: t.items.length })}
                                >
                                    {t.name}
                                </button>
                            ))}
                            <button
                                className="btn"
                                disabled={place.tierId === null || edits.moveItem.isPending}
                                onClick={() => go({ tierId: null, toIndex: list.unranked.length })}
                            >
                                Unranked
                            </button>
                        </div>
                    </fieldset>
                    <div className="row">
                        <button
                            className="btn"
                            disabled={place.index === 0 || edits.moveItem.isPending}
                            onClick={() => go({ tierId: place.tierId, toIndex: place.index - 1 })}
                        >
                            <ArrowLeft />
                            Earlier
                        </button>
                        <button
                            className="btn"
                            disabled={place.index === place.len - 1 || edits.moveItem.isPending}
                            onClick={() => go({ tierId: place.tierId, toIndex: place.index + 1 })}
                        >
                            Later
                            <ArrowRight />
                        </button>
                        <button
                            className="btn btn--danger"
                            disabled={edits.removeItem.isPending}
                            onClick={() =>
                                edits.removeItem.mutate(item.igdbId, {
                                    onSuccess: onClose,
                                    onError
                                })
                            }
                        >
                            <Trash2 />
                            Remove
                        </button>
                    </div>
                </div>
            )}
        </dialog>
    );
}

function TierDialog({
    list,
    tierId,
    onClose
}: {
    list: TierListDto;
    tierId: number | null;
    onClose: () => void;
}) {
    const ref = useModalDialog(tierId !== null);
    const tier = list.tiers.find((t) => t.id === tierId);
    return (
        <dialog
            ref={ref}
            className="dialog"
            onClose={onClose}
            aria-labelledby="tier-edit-title"
            onClick={(e) => e.target === ref.current && onClose()}
        >
            {tier && <TierEditor key={tier.id} list={list} tierId={tier.id} onClose={onClose} />}
        </dialog>
    );
}

function TierEditor({
    list,
    tierId,
    onClose
}: {
    list: TierListDto;
    tierId: number;
    onClose: () => void;
}) {
    const tier = list.tiers.find((t) => t.id === tierId)!;
    const index = list.tiers.findIndex((t) => t.id === tierId);
    const edits = useTierEdits(list.id);
    const confirm = useConfirm();
    const [name, setName] = useState(tier.name);
    const [color, setColor] = useState<TierColor>(tier.color);
    const [error, setError] = useState<string>();
    const fail = (e: unknown) => setError(message(e));

    function save(e: FormEvent) {
        e.preventDefault();
        setError(undefined);
        edits.patchTier.mutate(
            { tierId, patch: { name: name.trim(), color } },
            { onSuccess: onClose, onError: fail }
        );
    }
    function shift(by: -1 | 1) {
        const ids = list.tiers.map((t) => t.id);
        const [moved] = ids.splice(index, 1);
        ids.splice(index + by, 0, moved!);
        edits.reorderTiers.mutate(ids, { onError: fail });
    }
    async function remove() {
        if (
            await confirm({
                title: `Delete tier ${tier.name}?`,
                message:
                    tier.items.length > 0
                        ? `Its ${tier.items.length} ${tier.items.length === 1 ? 'game goes' : 'games go'} back to Unranked.`
                        : undefined,
                confirmLabel: 'Delete tier',
                tone: 'danger'
            })
        )
            edits.deleteTier.mutate(tierId, { onSuccess: onClose, onError: fail });
    }

    return (
        <form className="dialog__body stack" onSubmit={save}>
            <div className="dialog__head">
                <h2 id="tier-edit-title">Edit tier</h2>
                <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={onClose}
                    aria-label="Close"
                >
                    <X />
                </button>
            </div>
            <label className="field">
                <span>Name</span>
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={MAX_TIER_NAME}
                    required
                    autoFocus
                    data-autofocus
                />
            </label>
            <fieldset className="tier-colors">
                <legend>Color</legend>
                <div className="row">
                    {TIER_COLOR_KEYS.map((c) => (
                        <button
                            key={c}
                            type="button"
                            className={c === color ? 'tier-swatch is-selected' : 'tier-swatch'}
                            style={{ '--tier-bg': TIER_COLORS[c] } as React.CSSProperties}
                            aria-pressed={c === color}
                            aria-label={c}
                            title={c}
                            onClick={() => setColor(c)}
                        />
                    ))}
                </div>
            </fieldset>
            <p className="form-error" role="alert">
                {error}
            </p>
            <div className="row row--center">
                <button
                    className="btn btn--primary"
                    disabled={edits.patchTier.isPending || !name.trim()}
                >
                    Save
                </button>
                <button
                    type="button"
                    className="btn"
                    aria-label="Move tier up"
                    disabled={index === 0 || edits.reorderTiers.isPending}
                    onClick={() => shift(-1)}
                >
                    <ArrowUp />
                </button>
                <button
                    type="button"
                    className="btn"
                    aria-label="Move tier down"
                    disabled={index === list.tiers.length - 1 || edits.reorderTiers.isPending}
                    onClick={() => shift(1)}
                >
                    <ArrowDown />
                </button>
                <button type="button" className="btn btn--danger" onClick={remove}>
                    <Trash2 />
                    Delete tier
                </button>
            </div>
        </form>
    );
}
