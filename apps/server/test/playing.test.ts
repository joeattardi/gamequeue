import { describe, expect, it } from 'vitest';
import { PC, setupApi } from './api.js';

async function setup() {
    const s = await setupApi();
    const act = (id: number, action: string, body: unknown = {}) =>
        s.call(`/entries/${id}/${action}`, 'POST', body);
    const byStatus = async (status: string) =>
        ((await s.call(`/entries?status=${status}`)).entries as { game: { name: string } }[])
            .map((e) => e.game.name)
            .sort();
    const queued = async () =>
        ((await s.call('/queue')).list.entries as { game: { name: string } }[]).map(
            (e) => e.game.name
        );
    return { ...s, act, byStatus, queued };
}

describe('playing without slots', () => {
    it('starts several games in a row, with no cap and nothing to confirm', async () => {
        const { add, act, byStatus } = await setup();
        for (const id of [1, 2, 3, 4]) {
            const e = await add(id);
            expect((await act(e.id, 'start')).entry).toMatchObject({ status: 'playing' });
        }
        expect(await byStatus('playing')).toEqual([
            'Celeste',
            'Hades',
            'Hollow Knight',
            'Outer Wilds'
        ]);
    });

    it('moves a paused game to the paused list and drops finished or abandoned ones', async () => {
        const { add, act, byStatus } = await setup();
        const [a, b, c] = [await add(1), await add(2), await add(3)];
        for (const e of [a, b, c]) await act(e.id, 'start');
        await act(a.id, 'pause');
        await act(b.id, 'finish');
        await act(c.id, 'abandon');
        expect(await byStatus('playing')).toEqual([]);
        expect(await byStatus('paused')).toEqual(['Hades']);
        await act(a.id, 'resume');
        expect(await byStatus('playing')).toEqual(['Hades']);
    });

    it('starting a queued game opens a playthrough, sets playing and dequeues it', async () => {
        const { add, act, queued, call } = await setup();
        const e = await add(1);
        await call('/queue/items', 'POST', { entryId: e.id });
        expect(await queued()).toEqual(['Hades']);
        const started = (await act(e.id, 'start')).entry;
        expect(started).toMatchObject({ status: 'playing', openPlaythrough: { outcome: null } });
        expect(await queued()).toEqual([]);
    });

    it('starting the random pick result does the same', async () => {
        const { add, act, queued, call } = await setup();
        const e = await add(1);
        await call('/queue/items', 'POST', { entryId: e.id });
        const picked = (await call('/pick', 'POST', { source: { type: 'backlog' }, filters: {} }))
            .entry;
        expect(picked.id).toBe(e.id);
        expect((await act(picked.id, 'start')).entry.status).toBe('playing');
        expect(await queued()).toEqual([]);
    });

    it('adding a game as playing opens a playthrough and starts it', async () => {
        const { call, byStatus, queued } = await setup();
        const res = await call('/entries', 'POST', {
            igdbId: 1,
            platformIds: [PC.id],
            status: 'playing',
            date: '2025-03-01'
        });
        expect(res.entry).toMatchObject({
            status: 'playing',
            openPlaythrough: { startedOn: '2025-03-01', outcome: null }
        });
        expect(await byStatus('playing')).toEqual(['Hades']);
        expect(await queued()).toEqual([]);
        const feed = (await call('/profiles/user_me/activity')).activity.events.map(
            (e: { type: string }) => e.type
        );
        expect(feed).toEqual(['started', 'added']);
    });

    it('says "not started" for an unplayed game in errors', async () => {
        const { add, act } = await setup();
        const e = await add(1);
        const res = await act(e.id, 'pause');
        expect(res.status).toBe(409);
        expect(res.error).toBe("Can't pause a game that is not started");
    });

    it('has no slot endpoints', async () => {
        const { call } = await setup();
        expect((await call('/slots')).status).toBe(404);
        expect((await call('/entries/candidates')).status).toBe(404);
    });
});
