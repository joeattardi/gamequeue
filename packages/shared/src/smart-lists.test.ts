import { describe, expect, it } from 'vitest';
import type { EntryDto } from './collection.js';
import {
    SMART_LIST_PRESETS,
    defaultSmartDir,
    describeRule,
    describeRules,
    evaluateSmartList,
    matchesRule,
    smartListInputSchema,
    smartRuleSchema,
    type SmartRule
} from './smart-lists.js';

const NOW = Date.parse('2026-10-18T12:00:00Z');
const DAY = 86_400_000;

let nextId = 1;
function entry(over: Record<string, unknown> = {}, game: Record<string, unknown> = {}): EntryDto {
    return {
        id: nextId++,
        status: 'unplayed',
        rating: null,
        ttbMinutes: null,
        addedAt: NOW,
        updatedAt: NOW,
        lastFinishedOn: null,
        platforms: [],
        tags: [],
        ...over,
        game: { name: 'Game', genres: [], igdbRating: null, releaseDate: null, ...game }
    } as unknown as EntryDto;
}

const rule = (r: SmartRule) => r;

describe('matchesRule', () => {
    it('matches set rules on any-of, ignoring case for names', () => {
        const e = entry(
            { status: 'paused', tags: ['Cozy'], platforms: [{ id: 6, name: 'PC' }] },
            { genres: ['Puzzle'] }
        );
        expect(matchesRule(e, rule({ field: 'status', anyOf: ['paused', 'finished'] }), NOW)).toBe(
            true
        );
        expect(matchesRule(e, rule({ field: 'status', anyOf: ['unplayed'] }), NOW)).toBe(false);
        expect(matchesRule(e, rule({ field: 'platform', anyOf: [130, 6] }), NOW)).toBe(true);
        expect(matchesRule(e, rule({ field: 'platform', anyOf: [130] }), NOW)).toBe(false);
        expect(matchesRule(e, rule({ field: 'tag', anyOf: ['cozy'] }), NOW)).toBe(true);
        expect(matchesRule(e, rule({ field: 'genre', anyOf: ['PUZZLE'] }), NOW)).toBe(true);
        expect(matchesRule(e, rule({ field: 'genre', anyOf: ['Shooter'] }), NOW)).toBe(false);
    });

    it('compares numbers inclusively and never matches an unknown value', () => {
        const known = entry({ ttbMinutes: 300, rating: 4 }, { igdbRating: 80 });
        const unknown = entry();
        const ttbMax: SmartRule = { field: 'ttb', op: 'lte', value: 300 };
        expect(matchesRule(known, ttbMax, NOW)).toBe(true);
        expect(matchesRule(known, { field: 'ttb', op: 'lte', value: 299 }, NOW)).toBe(false);
        expect(matchesRule(known, { field: 'igdbScore', op: 'gte', value: 80 }, NOW)).toBe(true);
        expect(matchesRule(known, { field: 'rating', op: 'gte', value: 5 }, NOW)).toBe(false);
        // unknown values fail both directions, like the pick filter's max time
        expect(matchesRule(unknown, ttbMax, NOW)).toBe(false);
        expect(matchesRule(unknown, { field: 'ttb', op: 'gte', value: 0 }, NOW)).toBe(false);
        expect(matchesRule(unknown, { field: 'ttb', op: 'unknown' }, NOW)).toBe(true);
        expect(matchesRule(known, { field: 'ttb', op: 'unknown' }, NOW)).toBe(false);
    });

    it('counts whole days since a timestamp or date', () => {
        const e = entry({
            addedAt: NOW - 365 * DAY,
            updatedAt: NOW - 29.5 * DAY,
            lastFinishedOn: '2024-10-18'
        });
        expect(matchesRule(e, { field: 'addedDays', op: 'gte', value: 365 }, NOW)).toBe(true);
        expect(matchesRule(e, { field: 'addedDays', op: 'gte', value: 366 }, NOW)).toBe(false);
        // 29.5 days floors to 29
        expect(matchesRule(e, { field: 'changedDays', op: 'gte', value: 30 }, NOW)).toBe(false);
        expect(matchesRule(e, { field: 'changedDays', op: 'lte', value: 29 }, NOW)).toBe(true);
        expect(matchesRule(e, { field: 'finishedDays', op: 'gte', value: 730 }, NOW)).toBe(true);
        expect(matchesRule(entry(), { field: 'finishedDays', op: 'gte', value: 0 }, NOW)).toBe(
            false
        );
        expect(matchesRule(entry(), { field: 'finishedDays', op: 'unknown' }, NOW)).toBe(true);
    });

    it('reads the release year from the date', () => {
        const e = entry({}, { releaseDate: '2011-11-11' });
        expect(matchesRule(e, { field: 'releaseYear', op: 'lte', value: 2011 }, NOW)).toBe(true);
        expect(matchesRule(e, { field: 'releaseYear', op: 'gte', value: 2012 }, NOW)).toBe(false);
        expect(matchesRule(entry(), { field: 'releaseYear', op: 'unknown' }, NOW)).toBe(true);
    });
});

