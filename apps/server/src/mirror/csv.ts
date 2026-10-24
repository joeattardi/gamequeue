import { parse } from 'csv-parse';
import type { Readable } from 'node:stream';

export type CsvRow = Record<string, string>;

/** Rows of an IGDB dump CSV (header line = field names), streamed so the file is never held whole. */
export function readCsv(stream: Readable): AsyncIterable<CsvRow> {
    const parser = parse({ columns: true, bom: true, skip_empty_lines: true });
    stream.on('error', (e) => parser.destroy(e));
    return stream.pipe(parser);
}

/** `{1,2,3}` (how dumps write id arrays) as numbers; empty or missing is an empty array. */
export function parseIds(value: string | undefined): number[] {
    if (!value) return [];
    return value
        .replace(/^\{|\}$/g, '')
        .split(',')
        .filter((s) => s.trim() !== '')
        .map(Number)
        .filter(Number.isInteger);
}

/** An integer cell, or null when empty or not a number. */
export function int(value: string | undefined): number | null {
    if (value === undefined || value.trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : null;
}

/** A text cell, or null when empty. */
export const text = (value: string | undefined): string | null => (value ? value : null);
