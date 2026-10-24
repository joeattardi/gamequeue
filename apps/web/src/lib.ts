import { releaseBadge, releaseLabel, type GameDto } from '@gamequeue/shared';
import { useEffect, useState } from 'react';

export function useDebounced<T>(value: T, ms = 300): T {
    const [v, setV] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setV(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return v;
}

/** Time-of-day greeting in the user's own timezone, e.g. "Good evening, Joe" (or just "Good evening"). */
export function greeting(firstName?: string | null, now = new Date()): string {
    const h = now.getHours();
    const hello =
        h < 5 ? 'Hello' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    return firstName ? `${hello}, ${firstName}` : hello;
}

export function formatMinutes(min: number | null | undefined): string {
    if (min == null) return '—';
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 || h >= 20 ? `${Math.round(min / 60)}h` : `${h}h ${m}m`;
}

/** "812 B", "4.2 KB", "36.5 MB", "515 GB": the next unit up at 1024, one decimal under 10, none above. */
export function formatBytes(n: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = n;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    if (unit === 0) return `${n} B`;
    // Rounding can land on 1024 (1023.97 MB): show it in the next unit instead
    if (Math.round(value) >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** "3d 4h", "5h 12m", "7m"; for uptime. */
export function formatDuration(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

/** Low when under a tenth of the volume or under 1 GB is left. */
export const diskIsLow = (disk: { totalBytes: number; freeBytes: number }) =>
    disk.freeBytes < 1024 ** 3 || disk.freeBytes / disk.totalBytes < 0.1;

/** "5 minutes ago", "3 hours ago", "2 days ago"; "just now" under a minute. */
export function timeAgo(then: number, now = Date.now()): string {
    const s = Math.max(0, Math.round((now - then) / 1000));
    if (s < 60) return 'just now';
    const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'} ago`;
    if (s < 3600) return unit(Math.floor(s / 60), 'minute');
    if (s < 86400) return unit(Math.floor(s / 3600), 'hour');
    return unit(Math.floor(s / 86400), 'day');
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

const APP_NAME = 'GameQueue';

/** Sets the tab title to "<title> | GameQueue" (plain "GameQueue" while there is no title yet). */
export function usePageTitle(title?: string | null) {
    useEffect(() => {
        document.title = title ? `${title} | ${APP_NAME}` : APP_NAME;
    }, [title]);
}

/** "Nov 19, 2026" / "Q4 2027" / "TBA". */
export const releaseText = (game: Pick<GameDto, 'releaseDate' | 'releasePrecision'>) =>
    releaseLabel(game.releaseDate, game.releasePrecision);

/** "in 6 days" / "Q4 2027" / "TBA" for a game that isn't out yet, null once it is. */
export const releaseBadgeText = (game: Pick<GameDto, 'releaseDate' | 'releasePrecision'>) =>
    releaseBadge(game.releaseDate, game.releasePrecision, todayLocal());

/** Minor units (cents) as money in the user's locale, e.g. 1249 USD -> "$12.49". */
export const formatPrice = (minor: number, currency: string) => {
    try {
        return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(
            minor / 100
        );
    } catch {
        return `${(minor / 100).toFixed(2)} ${currency}`;
    }
};

/** December and January: when the year-in-review is promoted in the navigation. */
export const isRecapSeason = (now = new Date()) => now.getMonth() === 11 || now.getMonth() === 0;
