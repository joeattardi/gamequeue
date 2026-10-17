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
