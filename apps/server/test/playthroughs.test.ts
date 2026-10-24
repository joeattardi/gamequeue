import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { entries, playthroughs } from '../src/db/schema.js';
import { cookieFrom, fakeGame, fakeIgdb, json, makeApp, PC, PS5, register } from './helpers.js';

const catalog = [fakeGame(1, 'Hades'), fakeGame(2, 'Celeste'), fakeGame(3, 'Hollow Knight')];

async function setup() {
    const { app, db } = makeApp({}, fakeIgdb(catalog).client);
    const cookie = cookieFrom(await register(app));
    const call = (path: string, method = 'GET', body?: unknown) =>
        app.request(`/api${path}`, {
            ...(body === undefined ? {} : json(body)),
            method,
            headers: {
                origin: 'http://localhost',
                cookie,
                ...(body === undefined ? {} : { 'content-type': 'application/json' })
            }
        });
    const add = async (igdbId: number, platformIds = [PC.id]) =>
        (await (await call('/entries', 'POST', { igdbId, platformIds })).json()).entry;
    const act = async (id: number, action: string, body?: unknown) => {
        const res = await call(`/entries/${id}/${action}`, 'POST', body);
        return { status: res.status, ...(await res.json()) };
    };
    const history = async (id: number) =>
        (await (await call(`/entries/${id}/playthroughs`)).json()).playthroughs;
    const entry = async (id: number) => (await (await call(`/entries/${id}`)).json()).entry;
    return { app, db, cookie, call, add, act, history, entry };
}

describe('start, pause, resume, finish', () => {
    it('runs the full lifecycle and records dates, platform and rating', async () => {
        const { add, act, history, entry } = await setup();
        const e = await add(1);

        const started = await act(e.id, 'start', { date: '2025-03-01' });
        expect(started.status).toBe(200);
        expect(started.entry).toMatchObject({
            status: 'playing',
            playthroughCount: 1,
            openPlaythrough: {
                startedOn: '2025-03-01',
                endedOn: null,
                outcome: null,
                platform: { id: PC.id }
            }
        });

        expect((await act(e.id, 'pause')).entry.status).toBe('paused');
        expect((await act(e.id, 'resume')).entry.status).toBe('playing');

        const done = await act(e.id, 'finish', { date: '2025-03-20', rating: 5 });
        expect(done.entry).toMatchObject({
            status: 'finished',
            rating: 5,
            openPlaythrough: null,
            lastFinishedOn: '2025-03-20'
        });
        expect(await history(e.id)).toMatchObject([
            { startedOn: '2025-03-01', endedOn: '2025-03-20', outcome: 'finished', rating: 5 }
        ]);
        expect((await entry(e.id)).status).toBe('finished');
    });

    it('can start a game already paused, or log it abandoned with no dates', async () => {
        const { add, act, history } = await setup();
        const a = await add(1);
        const paused = await act(a.id, 'start', { date: '2025-03-01', paused: true });
        expect(paused.entry).toMatchObject({
            status: 'paused',
            openPlaythrough: { startedOn: '2025-03-01' }
        });
        expect((await act(a.id, 'resume')).entry.status).toBe('playing');

        const b = await add(2);
        const logged = await act(b.id, 'playthroughs', { outcome: 'abandoned' });
        expect(logged.entry.status).toBe('abandoned');
        expect(await history(b.id)).toMatchObject([
            { startedOn: null, endedOn: null, outcome: 'abandoned' }
        ]);
    });

    it('defaults dates to today and the platform to the only one owned', async () => {
        const { add, act } = await setup();
        const e = await add(1);
        const today = new Date().toISOString().slice(0, 10);
        const started = await act(e.id, 'start');
        expect(started.entry.openPlaythrough).toMatchObject({
            startedOn: today,
            platform: { id: PC.id }
        });
        const done = await act(e.id, 'abandon');
        expect(done.entry).toMatchObject({ status: 'abandoned', lastFinishedOn: null });
        expect(done.entry.rating).toBeNull();
    });

    it('requires a platform when several are owned, and it must be owned', async () => {
        const { add, act } = await setup();
        const e = await add(1, [PC.id, PS5.id]);
        expect((await act(e.id, 'start')).status).toBe(400);
        expect((await act(e.id, 'start', { platformId: 99 })).status).toBe(400);
        const ok = await act(e.id, 'start', { platformId: PS5.id });
        expect(ok.entry.openPlaythrough.platform.id).toBe(PS5.id);
    });

    it('rejects every transition the state machine forbids', async () => {
        const { add, act } = await setup();
        const e = await add(1);
        for (const a of ['pause', 'resume', 'finish', 'abandon']) {
            expect((await act(e.id, a)).status, `unplayed/${a}`).toBe(409);
        }
        await act(e.id, 'start');
        expect((await act(e.id, 'start')).status).toBe(409);
        expect((await act(e.id, 'resume')).status).toBe(409);
        await act(e.id, 'pause');
        expect((await act(e.id, 'pause')).status).toBe(409);
        expect((await act(e.id, 'start')).status).toBe(409);
        await act(e.id, 'finish');
        for (const a of ['pause', 'resume', 'finish', 'abandon']) {
            expect((await act(e.id, a)).status, `finished/${a}`).toBe(409);
        }
    });

    it('can finish or abandon straight from paused', async () => {
        const { add, act } = await setup();
        const a = await add(1);
        await act(a.id, 'start');
        await act(a.id, 'pause');
        expect((await act(a.id, 'finish')).entry.status).toBe('finished');
        const b = await add(2);
        await act(b.id, 'start');
        await act(b.id, 'pause');
        expect((await act(b.id, 'abandon')).entry.status).toBe('abandoned');
    });

    it('validates dates and ratings', async () => {
        const { add, act } = await setup();
        const e = await add(1);
        expect((await act(e.id, 'start', { date: '2025-02-30' })).status).toBe(400);
        expect((await act(e.id, 'start', { date: '2999-01-01' })).status).toBe(400);
        await act(e.id, 'start', { date: '2025-05-10' });
        expect((await act(e.id, 'finish', { date: '2025-05-09' })).status).toBe(400);
        expect((await act(e.id, 'finish', { rating: 6 })).status).toBe(400);
        expect((await act(e.id, 'finish', { rating: 0 })).status).toBe(400);
        expect((await act(e.id, 'finish', { date: '2025-05-10', rating: 4 })).status).toBe(200);
    });
});

