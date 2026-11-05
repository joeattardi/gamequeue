import { useCallback, useState } from 'react';
import { MIN_QUERY, normalizeQuery } from './searchModel';

export const MAX_RECENT = 5;

/** `q` added to the front of `list`: trimmed, at least two characters, no duplicates (any case), at most five. */
export function pushRecent(list: string[], q: string): string[] {
    const clean = normalizeQuery(q);
    if (clean.length < MIN_QUERY) return list;
    const rest = list.filter((x) => x.toLowerCase() !== clean.toLowerCase());
    return [clean, ...rest].slice(0, MAX_RECENT);
}

const key = (userId: number) => `gq.recent-searches.${userId}`;

function read(userId: number): string[] {
    try {
        const raw = JSON.parse(localStorage.getItem(key(userId)) ?? '[]');
        return Array.isArray(raw)
            ? raw.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT)
            : [];
    } catch {
        return [];
    }
}

function write(userId: number, list: string[]) {
    try {
        if (list.length === 0) localStorage.removeItem(key(userId));
        else localStorage.setItem(key(userId), JSON.stringify(list));
    } catch {
        // Not remembered (private window, blocked storage); the list still works for this visit
    }
}

/** The user's last five searches, kept in this browser per user (nothing is stored on the server). */
export function useRecentSearches(userId: number) {
    const [recent, setRecent] = useState(() => read(userId));
    const add = useCallback(
        (q: string) =>
            setRecent((list) => {
                const next = pushRecent(list, q);
                if (next !== list) write(userId, next);
                return next;
            }),
        [userId]
    );
    const clear = useCallback(() => {
        write(userId, []);
        setRecent([]);
    }, [userId]);
    return { recent, add, clear };
}
