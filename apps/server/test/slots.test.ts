import { describe, expect, it } from 'vitest';
import { entries, playthroughs, slots } from '../src/db/schema.js';
import { PC, PS5, setupApi } from './api.js';

async function setup() {
    const s = await setupApi();
    const getSlots = async () => (await s.call('/slots')).slots as Record<string, any>[];
    const assign = (slotId: number, body: object) => s.call(`/slots/${slotId}/entry`, 'PUT', body);
    const history = async (id: number) =>
        (await s.call(`/entries/${id}/playthroughs`)).playthroughs;
    return { ...s, getSlots, assign, history };
}

describe('slot basics', () => {
    it('starts with the three default slots, all empty', async () => {
        const { getSlots } = await setup();
        const slots = await getSlots();
        expect(slots.map((s) => [s.name, s.position, s.entry])).toEqual([
            ['Main', 0, null],
            ['Secondary', 1, null],
            ['Palate cleanser', 2, null]
        ]);
    });

    it('creates, renames, reorders and deletes slots, up to a maximum', async () => {
        const { call, getSlots } = await setup();
        const created = await call('/slots', 'POST', { name: 'Couch co-op' });
        expect(created.status).toBe(201);
        expect(created.slots.at(-1)).toMatchObject({ name: 'Couch co-op', position: 3 });

        const [main, secondary, cleanser, coop] = await getSlots();
        await call(`/slots/${main!.id}`, 'PATCH', { name: 'Big game' });
        expect((await call(`/slots/${main!.id}`, 'PATCH', { name: '  ' })).status).toBe(400);

        const reordered = await call('/slots/order', 'PUT', {
            ids: [coop!.id, cleanser!.id, main!.id, secondary!.id]
        });
        expect(reordered.slots.map((s: { name: string }) => s.name)).toEqual([
            'Couch co-op',
            'Palate cleanser',
            'Big game',
            'Secondary'
        ]);
        expect((await call('/slots/order', 'PUT', { ids: [main!.id] })).status).toBe(400);
        expect(
            (await call('/slots/order', 'PUT', { ids: [main!.id, main!.id, main!.id, main!.id] }))
                .status
        ).toBe(400);

        expect((await call(`/slots/${coop!.id}`, 'DELETE')).slots).toHaveLength(3);
        for (let i = 0; i < 7; i++)
            expect((await call('/slots', 'POST', { name: `S${i}` })).status).toBe(201);
        expect((await call('/slots', 'POST', { name: 'one too many' })).status).toBe(400);
    });
});