describe('play time', () => {
    it('is optional on finish, can be logged, edited and cleared, and is validated', async () => {
        const { add, act, call, history } = await setup();
        const a = await add(1);
        await act(a.id, 'start', { date: '2025-03-01' });
        await act(a.id, 'finish', { date: '2025-03-20', playtimeMinutes: 750 });
        expect(await history(a.id)).toMatchObject([{ outcome: 'finished', playtimeMinutes: 750 }]);

        const b = await add(2);
        await act(b.id, 'start');
        await act(b.id, 'finish');
        expect(await history(b.id)).toMatchObject([{ playtimeMinutes: null }]);

        const logged = await act(b.id, 'playthroughs', {
            outcome: 'finished',
            playtimeMinutes: 90
        });
        expect(logged.status).toBe(201);
        const [first] = await history(a.id);
        const patched = await call(`/playthroughs/${first.id}`, 'PATCH', { playtimeMinutes: 800 });
        expect(patched.status).toBe(200);
        expect(await history(a.id)).toMatchObject([{ playtimeMinutes: 800 }]);
        await call(`/playthroughs/${first.id}`, 'PATCH', { playtimeMinutes: null });
        expect(await history(a.id)).toMatchObject([{ playtimeMinutes: null }]);

        const c = await add(3);
        await act(c.id, 'start');
        for (const playtimeMinutes of [0, -5, 1.5, 9_999_999])
            expect((await act(c.id, 'finish', { playtimeMinutes })).status).toBe(400);
    });
});

describe('rating pre-fill', () => {
    it("fills an empty entry rating but never overwrites one you've set", async () => {
        const { add, act, call } = await setup();
        const a = await add(1);
        await act(a.id, 'start');
        expect((await act(a.id, 'finish', { rating: 3 })).entry.rating).toBe(3);

        const b = await add(2);
        await call(`/entries/${b.id}`, 'PATCH', { rating: 4 });
        await act(b.id, 'start');
        const done = await act(b.id, 'finish', { rating: 5 });
        expect(done.entry.rating).toBe(4);
    });

    it('does not set an entry rating when the finish is unrated', async () => {
        const { add, act } = await setup();
        const a = await add(1);
        await act(a.id, 'start');
        expect((await act(a.id, 'finish')).entry.rating).toBeNull();
    });
});

