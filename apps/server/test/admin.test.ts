import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { users } from '../src/db/schema.js';
import { cookieFrom, makeApp, register } from './helpers.js';

async function setup() {
    const { app, db } = makeApp();
    const cookie = cookieFrom(await register(app, 'me@example.com', undefined, 'joe'));
    const get = (headers: Record<string, string> = { cookie }) =>
        app.request('/api/admin', { headers });
    const me = async () =>
        (await (await app.request('/api/auth/me', { headers: { cookie } })).json()).user;
    const setRole = (role: 'gamer' | 'admin') =>
        db.update(users).set({ role }).where(eq(users.username, 'joe')).run();
    return { get, me, setRole };
}

describe('roles', () => {
    it('gives new users the gamer role', async () => {
        const { me } = await setup();
        expect((await me()).role).toBe('gamer');
    });

    it('rejects anonymous requests with 401', async () => {
        const { get } = await setup();
        expect((await get({})).status).toBe(401);
    });

    it('rejects gamers with 403', async () => {
        const { get } = await setup();
        const res = await get();
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: 'Admin access required' });
    });

    it('lets admins in, and the role shows on /me', async () => {
        const { get, me, setRole } = await setup();
        setRole('admin');
        expect((await get()).status).toBe(200);
        expect((await me()).role).toBe('admin');
    });

    it('applies a role change to a live session immediately', async () => {
        const { get, setRole } = await setup();
        setRole('admin');
        expect((await get()).status).toBe(200);
        setRole('gamer');
        expect((await get()).status).toBe(403);
    });
});

describe('backup status', () => {
    const status = {
        lastRunAt: 1_800_000_000_000,
        ok: true,
        error: null,
        lastSuccessAt: 1_800_000_000_000,
        file: 'gamequeue-2026-10-21-030000.db.gz',
        sizeBytes: 4096,
        offsite: 'uploaded'
    };

    async function adminWithDir() {
        const dir = mkdtempSync(join(tmpdir(), 'gq-backup-'));
        const { app, db } = makeApp({ databasePath: join(dir, 'gamequeue.db') });
        const cookie = cookieFrom(await register(app, 'me@example.com', undefined, 'joe'));
        db.update(users).set({ role: 'admin' }).where(eq(users.username, 'joe')).run();
        const get = async () => {
            const res = await app.request('/api/admin/backup', { headers: { cookie } });
            return { status: res.status, body: await res.json() };
        };
        return { dir, app, cookie, get };
    }

    it('is admin only', async () => {
        const { app } = makeApp();
        const cookie = cookieFrom(await register(app, 'me@example.com', undefined, 'joe'));
        expect((await app.request('/api/admin/backup')).status).toBe(401);
        expect((await app.request('/api/admin/backup', { headers: { cookie } })).status).toBe(403);
    });

    it('reports never run when there is no status file', async () => {
        const { get } = await adminWithDir();
        expect(await get()).toEqual({ status: 200, body: { backup: null, unreadable: false } });
    });

    it('returns the status the backup script wrote next to the database', async () => {
        const { dir, get } = await adminWithDir();
        writeFileSync(join(dir, 'backup-status.json'), JSON.stringify(status));
        expect(await get()).toEqual({ status: 200, body: { backup: status, unreadable: false } });
    });

    it('flags a corrupt or wrongly shaped file as unreadable', async () => {
        const { dir, get } = await adminWithDir();
        writeFileSync(join(dir, 'backup-status.json'), '{ half a fi');
        expect((await get()).body).toEqual({ backup: null, unreadable: true });
        writeFileSync(join(dir, 'backup-status.json'), JSON.stringify({ ok: 'yes' }));
        expect((await get()).body).toEqual({ backup: null, unreadable: true });
    });
});