describe('assigning games', () => {
    it('starts an unplayed game: playing, open playthrough, slot filled', async () => {
        const { add, assign, getSlots, history, call } = await setup();
        const e = await add(1);
        const [main] = await getSlots();
        const res = await assign(main!.id, { entryId: e.id, date: '2025-04-01' });
        expect(res.status).toBe(200);
        expect(res.slots[0].entry).toMatchObject({
            id: e.id,
            status: 'playing',
            slotId: main!.id,
            openPlaythrough: { startedOn: '2025-04-01', platform: { id: PC.id } }
        });
        expect(await history(e.id)).toHaveLength(1);
        expect((await call(`/entries/${e.id}`)).entry.slotId).toBe(main!.id);
    });

    it('resumes a paused game without opening a second playthrough', async () => {
        const { add, assign, getSlots, history, call } = await setup();
        const e = await add(1);
        await call(`/entries/${e.id}/start`, 'POST', {});
        await call(`/entries/${e.id}/pause`, 'POST');
        const [main] = await getSlots();
        const res = await assign(main!.id, { entryId: e.id });
        expect(res.slots[0].entry.status).toBe('playing');
        expect(await history(e.id)).toHaveLength(1);
    });

    it('slots a game that is already playing without opening another playthrough', async () => {
        const { add, assign, getSlots, history, call } = await setup();
        const e = await add(1);
        await call(`/entries/${e.id}/start`, 'POST', { date: '2025-02-01' });
        const [main] = await getSlots();
        const res = await assign(main!.id, { entryId: e.id });
        expect(res.status).toBe(200);
        expect(res.slots[0].entry).toMatchObject({
            id: e.id,
            status: 'playing',
            openPlaythrough: { startedOn: '2025-02-01' }
        });
        expect(await history(e.id)).toHaveLength(1);
    });

    it('replays a finished game', async () => {
        const { add, assign, getSlots, history, call } = await setup();
        const e = await add(1);
        await call(`/entries/${e.id}/start`, 'POST', {});
        await call(`/entries/${e.id}/finish`, 'POST', {});
        const [main] = await getSlots();
        const res = await assign(main!.id, { entryId: e.id });
        expect(res.slots[0].entry.status).toBe('playing');
        expect(await history(e.id)).toHaveLength(2);
    });

    it('asks before replacing: 409 with the occupant, nothing changes', async () => {
        const { add, assign, getSlots } = await setup();
        const a = await add(1);
        const b = await add(3);
        const [main] = await getSlots();
        await assign(main!.id, { entryId: a.id });

        const res = await assign(main!.id, { entryId: b.id });
        expect(res.status).toBe(409);
        expect(res.occupant).toMatchObject({ id: a.id, status: 'playing' });
        const after = await getSlots();
        expect(after[0]!.entry.id).toBe(a.id);
        expect(after[0]!.entry.status).toBe('playing');
    });

    it('replaces on request: the old game is paused (playthrough kept), the new one plays', async () => {
        const { add, assign, getSlots, call } = await setup();
        const a = await add(1);
        const b = await add(3);
        const [main] = await getSlots();
        await assign(main!.id, { entryId: a.id });
        const res = await assign(main!.id, { entryId: b.id, replace: true });
        expect(res.status).toBe(200);
        expect(res.slots[0].entry).toMatchObject({ id: b.id, status: 'playing' });
        const old = (await call(`/entries/${a.id}`)).entry;
        expect(old).toMatchObject({
            status: 'paused',
            slotId: null,
            openPlaythrough: { outcome: null }
        });
    });

    it('moves a game between slots without restarting it', async () => {
        const { add, assign, getSlots, history } = await setup();
        const e = await add(1);
        const [main, secondary] = await getSlots();
        await assign(main!.id, { entryId: e.id });
        const res = await assign(secondary!.id, { entryId: e.id });
        expect(res.slots[0].entry).toBeNull();
        expect(res.slots[1].entry).toMatchObject({ id: e.id, status: 'playing' });
        expect(await history(e.id)).toHaveLength(1);
    });

    it('moving onto an occupied slot (with replace) pauses the displaced game', async () => {
        const { add, assign, getSlots, call } = await setup();
        const a = await add(1);
        const b = await add(3);
        const [main, secondary] = await getSlots();
        await assign(main!.id, { entryId: a.id });
        await assign(secondary!.id, { entryId: b.id });
        const res = await assign(secondary!.id, { entryId: a.id, replace: true });
        expect(res.slots[0].entry).toBeNull();
        expect(res.slots[1].entry.id).toBe(a.id);
        expect((await call(`/entries/${b.id}`)).entry).toMatchObject({
            status: 'paused',
            slotId: null
        });
    });

    it('treats assigning a game to its own slot as a no-op', async () => {
        const { add, assign, getSlots, history } = await setup();
        const e = await add(1);
        const [main] = await getSlots();
        await assign(main!.id, { entryId: e.id });
        expect((await assign(main!.id, { entryId: e.id })).status).toBe(200);
        expect(await history(e.id)).toHaveLength(1);
    });

    it('needs a platform when several are owned, and rolls everything back without one', async () => {
        const { add, assign, getSlots, call } = await setup();
        const keep = await add(1);
        const multi = await add(3, [PC.id, PS5.id]);
        const [main] = await getSlots();
        await assign(main!.id, { entryId: keep.id });

        const res = await assign(main!.id, { entryId: multi.id, replace: true });
        expect(res.status).toBe(400);
        // the occupant is untouched: still playing, still in the slot
        const slotsNow = await getSlots();
        expect(slotsNow[0]!.entry).toMatchObject({ id: keep.id, status: 'playing' });
        expect((await call(`/entries/${multi.id}`)).entry.status).toBe('unplayed');

        const ok = await assign(main!.id, { entryId: multi.id, replace: true, platformId: PS5.id });
        expect(ok.slots[0].entry.openPlaythrough.platform.id).toBe(PS5.id);
    });

    it('rejects unknown and foreign slots and entries', async () => {
        const { add, assign, getSlots, secondUser, call } = await setup();
        const e = await add(1);
        const [main] = await getSlots();
        expect((await assign(99999, { entryId: e.id })).status).toBe(404);
        expect((await assign(main!.id, { entryId: 99999 })).status).toBe(404);
        const other = await secondUser();
        expect(
            (await call(`/slots/${main!.id}/entry`, 'PUT', { entryId: e.id }, other)).status
        ).toBe(404);
        expect((await call(`/slots/${main!.id}`, 'DELETE', undefined, other)).status).toBe(404);
        expect((await call('/slots', 'GET', undefined, other)).slots).toHaveLength(3);
    });
});

