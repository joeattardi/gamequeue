import { TIER_COLORS, TIER_INK, type TierItemDto, type TierListDto } from '@gamequeue/shared';
import { Settings2 } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { Cover } from './Cover';

/** Where a game is dropped: a tier id, or null for the unranked pool, at `index` in it. */
export interface TierDrop {
    tierId: number | null;
    index: number;
}

interface Props {
    list: Pick<TierListDto, 'title' | 'tiers' | 'unranked'>;
    /** Present = editable: tiles open `onItem`, tier names open `onTier`, tiles can be dragged. */
    onItem?: (item: TierItemDto) => void;
    onTier?: (tierId: number) => void;
    onDrop?: (igdbId: number, to: TierDrop) => void;
}

/** The tiers as coloured rows of covers, then (when editing) the unranked pool. */
export function TierBoard({ list, onItem, onTier, onDrop }: Props) {
    const editable = onItem !== undefined;
    const [dragging, setDragging] = useState<number | null>(null);
    // The container being hovered and the index a drop would land on
    const [over, setOver] = useState<{ key: string; index: number } | null>(null);

    const end = () => {
        setDragging(null);
        setOver(null);
    };

    function items(key: string, tierId: number | null, tileItems: TierItemDto[], label: string) {
        const drop = (index: number) => (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (dragging !== null) onDrop?.(dragging, { tierId, index });
            end();
        };
        return (
            <ul
                className={over?.key === key ? 'tier-items is-over' : 'tier-items'}
                aria-label={label}
                onDragOver={(e) => {
                    if (dragging === null) return;
                    e.preventDefault();
                    setOver((o) => (o?.key === key ? o : { key, index: tileItems.length }));
                }}
                onDrop={drop(tileItems.length)}
            >
                {tileItems.map((it, i) => (
                    <li
                        key={it.igdbId}
                        className={[
                            'tier-tile',
                            dragging === it.igdbId && 'is-dragging',
                            over?.key === key &&
                                over.index === i &&
                                dragging !== it.igdbId &&
                                'is-before'
                        ]
                            .filter(Boolean)
                            .join(' ')}
                        draggable={editable && !!onDrop}
                        onDragStart={() => setDragging(it.igdbId)}
                        onDragEnd={end}
                        onDragOver={(e) => {
                            if (dragging === null) return;
                            e.preventDefault();
                            e.stopPropagation();
                            setOver({ key, index: i });
                        }}
                        onDrop={drop(i)}
                    >
                        {editable ? (
                            <button
                                type="button"
                                className="tier-tile__button"
                                onClick={() => onItem(it)}
                                aria-label={`${it.game.name}: move or remove`}
                                title={it.game.name}
                            >
                                <Cover imageId={it.game.coverImageId} name={it.game.name} />
                            </button>
                        ) : (
                            <span className="tier-tile__button" title={it.game.name}>
                                <Cover imageId={it.game.coverImageId} name={it.game.name} />
                            </span>
                        )}
                    </li>
                ))}
            </ul>
        );
    }

    return (
        <div className="tier-board">
            <ol className="tier-rows" aria-label={list.title}>
                {list.tiers.map((t) => (
                    <li key={t.id} className="tier-row">
                        <div
                            className={[
                                'tier-row__label',
                                onTier && 'tier-row__label--editable',
                                t.name.length > 10
                                    ? 'tier-row__label--long'
                                    : t.name.length > 4 && 'tier-row__label--medium'
                            ]
                                .filter(Boolean)
                                .join(' ')}
                            style={
                                {
                                    '--tier-bg': TIER_COLORS[t.color],
                                    '--tier-ink': TIER_INK
                                } as CSSProperties
                            }
                        >
                            <strong>{t.name}</strong>
                            {onTier && (
                                <button
                                    type="button"
                                    className="tier-row__edit"
                                    onClick={() => onTier(t.id)}
                                    aria-label={`Edit tier ${t.name}`}
                                >
                                    <Settings2 />
                                </button>
                            )}
                        </div>
                        {items(`t${t.id}`, t.id, t.items, `${t.name} tier`)}
                    </li>
                ))}
            </ol>
            {editable && (
                <section className="tier-pool" aria-label="Unranked games">
                    <h2>Unranked</h2>
                    {list.unranked.length === 0 && (
                        <p className="muted">
                            Add games, then drag them into a tier, or click one to choose.
                        </p>
                    )}
                    {items('pool', null, list.unranked, 'Unranked')}
                </section>
            )}
        </div>
    );
}

/** Placeholder with the board's real classes, so the page doesn't jump when the list arrives. */
export function TierBoardSkeleton({ rows = 6 }: { rows?: number }) {
    return (
        <div className="tier-board" role="status" aria-label="Loading tier list">
            <ol className="tier-rows">
                {Array.from({ length: rows }, (_, i) => (
                    <li key={i} className="tier-row" aria-hidden="true">
                        <div className="tier-row__label tier-row__label--skeleton skeleton" />
                        <ul className="tier-items">
                            {Array.from({ length: 5 - (i % 3) }, (_, j) => (
                                <li key={j} className="tier-tile">
                                    <span className="skeleton tier-tile__skeleton" />
                                </li>
                            ))}
                        </ul>
                    </li>
                ))}
            </ol>
        </div>
    );
}
