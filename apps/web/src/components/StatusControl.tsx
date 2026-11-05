import { statusLabel, type EntryStatus } from '@gamequeue/shared';
import { STATUS_ORDER, moveTo, type Move } from '../statusMoves';
import { statusColor } from '../statusColor';

/**
 * The game's status as one segmented control, a dot per status with the current one filled. Moving
 * to another status runs the right action (start, pause, finish...); a status the app has no move
 * to from here is disabled, with the reason in its tooltip, never hidden.
 */
export function StatusControl({
    status,
    busy,
    onMove
}: {
    status: EntryStatus;
    busy: boolean;
    onMove: (move: Move) => void;
}) {
    return (
        <div className="status-seg" role="group" aria-label="Status">
            {STATUS_ORDER.map((s) => {
                const move = moveTo(status, s);
                const current = s === status;
                return (
                    <button
                        key={s}
                        type="button"
                        className="status-seg__item"
                        aria-pressed={current}
                        disabled={(!current && !move) || busy}
                        title={
                            current || move
                                ? undefined
                                : `A ${statusLabel(status).toLowerCase()} game can't move to ${statusLabel(s).toLowerCase()}`
                        }
                        onClick={() => move && onMove(move)}
                    >
                        <span
                            className="status-seg__dot"
                            style={{ '--dot': statusColor(s) } as React.CSSProperties}
                            aria-hidden="true"
                        />
                        {statusLabel(s)}
                    </button>
                );
            })}
        </div>
    );
}
