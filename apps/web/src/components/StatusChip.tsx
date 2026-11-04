import type { EntryDto } from '@gamequeue/shared';
import type { CSSProperties } from 'react';
import { statusColor, statusText, type StatusKey } from '../statusColor';

/**
 * A status as a round chip: a dot, the status colour and the label. The label is real text, so the
 * colour is never the only cue. `label` overrides the text for a variant of the same state
 * (for instance "Up next" for a queued Not Started game).
 */
export function StatusChip({
    status,
    label,
    className
}: {
    status: StatusKey;
    label?: string;
    className?: string;
}) {
    return (
        <span
            className={className ? `status-chip ${className}` : 'status-chip'}
            style={{ '--chip': statusColor(status) } as CSSProperties}
        >
            <span className="status-chip__dot" aria-hidden="true" />
            {label ?? statusText(status)}
        </span>
    );
}

/** An entry's status chip; a Not Started game on the queue reads "Up next" (same colour, it is not a state of its own). */
export function EntryStatusChip({ entry, className }: { entry: EntryDto; className?: string }) {
    return (
        <StatusChip
            status={entry.status}
            label={entry.status === 'unplayed' && entry.queued ? 'Up next' : undefined}
            className={className}
        />
    );
}
