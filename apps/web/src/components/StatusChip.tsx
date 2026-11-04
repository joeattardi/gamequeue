import type { EntryDto } from '@gamequeue/shared';
import type { CSSProperties } from 'react';
import { statusColor, statusColorOnCover, statusText, type StatusKey } from '../statusColor';

/**
 * A status as a round chip: a dot, the status colour and the label. The label is real text, so the
 * colour is never the only cue. `label` overrides the text for a variant of the same state
 * (for instance "Up next" for a queued Not Started game).
 */
export function StatusChip({
    status,
    label,
    className,
    onCover = false
}: {
    status: StatusKey;
    label?: string;
    className?: string;
    /** Drawn over cover art: the brighter colour on a dark glass chip */
    onCover?: boolean;
}) {
    return (
        <span
            className={
                `status-chip${onCover ? ' status-chip--cover' : ''}` +
                (className ? ` ${className}` : '')
            }
            style={
                { '--chip': (onCover ? statusColorOnCover : statusColor)(status) } as CSSProperties
            }
        >
            <span className="status-chip__dot" aria-hidden="true" />
            {label ?? statusText(status)}
        </span>
    );
}

/** An entry's status chip; a Not Started game on the queue reads "Up next" (same colour, it is not a state of its own). */
export function EntryStatusChip({
    entry,
    className,
    onCover
}: {
    entry: EntryDto;
    className?: string;
    onCover?: boolean;
}) {
    return (
        <StatusChip
            onCover={onCover}
            status={entry.status}
            label={entry.status === 'unplayed' && entry.queued ? 'Up next' : undefined}
            className={className}
        />
    );
}
