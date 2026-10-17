import { describe, expect, it } from 'vitest';
import { seededRng } from '@gamequeue/shared';
import { pick } from '../src/services/pick.js';
import { PS5, SWITCH, setupApi } from './api.js';

async function setup() {
    const s = await setupApi();
    const post = (body: object) => s.call('/pick', 'POST', body);
    // Hades (PC+PS5 owned), Celeste (Switch, 480 min), Hollow Knight (PC), Outer Wilds (PC, no ttb)
    const hades = await s.add(1, [6, PS5.id], ['roguelike']);
    const celeste = await s.add(2, [SWITCH.id], ['cozy', 'platformer']);
    const knight = await s.add(3, [6], ['metroidvania']);
    const wilds = await s.add(4, [6], ['cozy']);
    return { ...s, post, hades, celeste, knight, wilds };
}

describe('POST /pick', () => {
    it('picks from the backlog only, with the full entry attached', async () => {
        const { post, call, hades, celeste, knight, wilds } = await setup();
        await call(`/entries/${hades.id}/start`, 'POST', { platformId: 6 });
        await call(`/entries/${celeste.id}/start`, 'POST', {});
        await call(`/entries/${celeste.id}/finish`, 'POST', {});
        const seen = new Set<number>();
        for (let i = 0; i < 40; i++) {
            const res = await post({ source: { type: 'backlog' } });
            expect(res.status).toBe(200);
            expect(res.candidateCount).toBe(2);
            expect(res.entry.game.name).toBeTruthy();
            seen.add(res.entry.id);
        }
        expect([...seen].sort()).toEqual([knight.id, wilds.id].sort());
    });

    it('filters by platform, tag, genre and time to beat', async () => {
        const { post, hades, celeste, knight } = await setup();
        const ids = async (filters: object) => {
            const res = await post({ source: { type: 'backlog' }, filters });
            return res.candidateCount === 0 ? [] : [res.entry.id, res.candidateCount];
        };
        expect(await ids({ platformIds: [SWITCH.id] })).toEqual([celeste.id, 1]);
        expect(await ids({ tags: ['ROGUELIKE'] })).toEqual([hades.id, 1]);
        expect(await ids({ tags: ['metroidvania'], platformIds: [6] })).toEqual([knight.id, 1]);
        expect(await ids({ tags: ['metroidvania'], platformIds: [SWITCH.id] })).toEqual([]);
        // every fake game carries the same default genre
        expect((await ids({ genres: ['role-playing (rpg)'] }))[1]).toBe(4);
        expect(await ids({ genres: ['strategy'] })).toEqual([]);
        // Celeste is 480 min; Hades/Knight are 1200; Outer Wilds is unknown and excluded
        expect(await ids({ maxTtbMinutes: 500 })).toEqual([celeste.id, 1]);
        expect(await ids({ maxTtbMinutes: 60 })).toEqual([]);
        expect((await post({ source: { type: 'backlog' }, filters: {} })).candidateCount).toBe(4);
    });

    it('includes paused games only when asked', async () => {
        const { post, call, knight } = await setup();
        await call(`/entries/${knight.id}/start`, 'POST', {});
        await call(`/entries/${knight.id}/pause`, 'POST');
        expect((await post({ source: { type: 'backlog' } })).candidateCount).toBe(3);
        const res = await post({ source: { type: 'backlog' }, filters: { includePaused: true } });
        expect(res.candidateCount).toBe(4);
    });

    it('picks from a list, in any order, ignoring games that are not unplayed', async () => {
        const { post, call, hades, celeste, knight } = await setup();
        const list = (await call('/lists', 'POST', { name: 'Up next' })).list.id;
        for (const e of [hades, celeste, knight])
            await call(`/lists/${list}/items`, 'POST', { entryId: e.id });
        await call(`/entries/${celeste.id}/start`, 'POST', {});
        const res = await post({ source: { type: 'list', listId: list } });
        expect(res.candidateCount).toBe(2);
        expect([hades.id, knight.id]).toContain(res.entry.id);

        expect((await post({ source: { type: 'list', listId: 99999 } })).status).toBe(404);
    });

    it('returns no entry when nothing matches (an empty backlog is not an error)', async () => {
        const { post } = await setup();
        const res = await post({ source: { type: 'backlog' }, filters: { tags: ['nope'] } });
        expect(res).toMatchObject({ status: 200, entry: null, candidateCount: 0, wrapped: false });
    });

    it('re-rolls through everything before repeating, then wraps without repeating the last', async () => {
        const { post } = await setup();
        const shown: number[] = [];
        for (let i = 0; i < 4; i++) {
            const res = await post({ source: { type: 'backlog' }, excludeEntryIds: shown });
            expect(res.wrapped).toBe(false);
            expect(shown).not.toContain(res.entry.id);
            shown.push(res.entry.id);
        }
        const wrapped = await post({ source: { type: 'backlog' }, excludeEntryIds: shown });
        expect(wrapped.wrapped).toBe(true);
        expect(wrapped.entry.id).not.toBe(shown.at(-1));
    });

    it('validates input', async () => {
        const { post } = await setup();
        expect((await post({})).status).toBe(400);
        expect((await post({ source: { type: 'nope' } })).status).toBe(400);
        expect(
            (await post({ source: { type: 'backlog' }, filters: { maxTtbMinutes: -5 } })).status
        ).toBe(400);
    });

    it("never offers another user's games", async () => {
        const { post, secondUser, call } = await setup();
        const other = await secondUser();
        const res = await call('/pick', 'POST', { source: { type: 'backlog' } }, other);
        expect(res).toMatchObject({ entry: null, candidateCount: 0 });
        expect((await post({ source: { type: 'backlog' } })).candidateCount).toBe(4);
    });
});

describe('pick service', () => {
    it('is deterministic for a seeded rng', async () => {
        const { db } = await setup();
        const userId = 1;
        const run = (seed: number) =>
            pick(
                db,
                userId,
                { source: { type: 'backlog' }, filters: {}, excludeEntryIds: [] },
                seededRng(seed)
            ).entry!.id;
        for (const seed of [1, 2, 3, 99]) expect(run(seed)).toBe(run(seed));
        expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(run)).size).toBeGreaterThan(1);
    });
});
