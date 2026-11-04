import type { EntryDto, SearchResultDto } from '@gamequeue/shared';
import { Check, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { gaugeTier } from '../gauge';
import { highlight, igdbRowState, metaParts, type AddedState } from '../searchModel';
import { yearOf } from '../lib';
import { Cover } from './Cover';
import { EntryStatusChip, StatusChip } from './StatusChip';

/** The title with the matching words in the accent colour (the match is also bold, so it isn't colour alone). */
export function Highlighted({ text, query }: { text: string; query: string }) {
    return (
        <>
            {highlight(text, query).map((p, i) =>
                p.match ? (
                    <mark key={i} className="hit">
                        {p.text}
                    </mark>
                ) : (
                    <span key={i}>{p.text}</span>
                )
            )}
        </>
    );
}

/** A small IGDB score, coloured by the same tiers as the gauge; the number is the text. */
export function ScorePill({ score }: { score: number | null }) {
    if (score === null) return null;
    const rounded = Math.round(score);
    return (
        <span
            className={`score-pill score-pill--${gaugeTier(rounded)}`}
            title={`IGDB score ${rounded} out of 100`}
        >
            <span className="sr-only">IGDB score </span>
            {rounded}
        </span>
    );
}

function RowBody({
    cover,
    name,
    query,
    meta,
    score,
    children
}: {
    cover: ReactNode;
    name: string;
    query: string;
    meta: string[];
    score: number | null;
    children?: ReactNode;
}) {
    return (
        <>
            <span className="srow__cover">{cover}</span>
            <span className="srow__text">
                <span className="srow__title">
                    <Highlighted text={name} query={query} />
                </span>
                <span className="srow__meta">{meta.join(' · ')}</span>
                <ScorePill score={score} />
            </span>
            {children}
        </>
    );
}

/** A game in the library: the row opens its page; the trailing chip is its status. */
export function LibraryRowContent({ entry, query }: { entry: EntryDto; query: string }) {
    return (
        <RowBody
            cover={
                <Cover
                    imageId={entry.game.coverImageId}
                    name={entry.game.name}
                    size="cover_small"
                />
            }
            name={entry.game.name}
            query={query}
            meta={metaParts(yearOf(entry.game.releaseDate), entry.platforms)}
            score={entry.game.igdbRating}
        >
            <EntryStatusChip entry={entry} className="srow__chip" />
        </RowBody>
    );
}

/**
 * An IGDB game. The row's own content has no control in it (the + is a sibling button, so a link or
 * row button never nests another button); `state` decides which trailing piece the caller draws.
 */
export function IgdbRowContent({
    result,
    query,
    added
}: {
    result: SearchResultDto;
    query: string;
    added: Map<number, AddedState>;
}) {
    const state = igdbRowState(result, added);
    return (
        <RowBody
            cover={<Cover imageId={result.coverImageId} name={result.name} size="cover_small" />}
            name={result.name}
            query={query}
            meta={metaParts(result.year, result.platforms)}
            score={result.igdbRating}
        >
            {state.kind === 'added' && <StatusChip status={state.status} className="srow__chip" />}
            {state.kind === 'wishlist' && <StatusChip status="wishlist" className="srow__chip" />}
            {state.kind === 'owned' && (
                <span
                    className="status-chip srow__chip"
                    style={{ '--chip': 'var(--text-2)' } as never}
                >
                    <Check aria-hidden="true" className="srow__check" />
                    In library
                </span>
            )}
        </RowBody>
    );
}

/** The round + that opens the quick-add sheet for a game that isn't in the library yet. */
export function AddButton({
    name,
    onClick,
    className
}: {
    name: string;
    onClick: () => void;
    className?: string;
}) {
    return (
        <button
            type="button"
            className={className ? `srow__add ${className}` : 'srow__add'}
            aria-label={`Add ${name}`}
            onClick={onClick}
        >
            <Plus aria-hidden="true" />
        </button>
    );
}
