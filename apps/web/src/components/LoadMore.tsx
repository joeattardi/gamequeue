import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The footer of a paged list: how much is shown and a button for the next page. While the next
 * page loads, `skeleton` (placeholders in the list's own layout) takes the button's place.
 */
export function LoadMore({
    shown,
    total,
    hasMore,
    loading,
    failed,
    onMore,
    skeleton
}: {
    shown: number;
    total: number | undefined;
    hasMore: boolean;
    loading: boolean;
    failed?: boolean;
    onMore: () => void;
    skeleton?: ReactNode;
}) {
    if (total === undefined || (!hasMore && !loading && !failed)) return null;
    return (
        <div className="load-more">
            {loading && skeleton}
            <p className="muted" aria-live="polite">
                Showing {shown} of {total}
            </p>
            {failed && (
                <p className="form-error" role="alert">
                    Couldn't load more.
                </p>
            )}
            <button className="btn" onClick={onMore} disabled={loading}>
                <ChevronDown />
                {loading ? 'Loading…' : failed ? 'Try again' : 'Load more'}
            </button>
        </div>
    );
}
