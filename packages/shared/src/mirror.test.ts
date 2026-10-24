import { describe, expect, it } from 'vitest';
import {
    MIRROR_STALE_MS,
    dumpTime,
    mirrorHealth,
    mirrorRunSchema,
    type MirrorStatusDto
} from './mirror.js';

const NOW = 1_800_000_000_000;
const status = (over: Partial<MirrorStatusDto> = {}): MirrorStatusDto => ({
    mirror: {
        builtAt: NOW - 1000,
        dump: '1792821600_games.csv',
        dumpAt: 1792821600000,
        games: 383734,
        searchable: 338811,
        sizeBytes: 251465728
    },
    run: {
        lastRunAt: NOW - 1000,
        ok: true,
        error: null,
        result: 'built',
        lastSuccessAt: NOW - 1000,
        dump: '1792821600_games.csv',
        seconds: 47,
        attempts: 1
    },
    runUnreadable: false,
    syncedDump: '1792821600_games.csv',
    lookups: null,
    ...over
});

describe('mirrorHealth', () => {
    it('is healthy after a recent successful run, built or current', () => {
        expect(mirrorHealth(status(), NOW)).toBe('healthy');
        const current = status();
        current.run!.result = 'current';
        expect(mirrorHealth(current, NOW)).toBe('healthy');
    });

    it('is never when nothing has been built or reported', () =>
        expect(mirrorHealth(status({ mirror: null, run: null }), NOW)).toBe('never'));

    it('is stale for a mirror file the job has never reported on', () =>
        expect(mirrorHealth(status({ run: null }), NOW)).toBe('stale'));

    it('flags a failed last run even if an older one succeeded', () => {
        const s = status();
        Object.assign(s.run!, { ok: false, error: 'download failed', result: null });
        expect(mirrorHealth(s, NOW)).toBe('failed');
    });

    it('flags a success that is too old', () => {
        const s = status();
        s.run!.lastSuccessAt = NOW - MIRROR_STALE_MS - 1;
        expect(mirrorHealth(s, NOW)).toBe('stale');
        s.run!.lastSuccessAt = NOW - MIRROR_STALE_MS;
        expect(mirrorHealth(s, NOW)).toBe('healthy');
        s.run!.lastSuccessAt = null;
        expect(mirrorHealth(s, NOW)).toBe('stale');
    });

    it('flags a successful run whose file has gone missing', () =>
        expect(mirrorHealth(status({ mirror: null }), NOW)).toBe('missing'));
});

describe('dumpTime', () => {
    it('reads the epoch seconds from the dump file name', () => {
        expect(dumpTime('1792821600_games.csv')).toBe(1792821600000);
        expect(dumpTime('games.csv')).toBeNull();
        expect(dumpTime(null)).toBeNull();
    });
});

describe('mirrorRunSchema', () => {
    it('accepts what the job writes and rejects the rest', () => {
        expect(mirrorRunSchema.safeParse(status().run).success).toBe(true);
        expect(mirrorRunSchema.safeParse({ ok: true }).success).toBe(false);
    });
});
