import { eq } from 'drizzle-orm';
import type { AdminSettingsDto } from '@gamequeue/shared';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { settings } from '../db/schema.js';

const SIGNUPS = 'signups_enabled';

export function read(db: Db, key: string): string | undefined {
    return db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).get()
        ?.value;
}

/** An admin's saved choice wins; until one is made, the SIGNUPS_ENABLED environment value applies. */
export function signupsEnabled(db: Db, config: Config): boolean {
    const saved = read(db, SIGNUPS);
    return saved === undefined ? config.signupsEnabled : saved === 'true';
}

/** Saves a value under a key of the `settings` table. */
export function write(db: Db, key: string, value: string) {
    db.insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: Date.now() } })
        .run();
}

export function getAdminSettings(db: Db, config: Config): AdminSettingsDto {
    return {
        signupsEnabled: signupsEnabled(db, config),
        signupsDefault: config.signupsEnabled,
        signupsOverridden: read(db, SIGNUPS) !== undefined
    };
}

export function updateAdminSettings(
    db: Db,
    config: Config,
    input: { signupsEnabled: boolean }
): AdminSettingsDto {
    const value = String(input.signupsEnabled);
    db.insert(settings)
        .values({ key: SIGNUPS, value })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: Date.now() } })
        .run();
    return getAdminSettings(db, config);
}
