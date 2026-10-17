import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

const here = dirname(fileURLToPath(import.meta.url));
// src/db → ../../drizzle in dev/tests; dist/ → ../drizzle in the bundled build
export const MIGRATIONS_DIR =
    process.env.MIGRATIONS_DIR ??
    resolve(here, here.endsWith('db') ? '../../drizzle' : '../drizzle');

/** Opens (and migrates) a database. Use ":memory:" for tests. */
export function openDb(path: string): Db {
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
    const sqlite = new Database(path);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    return db;
}
