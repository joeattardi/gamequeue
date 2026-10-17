import { describe, expect, it } from 'vitest';
import type { ExportFile } from '@gamequeue/shared';
import { setupApi } from './api.js';

async function setup() {
    const s = await setupApi();
    const names = (list: Record<string, any>) => list.entries.map((e: any) => e.game.name);
    const queue = async () => (await s.call('/queue')).list;
    const enqueue = (entryId: number) => s.call('/queue/items', 'POST', { entryId });
    return { ...s, names, queue, enqueue };
}

describe('queue', () => {
    it('exists from the start, empty, and is not one of your lists', async () => {
        const { call, queue } = await setup();
        expect(await queue()).toMatchObject({ kind: 'queue', entries: [] });
        expect((await call('/lists')).lists).toEqual([]);
        // asking twice gives the same one
        expect((await queue()).id).toBe((await call('/queue')).list.id);
    });

    it('keeps games in order, takes any status, and ignores duplicates', async () => {
        const { add, enqueue, queue, names, call } = await setup();
        const act = (id: number, action: string, body?: unknown) =>
            call(`/entries/${id}/${action}`, 'POST', body);
        const [a, b, c] = [await add(1), await add(2), await add(3)];
        await act(b.id, 'start', { date: '2025-01-01' });
        await act(c.id, 'start', { date: '2025-01-01' });
        await act(c.id, 'finish', { date: '2025-01-02' });

        for (const e of [c, a, b]) expect((await enqueue(e.id)).status).toBe(200);
        expect((await enqueue(a.id)).list.entries).toHaveLength(3);
        expect(names(await queue())).toEqual(['Hollow Knight', 'Hades', 'Celeste']);
        expect((await call(`/entries/${a.id}`)).entry).toMatchObject({ queued: true, lists: [] });
    });

    it('reorders and removes', async () => {
        const { add, enqueue, queue, names, call } = await setup();
        const [a, b, c] = [await add(1), await add(2), await add(3)];
        for (const e of [a, b, c]) await enqueue(e.id);

        const res = await call('/queue/order', 'PUT', { entryIds: [c.id, a.id, b.id] });
        expect(names(res.list)).toEqual(['Hollow Knight', 'Hades', 'Celeste']);
        expect((await call('/queue/order', 'PUT', { entryIds: [a.id] })).status).toBe(400);

        const removed = await call(`/queue/items/${a.id}`, 'DELETE');
        expect(names(removed.list)).toEqual(['Hollow Knight', 'Celeste']);
        expect((await call(`/entries/${a.id}`)).entry.queued).toBe(false);
        expect(names(await queue())).toEqual(['Hollow Knight', 'Celeste']);
    });

    it('cannot be renamed or deleted, and is private to you', async () => {
        const { call, add, enqueue, queue, secondUser } = await setup();
        const e = await add(1);
        await enqueue(e.id);
        const { id } = await queue();
        expect((await call(`/lists/${id}`, 'PATCH', { name: 'x' })).status).toBe(400);
        expect((await call(`/lists/${id}`, 'DELETE')).status).toBe(400);

        const other = await secondUser();
        expect((await call('/queue', 'GET', undefined, other)).list.entries).toEqual([]);
        expect((await call('/queue/items', 'POST', { entryId: e.id }, other)).status).toBe(404);
        expect((await call(`/lists/${id}`, 'GET', undefined, other)).status).toBe(404);
        expect((await queue()).entries).toHaveLength(1);
    });

    it('leaves the queue when the game is started, and closes the gap', async () => {
        const { add, enqueue, queue, names, call } = await setup();
        const [a, b, c] = [await add(1), await add(2), await add(3)];
        for (const e of [a, b, c]) await enqueue(e.id);

        const started = await call(`/entries/${b.id}/start`, 'POST', { date: '2025-01-01' });
        expect(started.entry).toMatchObject({ status: 'playing', queued: false });
        expect(names(await queue())).toEqual(['Hades', 'Hollow Knight']);

        // positions were compacted, so a new game lands at the end
        const d = await add(4);
        await enqueue(d.id);
        expect(names(await queue())).toEqual(['Hades', 'Hollow Knight', 'Outer Wilds']);
    });

    it('leaves the queue when a game is put in a slot, but not when paused or resumed', async () => {
        const { add, enqueue, queue, names, call } = await setup();
        const [a, b] = [await add(1), await add(2)];
        await enqueue(a.id);
        await enqueue(b.id);
        const slot = (await call('/slots')).slots[0];
        await call(`/slots/${slot.id}/entry`, 'PUT', { entryId: a.id, date: '2025-01-01' });
        expect(names(await queue())).toEqual(['Celeste']);

        // queued while playing, then pause/resume leave it alone
        await enqueue(a.id);
        await call(`/entries/${a.id}/pause`, 'POST');
        await call(`/entries/${a.id}/resume`, 'POST');
        expect(names(await queue())).toEqual(['Celeste', 'Hades']);
    });

    it('drops a game from the queue when it leaves the collection', async () => {
        const { add, enqueue, queue, call } = await setup();
        const e = await add(1);
        await enqueue(e.id);
        await call(`/entries/${e.id}`, 'DELETE');
        expect((await queue()).entries).toEqual([]);
    });

    it('can be a random pick source', async () => {
        const { add, enqueue, queue, call } = await setup();
        const e = await add(1);
        await enqueue(e.id);
        const res = await call('/pick', 'POST', {
            source: { type: 'list', listId: (await queue()).id },
            filters: {}
        });
        expect(res.entry.id).toBe(e.id);
    });

    it('round-trips through export and import, merging into an existing queue', async () => {
        const a = await setup();
        const [h, c, k] = [await a.add(1), await a.add(2), await a.add(3)];
        for (const e of [k, h, c]) await a.enqueue(e.id);
        const file = (await a.call('/data/export')) as unknown as ExportFile;
        expect(file.queue).toEqual([3, 1, 2]);
        expect(file.lists).toEqual([]);

        const b = await setup();
        const dry = await b.call('/data/import', 'POST', file);
        expect(dry.report.queue.added).toBe(3);
        expect((await b.queue()).entries).toEqual([]);

        const done = await b.call('/data/import?commit=true', 'POST', file);
        expect(done.report.queue.added).toBe(3);
        expect(b.names(await b.queue())).toEqual(['Hollow Knight', 'Hades', 'Celeste']);

        const again = await b.call('/data/import?commit=true', 'POST', file);
        expect(again.report.queue.added).toBe(0);
        expect(b.names(await b.queue())).toEqual(['Hollow Knight', 'Hades', 'Celeste']);
    });

    it('keeps its own place when your queue already has games, and an old file has no queue', async () => {
        const a = await setup();
        const [h, c] = [await a.add(1), await a.add(2)];
        await a.enqueue(h.id);
        await a.enqueue(c.id);
        const file = (await a.call('/data/export')) as unknown as Record<string, unknown>;

        const b = await setup();
        const w = await b.add(4);
        const celeste = await b.add(2);
        await b.enqueue(w.id);
        await b.enqueue(celeste.id);
        await b.call('/data/import?commit=true', 'POST', file);
        expect(b.names(await b.queue())).toEqual(['Outer Wilds', 'Celeste', 'Hades']);

        delete file.queue;
        const old = await b.call('/data/import?commit=true', 'POST', file);
        expect(old.status).toBe(200);
        expect(old.report.queue.added).toBe(0);
    });
});