describe('keeping slots and status consistent', () => {
    async function playing() {
        const s = await setup();
        const e = await s.add(1);
        const [main] = await s.getSlots();
        await s.assign(main!.id, { entryId: e.id });
        return { ...s, e, main: main! };
    }

    it('finishing or abandoning empties the slot', async () => {
        const { call, e, getSlots } = await playing();
        await call(`/entries/${e.id}/finish`, 'POST', { rating: 4 });
        expect((await getSlots())[0]!.entry).toBeNull();

        const s = await playing();
        await s.call(`/entries/${s.e.id}/abandon`, 'POST', {});
        expect((await s.getSlots())[0]!.entry).toBeNull();
    });

    it('pausing keeps the game in its slot', async () => {
        const { call, e, getSlots } = await playing();
        await call(`/entries/${e.id}/pause`, 'POST');
        expect((await getSlots())[0]!.entry).toMatchObject({ id: e.id, status: 'paused' });
    });

    it('deleting the playthrough that put a game in a slot empties the slot', async () => {
        const { call, e, getSlots, history } = await playing();
        const [p] = await history(e.id);
        await call(`/playthroughs/${p.id}`, 'DELETE');
        expect((await getSlots())[0]!.entry).toBeNull();
        expect((await call(`/entries/${e.id}`)).entry.status).toBe('unplayed');
    });

    it('removing a collection entry empties its slot instead of failing', async () => {
        const { call, e, getSlots } = await playing();
        expect((await call(`/entries/${e.id}`, 'DELETE')).status).toBe(200);
        expect((await getSlots())[0]!.entry).toBeNull();
    });

    it('clearing a slot pauses its game', async () => {
        const { call, e, main, getSlots } = await playing();
        const res = await call(`/slots/${main.id}/entry`, 'DELETE');
        expect(res.slots[0].entry).toBeNull();
        expect((await call(`/entries/${e.id}`)).entry).toMatchObject({
            status: 'paused',
            slotId: null
        });
        expect((await getSlots())[0]!.entry).toBeNull();
    });

    it('deleting an occupied slot pauses its game', async () => {
        const { call, e, main } = await playing();
        await call(`/slots/${main.id}`, 'DELETE');
        expect((await call(`/entries/${e.id}`)).entry.status).toBe('paused');
    });
});

describe('database guarantees', () => {
    it('refuses to put one game in two slots', async () => {
        const { add, assign, getSlots, db } = await setup();
        const e = await add(1);
        const [main, secondary] = await getSlots();
        await assign(main!.id, { entryId: e.id });
        const { eq } = await import('drizzle-orm');
        expect(() =>
            db.update(slots).set({ entryId: e.id }).where(eq(slots.id, secondary!.id)).run()
        ).toThrow(/UNIQUE/);
    });

    it('allows many empty slots', async () => {
        const { getSlots } = await setup();
        expect((await getSlots()).every((s) => s.entry === null)).toBe(true);
    });

    it('keeps rows consistent after a failed assignment', async () => {
        const { add, assign, getSlots, db } = await setup();
        const multi = await add(3, [PC.id, PS5.id]);
        const [main] = await getSlots();
        await assign(main!.id, { entryId: multi.id });
        expect(
            db
                .select()
                .from(slots)
                .all()
                .filter((s) => s.entryId !== null)
        ).toHaveLength(0);
        expect(db.select().from(playthroughs).all()).toHaveLength(0);
        expect(db.select().from(entries).get()!.status).toBe('unplayed');
    });
});
