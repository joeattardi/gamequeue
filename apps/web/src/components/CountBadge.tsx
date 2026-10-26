/**
 * The game count shown as a pill beside a page title. Sighted users see the number; screen readers
 * hear "N games" (or "N games match" while filtered) and are told when it changes. Reserves its
 * space while the count is unknown, so the title doesn't shift when it arrives.
 */
export function CountBadge({ total, filtered = false }: { total?: number; filtered?: boolean }) {
    return (
        <span className="badge count-badge" aria-live="polite">
            {total !== undefined && (
                <>
                    <span aria-hidden="true">{total.toLocaleString()}</span>
                    <span className="sr-only">
                        {`${total} ${total === 1 ? 'game' : 'games'}${filtered ? ' match' : ''}`}
                    </span>
                </>
            )}
        </span>
    );
}