describe('evaluateSmartList', () => {
    const a = entry({ ttbMinutes: 120 }, { name: 'Alpha' });
    const b = entry({ ttbMinutes: 60 }, { name: 'Beta' });
    const c = entry({ ttbMinutes: null }, { name: 'Gamma' });
    const done = entry({ status: 'finished', ttbMinutes: 30 }, { name: 'Done' });
    const all = [a, b, c, done];
    const unplayed: SmartRule = { field: 'status', anyOf: ['unplayed'] };

    it('ANDs every rule', () => {
        const got = evaluateSmartList(
            all,
            [unplayed, { field: 'ttb', op: 'lte', value: 90 }],
            'title',
            'asc',
            NOW
        );
        expect(got.map((e) => e.game.name)).toEqual(['Beta']);
    });

    it('sorts, with missing values last in both directions', () => {
        const names = (dir: 'asc' | 'desc') =>
            evaluateSmartList(all, [unplayed], 'ttb', dir, NOW).map((e) => e.game.name);
        expect(names('asc')).toEqual(['Beta', 'Alpha', 'Gamma']);
        expect(names('desc')).toEqual(['Alpha', 'Beta', 'Gamma']);
    });

    it('breaks ties by title and does not mutate its input', () => {
        const x = entry({ rating: 3 }, { name: 'Zed' });
        const y = entry({ rating: 3 }, { name: 'Abe' });
        const input = [x, y];
        const got = evaluateSmartList(
            input,
            [{ field: 'rating', op: 'gte', value: 1 }],
            'rating',
            'desc',
            NOW
        );
        expect(got.map((e) => e.game.name)).toEqual(['Abe', 'Zed']);
        expect(input).toEqual([x, y]);
    });

    it('has a natural direction per sort', () => {
        expect(defaultSmartDir('title')).toBe('asc');
        expect(defaultSmartDir('score')).toBe('desc');
        expect(defaultSmartDir('changed')).toBe('asc');
    });
});

describe('describing rules', () => {
    const name = (id: number) => (id === 130 ? 'Switch' : 'PC');
    it('writes each rule in words', () => {
        expect(describeRule({ field: 'status', anyOf: ['unplayed'] })).toBe('Status is unplayed');
        expect(describeRule({ field: 'status', anyOf: ['unplayed', 'paused'] })).toBe(
            'Status is unplayed or paused'
        );
        expect(describeRule({ field: 'platform', anyOf: [130, 6, 1] }, name)).toBe(
            'Platform is Switch, PC or PC'
        );
        expect(describeRule({ field: 'tag', anyOf: ['cozy'] })).toBe('Tagged cozy');
        expect(describeRule({ field: 'ttb', op: 'lte', value: 300 })).toBe(
            'Time to beat at most 5 h'
        );
        expect(describeRule({ field: 'ttb', op: 'lte', value: 45 })).toBe(
            'Time to beat at most 45 min'
        );
        expect(describeRule({ field: 'rating', op: 'gte', value: 4 })).toBe(
            'Your rating at least 4 stars'
        );
        expect(describeRule({ field: 'addedDays', op: 'gte', value: 365 })).toBe(
            'Added to collection at least 365 days ago'
        );
        expect(describeRule({ field: 'releaseYear', op: 'lte', value: 2005 })).toBe(
            'Release year in or before 2005'
        );
        expect(describeRule({ field: 'rating', op: 'unknown' })).toBe('Your rating is unknown');
        expect(describeRules([{ field: 'genre', anyOf: ['RPG'] }])).toEqual(['Genre is RPG']);
    });
});

describe('schemas and presets', () => {
    it('rejects malformed rules', () => {
        const bad = [
            { field: 'status', anyOf: [] },
            { field: 'status', anyOf: ['nope'] },
            { field: 'ttb', op: 'gte' },
            { field: 'ttb', op: 'lte', value: -1 },
            { field: 'ttb', op: 'lte', value: 1.5 },
            { field: 'colour', op: 'lte', value: 1 }
        ];
        for (const r of bad)
            expect(smartRuleSchema.safeParse(r).success, JSON.stringify(r)).toBe(false);
        expect(smartRuleSchema.safeParse({ field: 'ttb', op: 'unknown' }).success).toBe(true);
        // stray keys are dropped, not stored
        expect(smartRuleSchema.parse({ field: 'ttb', op: 'unknown', value: 3 })).toEqual({
            field: 'ttb',
            op: 'unknown'
        });
    });

    it('needs a name and at least one rule', () => {
        const ok = { name: 'X', rules: [{ field: 'tag', anyOf: ['a'] }] };
        expect(smartListInputSchema.safeParse(ok).data?.sort).toBe('title');
        expect(smartListInputSchema.safeParse({ ...ok, name: ' ' }).success).toBe(false);
        expect(smartListInputSchema.safeParse({ ...ok, rules: [] }).success).toBe(false);
    });

    it('ships presets that are valid inputs', () => {
        expect(SMART_LIST_PRESETS.map((p) => p.name)).toEqual([
            'Quick wins',
            'Hidden gems',
            'Long-neglected',
            'Gathering dust',
            'Replay candidates'
        ]);
        for (const p of SMART_LIST_PRESETS) {
            expect(smartListInputSchema.safeParse(p).success, p.key).toBe(true);
        }
    });
});
