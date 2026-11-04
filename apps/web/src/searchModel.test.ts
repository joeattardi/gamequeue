import type { EntryDto, SearchResultDto } from '@gamequeue/shared';
import { describe, expect, it } from 'vitest';
import { pushRecent } from './recentSearches';
import {
    buildResults,
    defaultPlatformIds,
    highlight,
    igdbRowState,
    metaParts,
    rankByQuery
} from './searchModel';

const PC = { id: 6, name: 'PC', abbreviation: 'PC' };
const PS5 = { id: 167, name: 'PlayStation 5', abbreviation: 'PS5' };

const entry = (id: number, gameId: number, name: string, platforms = [PC]) =>
    ({ id, game: { id: gameId, name }, platforms }) as unknown as EntryDto;
const hit = (igdbId: number, name: string, extra: Partial<SearchResultDto> = {}) =>
    ({
        igdbId,
        name,
        year: 2010,
        coverImageId: null,
        igdbRating: 80,
        platforms: [PC],
        entryId: null,
        wishlisted: false,
        ...extra
    }) as SearchResultDto;

describe('highlight', () => {
    it('marks each matching word, ignoring case', () => {
        expect(highlight('Dragon Age: Origins', 'dragon age')).toEqual([
            { text: 'Dragon', match: true },
            { text: ' ', match: false },
            { text: 'Age', match: true },
            { text: ': Origins', match: false }
        ]);
    });
    it('treats regex characters in the query as plain text', () => {
        expect(highlight('Half-Life (2004)', '(2004')).toEqual([
            { text: 'Half-Life ', match: false },
            { text: '(2004', match: true },
            { text: ')', match: false }
        ]);
    });
    it('returns the whole text when there is nothing to match', () => {
        expect(highlight('Hades', '')).toEqual([{ text: 'Hades', match: false }]);
        expect(highlight('Hades', 'zz')).toEqual([{ text: 'Hades', match: false }]);
    });
});

describe('rankByQuery', () => {
    it('puts exact, then prefix, then word-start, then other matches first', () => {
        const names = ['Shades of Gray', 'Super Hades Fan Game', 'Hades II', 'The Hades', 'Hades'];
        expect(rankByQuery(names, (n) => n, 'hades')).toEqual([
            'Hades',
            'Hades II',
            'Super Hades Fan Game',
            'The Hades',
            'Shades of Gray'
        ]);
    });
});

describe('buildResults', () => {
    const entries = [entry(1, 10, 'Dragon Age: Inquisition'), entry(2, 40, 'Dragon Quest', [PS5])];
    const igdb = [
        hit(10, 'Dragon Age: Inquisition', { entryId: 1 }),
        hit(20, 'Dragon Age: Origins'),
        hit(30, 'Dragon Age II', { platforms: [PS5], wishlisted: true })
    ];

    it('does not offer a game that is already in the library again', () => {
        const r = buildResults({ query: 'dragon', entries, igdb, scope: 'all' });
        expect(r.library).toHaveLength(2);
        expect(r.add.map((x) => x.igdbId)).toEqual([20, 30]);
        expect(r.counts).toEqual({ all: 4, library: 2, add: 2 });
    });
    it('scopes to the library, to new games, or to a platform, keeping the counts', () => {
        expect(buildResults({ query: 'd', entries, igdb, scope: 'library' }).add).toEqual([]);
        expect(buildResults({ query: 'd', entries, igdb, scope: 'new' }).library).toEqual([]);
        const ps5 = buildResults({ query: 'd', entries, igdb, scope: 'p:167' });
        expect(ps5.library.map((e) => e.id)).toEqual([2]);
        expect(ps5.add.map((x) => x.igdbId)).toEqual([30]);
        expect(ps5.counts.all).toBe(4);
    });
    it('keeps a game added in this search where it was, with its new state', () => {
        const added = new Map([[20, { status: 'unplayed' as const, entryId: 5 }]]);
        const r = buildResults({ query: 'dragon', entries, igdb, scope: 'all', added });
        expect(r.add.map((x) => x.igdbId)).toEqual([20, 30]);
        expect(igdbRowState(igdb[1]!, added)).toEqual({
            kind: 'added',
            status: 'unplayed',
            entryId: 5
        });
        expect(igdbRowState(igdb[2]!, added)).toEqual({ kind: 'wishlist' });
        expect(igdbRowState(igdb[0]!, added)).toEqual({ kind: 'owned', entryId: 1 });
    });
});

describe('metaParts', () => {
    it('shows the year, three platforms and a +N', () => {
        const p = (a: string) => ({ abbreviation: a, name: a });
        expect(metaParts(2009, [p('PC'), p('PS3'), p('X360'), p('Mac'), p('Linux')])).toEqual([
            '2009',
            'PC',
            'PS3',
            'X360',
            '+2'
        ]);
        expect(metaParts(null, [])).toEqual([]);
    });
});

describe('pushRecent', () => {
    it('adds to the front without duplicates and keeps five', () => {
        let l: string[] = [];
        for (const q of ['a1', 'b2', 'c3', 'd4', 'e5', 'f6']) l = pushRecent(l, q);
        expect(l).toEqual(['f6', 'e5', 'd4', 'c3', 'b2']);
        expect(pushRecent(l, ' D4 ')).toEqual(['D4', 'f6', 'e5', 'c3', 'b2']);
    });
    it('ignores queries shorter than two characters', () => {
        expect(pushRecent(['hades'], 'h')).toEqual(['hades']);
    });
});

describe('defaultPlatformIds', () => {
    it('prefers the most recently used platform the game is on', () => {
        expect(defaultPlatformIds([167, 6], [{ id: 6 }, { id: 167 }])).toEqual([167]);
        expect(defaultPlatformIds([130, 6], [{ id: 6 }, { id: 167 }])).toEqual([6]);
    });
    it('falls back to the first platform, or nothing', () => {
        expect(defaultPlatformIds([130], [{ id: 6 }, { id: 167 }])).toEqual([6]);
        expect(defaultPlatformIds([6], [])).toEqual([]);
    });
});
