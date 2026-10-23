import { describe, expect, it } from 'vitest';
import type { EntryDto } from './collection.js';
import { ENTRY_CSV_HEADER, entriesToCsv, toCsv } from './csv.js';

describe('toCsv', () => {
    it('quotes cells with commas, quotes and newlines and ends rows with CRLF', () => {
        expect(toCsv([['a,b', 'say "hi"', 'two\nlines', 3, null]])).toBe(
            '﻿"a,b","say ""hi""","two\nlines",3,\r\n'
        );
    });

    it('defuses text that a spreadsheet would run as a formula, but not numbers', () => {
        expect(toCsv([['=SUM(A1)', '+1', '-1', '@x', 'fine', -5]])).toBe(
            "﻿'=SUM(A1),'+1,'-1,'@x,fine,-5\r\n"
        );
    });
});

describe('entriesToCsv', () => {
    it('writes one row per game under the header', () => {
        const e = {
            status: 'finished',
            platforms: [{ name: 'PC' }, { name: 'Switch' }],
            tags: ['cozy', 'short'],
            rating: 5,
            ttbMinutes: 90,
            addedAt: Date.parse('2025-03-04T10:00:00Z'),
            lastFinishedOn: '2025-04-01',
            playthroughCount: 2,
            notes: 'Loved it, "really"',
            game: {
                id: 7,
                name: 'Celeste',
                genres: ['Platform'],
                igdbRating: 91,
                releaseDate: '2018-01-25'
            }
        } as unknown as EntryDto;
        const lines = entriesToCsv([e]).slice(1).split('\r\n');
        expect(lines[0]).toBe(ENTRY_CSV_HEADER.join(','));
        expect(lines[1]).toBe(
            'Celeste,finished,PC; Switch,cozy; short,Platform,5,no,91,1.5,2018-01-25,2025-03-04,2025-04-01,2,"Loved it, ""really""",7'
        );
        expect(lines[2]).toBe('');
    });
});
