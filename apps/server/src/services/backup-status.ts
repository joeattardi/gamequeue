import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { backupStatusSchema, type BackupReportDto } from '@gamequeue/shared';
import type { Config } from '../config.js';

/** `scripts/backup.sh` writes its status here: next to the database, so it is in the mounted `/data`. */
export const backupStatusPath = (config: Config) =>
    join(dirname(config.databasePath), 'backup-status.json');

/** Reads the status the backup script left behind. Missing file = never run; bad content = unreadable. */
export function readBackupReport(config: Config): BackupReportDto {
    let raw: string;
    try {
        raw = readFileSync(backupStatusPath(config), 'utf8');
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT')
            return { backup: null, unreadable: false };
        return { backup: null, unreadable: true };
    }
    try {
        const parsed = backupStatusSchema.safeParse(JSON.parse(raw));
        return parsed.success
            ? { backup: parsed.data, unreadable: false }
            : { backup: null, unreadable: true };
    } catch {
        return { backup: null, unreadable: true };
    }
}
