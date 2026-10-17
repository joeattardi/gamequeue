import { useEffect, useState } from 'react';

export function useDebounced<T>(value: T, ms = 300): T {
    const [v, setV] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setV(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return v;
}

export function formatMinutes(min: number | null | undefined): string {
    if (min == null) return '—';
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 || h >= 20 ? `${Math.round(min / 60)}h` : `${h}h ${m}m`;
}

export const platformLabel = (p: { name: string; abbreviation: string | null }) =>
    p.abbreviation ?? p.name;
export const yearOf = (date: string | null) => (date ? date.slice(0, 4) : null);

/** Today in the user's own timezone as YYYY-MM-DD (the server can't know it). */
export function todayLocal(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "Mar 1, 2025" from a YYYY-MM-DD date; null means the date is unknown. */
export function formatDate(date: string | null): string {
    if (!date) return 'date unknown';
    return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC'
    });
}

/** Whole days between two YYYY-MM-DD dates, inclusive of neither end, or null if either is unknown. */
export function daysBetween(from: string | null, to: string | null): number | null {
    if (!from || !to) return null;
    return Math.round(
        (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
    );
}