describe('replays', () => {
    it('allows many playthroughs, newest first, one open at a time', async () => {
        const { add, act, history } = await setup();
        const e = await add(1);
        await act(e.id, 'start', { date: '2023-01-01' });
        await act(e.id, 'finish', { date: '2023-02-01', rating: 4 });
        const replay = await act(e.id, 'start', { date: '2025-01-01' });
        expect(replay.entry).toMatchObject({ status: 'playing', playthroughCount: 2 });
        expect(replay.entry.lastFinishedOn).toBe('2023-02-01');

        const h = await history(e.id);
        expect(h.map((p: { startedOn: string }) => p.startedOn)).toEqual([
            '2025-01-01',
            '2023-01-01'
        ]);
        expect(h[0].outcome).toBeNull();

        await act(e.id, 'abandon', { date: '2025-01-05' });
        expect((await history(e.id)).map((p: { outcome: string }) => p.outcome)).toEqual([
            'abandoned',
            'finished'
        ]);
    });

    it('is enforced by the database: only one open playthrough per entry', async () => {
        const { add, act, db } = await setup();
        const e = await add(1);
        await act(e.id, 'start');
        const row = db.select().from(playthroughs).get()!;
        expect(() =>
            db
                .insert(playthroughs)
                .values({ userId: row.userId, entryId: row.entryId, platformId: row.platformId })
                .run()
        ).toThrow(/UNIQUE/);
    });
});

describe('logging past playthroughs', () => {
    it('records history for an unplayed game and moves its status', async () => {
        const { add, call, entry } = await setup();
        const e = await add(1);
        const res = await call(`/entries/${e.id}/playthroughs`, 'POST', {
            outcome: 'finished',
            startedOn: '2019-06-01',
            endedOn: '2019-07-01',
            rating: 5
        });
        expect(res.status).toBe(201);
        expect((await res.json()).entry).toMatchObject({
            status: 'finished',
            rating: 5,
            lastFinishedOn: '2019-07-01',
            playthroughCount: 1
        });
        expect((await entry(e.id)).status).toBe('finished');
    });

    it('accepts unknown dates', async () => {
        const { add, call, history } = await setup();
        const e = await add(1);
        await call(`/entries/${e.id}/playthroughs`, 'POST', { outcome: 'finished' });
        expect(await history(e.id)).toMatchObject([
            { startedOn: null, endedOn: null, outcome: 'finished' }
        ]);
    });

    it('leaves a game you are playing now as playing', async () => {
        const { add, act, call, entry } = await setup();
        const e = await add(1);
        await act(e.id, 'start', { date: '2025-01-01' });
        await act(e.id, 'pause');
        await call(`/entries/${e.id}/playthroughs`, 'POST', {
            outcome: 'finished',
            startedOn: '2015-01-01',
            endedOn: '2015-02-01'
        });
        expect((await entry(e.id)).status).toBe('paused');
    });

    it('lets the latest ended playthrough decide the status', async () => {
        const { add, call, entry } = await setup();
        const e = await add(1);
        const log = (body: object) => call(`/entries/${e.id}/playthroughs`, 'POST', body);
        await log({ outcome: 'finished', startedOn: '2020-01-01', endedOn: '2020-02-01' });
        await log({ outcome: 'abandoned', startedOn: '2022-01-01', endedOn: '2022-01-09' });
        expect((await entry(e.id)).status).toBe('abandoned');
        // a log entry for an older playthrough doesn't override the more recent one
        await log({ outcome: 'finished', startedOn: '2010-01-01', endedOn: '2010-02-01' });
        expect((await entry(e.id)).status).toBe('abandoned');
    });

    it('requires a platform when several are owned, and rejects bad input', async () => {
        const { add, call } = await setup();
        const e = await add(1, [PC.id, PS5.id]);
        const log = (body: object) => call(`/entries/${e.id}/playthroughs`, 'POST', body);
        expect((await log({ outcome: 'finished' })).status).toBe(400);
        expect((await log({ outcome: 'finished', platformId: PS5.id })).status).toBe(201);
        expect((await log({ outcome: 'nope', platformId: PS5.id })).status).toBe(400);
        expect(
            (
                await log({
                    outcome: 'finished',
                    platformId: PS5.id,
                    startedOn: '2020-02-01',
                    endedOn: '2020-01-01'
                })
            ).status
        ).toBe(400);
    });
});

