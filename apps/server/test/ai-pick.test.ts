import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { seededRng } from '@gamequeue/shared';
import { aiUsage, users } from '../src/db/schema.js';
import { buildPickContext, PICK_BACKLOG } from '../src/services/ai-pick.js';
import { cookieFrom, fakeAi, fakeGame, fakeIgdb, makeApp, register, PC } from './helpers.js';

const CATALOG = Array.from({ length: 8 }, (_, i) => fakeGame(i + 1, `Game ${i + 1}`));

async function setup(reply: unknown = { message: 'Try these.', suggestions: [] }, enabled = true) {
    const ai = fakeAi({ reply: typeof reply === 'string' ? reply : JSON.stringify(reply) });
    const { app, db } = makeApp({}, fakeIgdb(CATALOG).client, undefined, undefined, {
        ai: ai.provider
    });
    const cookie = cookieFrom(await register(app, 'me@example.com', undefined, 'mine'));
    if (enabled) db.update(users).set({ aiEnabled: true }).where(eq(users.username, 'mine')).run();
    const call = async (path: string, method = 'GET', body?: unknown, who = cookie) => {
        const res = await app.request(`/api${path}`, {
            method,
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            headers: {
                origin: 'http://localhost',
                cookie: who,
                ...(body === undefined ? {} : { 'content-type': 'application/json' })
            }
        });
        return { status: res.status, ...(await res.json()) } as Record<string, any>;
    };
    const add = async (igdbId: number) =>
        (await call('/entries', 'POST', { igdbId, platformIds: [PC.id] })).entry as Record<
            string,
            any
        >;
    // 1, 2 finished (rated); 3 queued; 4, 5 not started; 6 playing
    const e = [] as Record<string, any>[];
    for (let i = 1; i <= 6; i++) e[i] = await add(i);
    for (const i of [1, 2])
        await call(`/entries/${e[i]!.id}/playthroughs`, 'POST', {
            outcome: 'finished',
            rating: i + 2,
            endedOn: `2025-0${i}-01`
        });
    await call('/queue/items', 'POST', { igdbId: 3 });
    await call(`/entries/${e[6]!.id}/start`, 'POST', {});
    const ask = (content: string) =>
        call('/ai/pick', 'POST', { messages: [{ role: 'user', content }] });
    return { app, db, ai, cookie, call, e, ask };
}

describe('pick-my-next-game chat', () => {
    it("sends the user's finished games, queue and backlog, and suggests only from queue and backlog", async () => {
        const s = await setup();
        const { system } = buildPickContext(s.db, 1);
        expect(system).toContain('"name":"Game 1"');
        expect(system).toContain('"rating":4');
        const queue = system.slice(system.indexOf('\n<queue>\n'), system.indexOf('</queue>'));
        const backlog = system.slice(system.indexOf('\n<backlog>\n'), system.indexOf('</backlog>'));
        expect(queue).toContain(`"id":${s.e[3]!.id}`);
        expect(backlog).toContain(`"id":${s.e[4]!.id}`);
        expect(backlog).toContain(`"id":${s.e[5]!.id}`);
        expect(backlog).not.toContain(`"id":${s.e[3]!.id}`); // queued games are listed once
        expect(queue + backlog).not.toContain(`"id":${s.e[6]!.id}`); // playing
        expect(queue + backlog).not.toContain(`"id":${s.e[1]!.id}`); // finished
    });

    it('drops suggestions outside the candidate list, repeats and junk, and records usage', async () => {
        const s0 = await setup();
        const ids = s0.e.map((x) => x?.id);
        const s = await setup({
            message: 'How about these?',
            suggestions: [
                { id: ids[4], reason: 'Short and sweet' },
                { id: ids[1], reason: 'already finished' },
                { id: 99999, reason: 'made up' },
                { id: ids[4], reason: 'again' },
                { id: ids[3], reason: 'On your queue' },
                { id: 'x', reason: 'junk' }
            ]
        });
        const res = await s.ask('Something short?');
        expect(res.status).toBe(200);
        expect(res.message).toBe('How about these?');
        expect(res.suggestions.map((x: any) => [x.entry.game.name, x.reason])).toEqual([
            ['Game 4', 'Short and sweet'],
            ['Game 3', 'On your queue']
        ]);
        expect(s.ai!.requests[0]!.jsonSchema).toBeDefined();
        expect(
            s.db
                .select()
                .from(aiUsage)
                .all()
                .map((r) => r.feature)
        ).toEqual(['pick']);
    });

    it('turns a reply that is not JSON into a plain message', async () => {
        const s = await setup('Tell me how long you have tonight.');
        const res = await s.ask('help');
        expect(res).toMatchObject({
            message: 'Tell me how long you have tonight.',
            suggestions: []
        });
    });

    it("never includes another user's games", async () => {
        const s = await setup();
        const other = cookieFrom(await register(s.app, 'two@example.com', undefined, 'two'));
        await s.call('/entries', 'POST', { igdbId: 7, platformIds: [PC.id] }, other);
        await s.ask('anything');
        expect(s.ai!.requests[0]!.system).not.toContain('Game 7');
    });

    it('samples the backlog when it is large', async () => {
        const many = Array.from({ length: PICK_BACKLOG + 30 }, (_, i) =>
            fakeGame(i + 1, `G${i + 1}`)
        );
        const { app, db } = makeApp({}, fakeIgdb(many).client, undefined, undefined, {
            ai: fakeAi().provider
        });
        const cookie = cookieFrom(await register(app, 'me@example.com', undefined, 'mine'));
        for (let i = 1; i <= many.length; i++)
            await app.request('/api/entries', {
                method: 'POST',
                body: JSON.stringify({ igdbId: i, platformIds: [PC.id] }),
                headers: { origin: 'http://localhost', cookie, 'content-type': 'application/json' }
            });
        const { candidates } = buildPickContext(db, 1, seededRng(3));
        expect(candidates.size).toBe(PICK_BACKLOG);
    });

    it('respects the AI switch and validates the conversation', async () => {
        const off = await setup(undefined, false);
        expect((await off.ask('hi')).status).toBe(403);
        const s = await setup();
        expect((await s.call('/ai/pick', 'POST', { messages: [] })).status).toBe(400);
        expect(
            (await s.call('/ai/pick', 'POST', { messages: [{ role: 'assistant', content: 'hi' }] }))
                .status
        ).toBe(400);
    });
});
