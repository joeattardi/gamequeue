import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

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
    skeleton,
    auto = false
}: {
    shown: number;
    total: number | undefined;
    hasMore: boolean;
    loading: boolean;
    failed?: boolean;
    onMore: () => void;
    skeleton?: ReactNode;
    /** Fetch the next page by itself as the end of the list scrolls near; the button stays for keyboard users */
    auto?: boolean;
}) {
    const end = useRef<HTMLDivElement>(null);
    const stuck = failed || loading;
    useEffect(() => {
        const el = end.current;
        if (!auto || !el || !hasMore || stuck) return;
        const observer = new IntersectionObserver(
            ([e]) => {
                if (e?.isIntersecting) onMore();
            },
            { rootMargin: '800px 0px' }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [auto, hasMore, stuck, onMore, shown]);
    if (total === undefined || (!hasMore && !loading && !failed)) return null;
    return (
        <div className="load-more" ref={end}>
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