describe('editing and deleting playthroughs', () => {
    async function finishedOnce() {
        const s = await setup();
        const e = await s.add(1);
        await s.act(e.id, 'start', { date: '2024-01-01' });
        await s.act(e.id, 'finish', { date: '2024-02-01', rating: 3 });
        const [p] = await s.history(e.id);
        return { ...s, e, p };
    }

    it('edits dates, rating and outcome of a closed playthrough, and status follows', async () => {
        const { call, e, p } = await finishedOnce();
        const res = await call(`/playthroughs/${p.id}`, 'PATCH', {
            startedOn: '2023-12-20',
            endedOn: '2024-02-10',
            rating: 4,
            outcome: 'abandoned'
        });
        expect(res.status).toBe(200);
        const { entry } = await res.json();
        expect(entry).toMatchObject({ id: e.id, status: 'abandoned', lastFinishedOn: null });
    });

    it('validates edits against the merged record', async () => {
        const { call, p } = await finishedOnce();
        expect(
            (await call(`/playthroughs/${p.id}`, 'PATCH', { endedOn: '2023-01-01' })).status
        ).toBe(400);
        expect((await call(`/playthroughs/${p.id}`, 'PATCH', { rating: 6 })).status).toBe(400);
        expect((await call(`/playthroughs/${p.id}`, 'PATCH', {})).status).toBe(400);
        expect((await call(`/playthroughs/${p.id}`, 'PATCH', { platformId: 99999 })).status).toBe(
            400
        );
        expect((await call(`/playthroughs/${p.id}`, 'PATCH', { endedOn: null })).status).toBe(200);
    });

    it('cannot close an open playthrough by editing it', async () => {
        const { add, act, call, history } = await setup();
        const e = await add(1);
        await act(e.id, 'start', { date: '2025-01-01' });
        const [open] = await history(e.id);
        expect(
            (await call(`/playthroughs/${open.id}`, 'PATCH', { outcome: 'finished' })).status
        ).toBe(409);
        expect(
            (await call(`/playthroughs/${open.id}`, 'PATCH', { endedOn: '2025-02-01' })).status
        ).toBe(409);
        const ok = await call(`/playthroughs/${open.id}`, 'PATCH', { startedOn: '2024-12-25' });
        expect(ok.status).toBe(200);
        expect((await ok.json()).entry.openPlaythrough.startedOn).toBe('2024-12-25');
    });

    it('deleting the last playthrough returns the game to unplayed', async () => {
        const { call, p } = await finishedOnce();
        const res = await call(`/playthroughs/${p.id}`, 'DELETE');
        expect((await res.json()).entry).toMatchObject({ status: 'unplayed', playthroughCount: 0 });
    });

    it('deleting an open replay falls back to the previous result', async () => {
        const { act, call, e, history } = await finishedOnce();
        await act(e.id, 'start', { date: '2025-06-01' });
        const [open] = await history(e.id);
        const res = await call(`/playthroughs/${open.id}`, 'DELETE');
        expect((await res.json()).entry).toMatchObject({
            status: 'finished',
            openPlaythrough: null
        });
    });
});

describe('isolation and cleanup', () => {
    it("hides other users' entries and playthroughs", async () => {
        const { add, act, history, app } = await setup();
        const e = await add(1);
        await act(e.id, 'start');
        const [p] = await history(e.id);
        const other = cookieFrom(
            await app.request(
                '/api/auth/register',
                json({
                    username: 'user_two',
                    email: 'two@example.com',
                    password: 'another long pass'
                })
            )
        );
        const headers = {
            cookie: other,
            origin: 'http://localhost',
            'content-type': 'application/json'
        };
        for (const [path, method] of [
            [`/api/entries/${e.id}/start`, 'POST'],
            [`/api/entries/${e.id}/pause`, 'POST'],
            [`/api/entries/${e.id}/finish`, 'POST'],
            [`/api/entries/${e.id}/playthroughs`, 'GET'],
            [`/api/playthroughs/${p.id}`, 'DELETE']
        ] as const) {
            expect((await app.request(path, { method, headers })).status, `${method} ${path}`).toBe(
                404
            );
        }
        expect(
            (
                await app.request(`/api/playthroughs/${p.id}`, {
                    method: 'PATCH',
                    headers,
                    body: '{"rating":1}'
                })
            ).status
        ).toBe(404);
    });

    it('requires authentication', async () => {
        const { app } = await setup();
        const res = await app.request('/api/entries/1/start', {
            method: 'POST',
            headers: { origin: 'http://localhost' }
        });
        expect(res.status).toBe(401);
    });

    it('removes playthroughs when the entry is deleted', async () => {
        const { add, act, call, db } = await setup();
        const e = await add(1);
        await act(e.id, 'start');
        await call(`/entries/${e.id}`, 'DELETE');
        expect(db.select().from(playthroughs).all()).toHaveLength(0);
        expect(db.select().from(entries).where(eq(entries.id, e.id)).all()).toHaveLength(0);
    });
});

describe('collection views reflect status', () => {
    it('drops started games from the backlog and filters by status', async () => {
        const { add, act, call } = await setup();
        const a = await add(1);
        const b = await add(2);
        await add(3);
        await act(a.id, 'start');
        await act(b.id, 'start');
        await act(b.id, 'finish');
        const names = async (q: string) =>
            (
                (await (await call(`/entries${q}`)).json()).entries as { game: { name: string } }[]
            ).map((e) => e.game.name);
        expect(await names('?view=backlog')).toEqual(['Hollow Knight']);
        expect(await names('?status=playing')).toEqual(['Hades']);
        expect(await names('?status=finished')).toEqual(['Celeste']);
    });
});
