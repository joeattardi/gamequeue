import { z } from 'zod';

/** Written by `scripts/backup.sh` to `backup-status.json` next to the database, read by the admin page. */
export const backupStatusSchema = z.object({
    /** When the last run finished (epoch ms) */
    lastRunAt: z.number().int(),
    /** True when the snapshot was made, passed its integrity check and (if configured) was uploaded */
    ok: z.boolean(),
    /** What went wrong when `ok` is false */
    error: z.string().nullable(),
    /** When the last fully successful run finished; kept across failed runs. Null = never succeeded */
    lastSuccessAt: z.number().int().nullable(),
    /** Snapshot file name and compressed size from the last run that got as far as making one */
    file: z.string().nullable(),
    sizeBytes: z.number().int().nonnegative().nullable(),
    offsite: z.enum(['uploaded', 'not-configured', 'failed'])
});
export type BackupStatusDto = z.infer<typeof backupStatusSchema>;

export interface BackupReportDto {
    /** Null when the script has never written a status file (or it can't be read, see `unreadable`) */
    backup: BackupStatusDto | null;
    unreadable: boolean;
}

/** The nightly backup runs at 03:00; a day plus slack before a missing run counts as a problem. */
export const BACKUP_STALE_MS = 26 * 3600 * 1000;

export type BackupHealth = 'healthy' | 'no-offsite' | 'stale' | 'failed' | 'never';

/** Worst problem first: a failed run beats a stale one, which beats a missing off-site copy. */
export function backupHealth(backup: BackupStatusDto | null, now: number): BackupHealth {
    if (!backup) return 'never';
    if (!backup.ok) return 'failed';
    if (backup.lastSuccessAt === null || now - backup.lastSuccessAt > BACKUP_STALE_MS)
        return 'stale';
    if (backup.offsite === 'not-configured') return 'no-offsite';
    return 'healthy';
}
