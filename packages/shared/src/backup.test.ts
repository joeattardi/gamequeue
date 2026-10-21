import { describe, expect, it } from 'vitest';
import {
    BACKUP_STALE_MS,
    backupHealth,
    backupStatusSchema,
    type BackupStatusDto
} from './backup.js';

const NOW = 1_800_000_000_000;
const good: BackupStatusDto = {
    lastRunAt: NOW - 1000,
    ok: true,
    error: null,
    lastSuccessAt: NOW - 1000,
    file: 'gamequeue-2026-10-21-030000.db.gz',
    sizeBytes: 4096,
    offsite: 'uploaded'
};

describe('backupHealth', () => {
    it('is never without a status', () => expect(backupHealth(null, NOW)).toBe('never'));

    it('is healthy for a recent, uploaded run', () =>
        expect(backupHealth(good, NOW)).toBe('healthy'));

    it('flags a failed last run even if an older one succeeded', () =>
        expect(backupHealth({ ...good, ok: false, error: 'boom' }, NOW)).toBe('failed'));

    it('flags a success that is too old', () => {
        const old = { ...good, lastSuccessAt: NOW - BACKUP_STALE_MS - 1 };
        expect(backupHealth(old, NOW)).toBe('stale');
        expect(backupHealth({ ...good, lastSuccessAt: NOW - BACKUP_STALE_MS }, NOW)).toBe(
            'healthy'
        );
    });

    it('flags a run that never succeeded', () =>
        expect(backupHealth({ ...good, lastSuccessAt: null }, NOW)).toBe('stale'));

    it('notes a missing off-site copy', () =>
        expect(backupHealth({ ...good, offsite: 'not-configured' }, NOW)).toBe('no-offsite'));
});

describe('backupStatusSchema', () => {
    it('rejects unknown offsite values and non-objects', () => {
        expect(backupStatusSchema.safeParse({ ...good, offsite: 'maybe' }).success).toBe(false);
        expect(backupStatusSchema.safeParse('nope').success).toBe(false);
        expect(backupStatusSchema.safeParse(good).success).toBe(true);
    });
});
