import type { EntryDto } from './collection.js';

/**
 * Text cells that start with one of these can run as a formula when the file is opened in a
 * spreadsheet, so they get a leading apostrophe (the usual mitigation for CSV injection).
 */
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: string | number | null): string {
    if (value === null) return '';
    let text = String(value);
    if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180: CRLF line endings, quotes doubled. Starts with a BOM so Excel reads it as UTF-8. */
export function toCsv(rows: (string | number | null)[][]): string {
    return `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}

export const ENTRY_CSV_HEADER = [
    'Title',
    'Status',
    'Platforms',
    'Tags',
    'Genres',
    'Your rating (1-5)',
    'IGDB score',
    'Time to beat (hours)',
    'Release date',
    'Added',
    'Last finished',
    'Playthroughs',
    'Notes',
    'IGDB ID'
];

/** One row per game, in the order given. */
export function entriesToCsv(entries: EntryDto[]): string {
    return toCsv([
        ENTRY_CSV_HEADER,
        ...entries.map((e) => [
            e.game.name,
            e.status,
            e.platforms.map((p) => p.name).join('; '),
            e.tags.join('; '),
            e.game.genres.join('; '),
            e.rating,
            e.game.igdbRating,
            e.ttbMinutes === null ? null : Math.round((e.ttbMinutes / 60) * 10) / 10,
            e.game.releaseDate,
            new Date(e.addedAt).toISOString().slice(0, 10),
            e.lastFinishedOn,
            e.playthroughCount,
            e.notes,
            e.game.id
        ])
    ]);
}
