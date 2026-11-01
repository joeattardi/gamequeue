import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { aiUsage, errorEvents, users } from '../src/db/schema.js';
import { HitLimiter } from '../src/auth/rate-limit.js';
import { NO_SPOILERS } from '../src/services/ai.js';
import { costMicros, PRICES_PER_MTOK } from '../src/services/ai-usage.js';
import { CATALOG } from './api.js';
import { cookieFrom, fakeAi, fakeIgdb, makeApp, register, PC } from './helpers.js';

async function setup(
    opts: { ai?: ReturnType<typeof fakeAi> | null; enabled?: boolean; limiter?: HitLimiter } = {}
) {
    const ai = opts.ai === undefined ? fakeAi() : opts.ai;
    const { app, db, config } = makeApp({}, fakeIgdb(CATALOG).client, undefined, undefined, {
        ai: ai?.provider ?? null,
        ...(opts.limiter ? { aiLimiter: opts.limiter } : {})
    });
    const cookie = cookieFrom(await register(app, 'me@example.com', undefined, 'mine'));
    if (opts.enabled !== false)
        db.update(users).set({ aiEnabled: true }).where(eq(users.username, 'mine')).run();
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
    const hades = (await call('/entries', 'POST', { igdbId: 1, platformIds: [PC.id] })).entry;
    await call(`/entries/${hades.id}/start`, 'POST', { platformId: PC.id });
    const pid = (await call(`/entries/${hades.id}`)).entry.openPlaythrough.id;
    await call(`/playthroughs/${pid}/posts`, 'POST', {
        kind: 'note',
        body: 'Beat the first boss MEG'
    });
    await call(`/playthroughs/${pid}/posts`, 'POST', { kind: 'hours', minutes: 90 });
    await call(`/entries/${hades.id}/notes`, 'POST', { body: 'MY-PRIVATE-NOTE use the bow' });
    const ask = (content: string, extra: Record<string, unknown> = {}) =>
        call('/ai/chat', 'POST', {
            entryId: hades.id,
            messages: [{ role: 'user', content }],
            ...extra
        });
    const admin = async () => {
        const root = cookieFrom(await register(app, 'root@example.com', undefined, 'root'));
        db.update(users).set({ role: 'admin' }).where(eq(users.username, 'root')).run();
        return (path: string, method = 'GET', body?: unknown) =>
            call(`/admin${path}`, method, body, root);
    };
    return { app, db, config, ai, cookie, call, hades, pid, ask, admin };
}

describe('AI availability', () => {
    it('without a provider says it is not configured, and status hides the controls', async () => {
        const { call, ask, db } = await setup({ ai: null });
        expect(await call('/ai/status')).toMatchObject({
            available: false,
            reason: 'not_configured'
        });
        const res = await ask('hello');
        expect(res.status).toBe(503);
        expect(res.error).toMatch(/not configured/);
        expect(db.select().from(aiUsage).all()).toEqual([]);
    });

    it('needs the per-user switch, which an admin flips on the user page', async () => {
        const { call, ask, admin, db } = await setup({ enabled: false });
        expect(await call('/ai/status')).toMatchObject({ available: false, reason: 'not_enabled' });
        expect((await ask('hello')).status).toBe(403);
        expect((await call('/auth/me')).user.aiEnabled).toBe(false);

        const as = await admin();
        const me = db.select().from(users).where(eq(users.username, 'mine')).get()!;
        const current = (await as(`/users/${me.id}`)).user;
        const saved = await as(`/users/${me.id}`, 'PATCH', {
            username: current.username,
            email: current.email,
            role: current.role,
            firstName: '',
            lastName: '',
            showRealName: false,
            steam: '',
            xbox: '',
            playstation: '',
            discord: '',
            aiEnabled: true
        });
        expect(saved.status).toBe(200);
        expect(saved.user.aiEnabled).toBe(true);
        expect(await call('/ai/status')).toMatchObject({ available: true, reason: null });
        expect((await ask('hello')).status).toBe(200);
    });

    it('needs a login', async () => {
        const { app } = await setup();
        expect((await app.request('/api/ai/status')).status).toBe(401);
    });
});

describe('game helper', () => {
    it('answers and records one usage row with no conversation text', async () => {
        const { ask, db, ai } = await setup();
        const res = await ask('How do I beat the second boss?');
        expect(res).toMatchObject({ status: 200, reply: 'Try the left door.' });
        expect(ai!.requests).toHaveLength(1);
        const rows = db.select().from(aiUsage).all();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            feature: 'helper',
            model: 'claude-sonnet-5-5',
            inputTokens: 1000,
            outputTokens: 200,
            costMicros: 1000 * 2 + 200 * 10
        });
        // nothing of the conversation is in the database
        const tables = db.all<{ name: string }>(
            sql`select name from sqlite_master where type = 'table'`
        );
        const dump = JSON.stringify(
            tables.map((t) => db.all(sql.raw(`select * from "${t.name}"`)))
        );
        expect(dump).not.toContain('second boss');
        expect(dump).not.toContain('left door');
    });

    it('builds the prompt from the game, the journal and (by default) the notes, with the no-spoiler rule', async () => {
        const { ask, ai } = await setup();
        await ask('Where next?');
        const { system, messages } = ai!.requests[0]!;
        expect(system).toContain(NO_SPOILERS);
        expect(system).toContain('Game: Hades');
        expect(system).toContain('Hades summary');
        expect(system).toContain('Beat the first boss MEG');
        expect(system).toContain('played 1.5 h');
        expect(system).toContain('MY-PRIVATE-NOTE');
        expect(messages).toEqual([{ role: 'user', content: 'Where next?' }]);

        await ask('Where next?', { includeNotes: false });
        expect(ai!.requests[1]!.system).not.toContain('MY-PRIVATE-NOTE');
        expect(ai!.requests[1]!.system).toContain('Beat the first boss MEG');
    });

    it("never puts another user's data in the prompt, and refuses another user's game", async () => {
        const { app, call, ai, db, hades } = await setup();
        const other = cookieFrom(await register(app, 'two@example.com', undefined, 'two'));
        db.update(users).set({ aiEnabled: true }).where(eq(users.username, 'two')).run();
        const theirs = (await call('/entries', 'POST', { igdbId: 1, platformIds: [PC.id] }, other))
            .entry;
        await call(`/entries/${theirs.id}/start`, 'POST', { platformId: PC.id }, other);
        const tp = (await call(`/entries/${theirs.id}`, 'GET', undefined, other)).entry
            .openPlaythrough.id;
        await call(
            `/playthroughs/${tp}/posts`,
            'POST',
            { kind: 'note', body: 'OTHER-JOURNAL' },
            other
        );
        await call(`/entries/${theirs.id}/notes`, 'POST', { body: 'OTHER-NOTE' }, other);

        await call('/ai/chat', 'POST', {
            entryId: hades.id,
            messages: [{ role: 'user', content: 'hi' }]
        });
        await call(
            '/ai/chat',
            'POST',
            { entryId: theirs.id, messages: [{ role: 'user', content: 'hi' }] },
            other
        );
        expect(ai!.requests[0]!.system).not.toMatch(/OTHER-(JOURNAL|NOTE)/);
        expect(ai!.requests[1]!.system).not.toContain('MY-PRIVATE-NOTE');
        expect(ai!.requests[1]!.system).not.toContain('Beat the first boss MEG');

        // asking about someone else's entry is a 404 and costs nothing
        const stolen = await call('/ai/chat', 'POST', {
            entryId: theirs.id,
            messages: [{ role: 'user', content: 'hi' }]
        });
        expect(stolen.status).toBe(404);
        expect(ai!.requests).toHaveLength(2);
    });

    it('enforces the turn and size caps on the server', async () => {
        const { call, hades, ai } = await setup();
        const chat = (messages: unknown) =>
            call('/ai/chat', 'POST', { entryId: hades.id, messages });
        const turns = (n: number) =>
            Array.from({ length: n }, (_, i) => ({
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: 'x'
            }));
        expect((await chat(turns(21))).status).toBe(400);
        expect((await chat(turns(19))).status).toBe(200);
        expect((await chat([{ role: 'user', content: 'y'.repeat(4001) }])).status).toBe(400);
        const big = turns(7).map((m) => ({ ...m, content: 'z'.repeat(3999) }));
        expect((await chat(big)).status).toBe(400); // 27,993 characters in all
        expect((await chat([{ role: 'assistant', content: 'hi' }])).status).toBe(400);
        expect((await chat(turns(2))).status).toBe(400); // must end with the user
        expect((await chat([])).status).toBe(400);
        expect(ai!.requests).toHaveLength(1);
    });

    it('limits calls per user', async () => {
        const { ask } = await setup({ limiter: new HitLimiter(2, 3600_000) });
        expect((await ask('a')).status).toBe(200);
        expect((await ask('b')).status).toBe(200);
        const third = await ask('c');
        expect(third.status).toBe(429);
        expect(third.error).toMatch(/Too many AI requests/);
    });

    it('logs a provider failure without the conversation or the key', async () => {
        const { ask, db } = await setup({ ai: fakeAi({ fail: true }) });
        const res = await ask('SECRET-QUESTION');
        expect(res.status).toBe(502);
        const events = db.select().from(errorEvents).all();
        expect(events.map((e) => e.kind)).toEqual(['ai_failed']);
        expect(JSON.stringify(events)).not.toContain('SECRET-QUESTION');
        expect(db.select().from(aiUsage).all()).toEqual([]);
    });
});

describe('streamed answers', () => {
    /** The server-sent events of a response, in order */
    const events = async (res: Response) =>
        (await res.text())
            .split('\n\n')
            .filter(Boolean)
            .map((block) => {
                const event = /^event: (.*)$/m.exec(block)?.[1];
                const data = /^data: (.*)$/m.exec(block)?.[1];
                return { event, data: data ? JSON.parse(data) : null };
            });
    const stream = (app: any, cookie: string, body: unknown) =>
        app.request('/api/ai/chat/stream', {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { origin: 'http://localhost', cookie, 'content-type': 'application/json' }
        }) as Promise<Response>;

    it('sends the answer in pieces, then the whole answer, and records one usage row', async () => {
        const { app, cookie, hades, db, ai } = await setup({
            ai: fakeAi({ reply: 'Dash through her lunge.' })
        });
        const res = await stream(app, cookie, {
            entryId: hades.id,
            messages: [{ role: 'user', content: 'Meg?' }]
        });
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/event-stream');
        const got = await events(res);
        const deltas = got.filter((e) => e.event === 'delta').map((e) => e.data.text);
        expect(deltas.length).toBeGreaterThan(1);
        expect(deltas.join('')).toBe('Dash through her lunge.');
        expect(got.at(-1)).toEqual({ event: 'done', data: { reply: 'Dash through her lunge.' } });
        expect(db.select().from(aiUsage).all()).toHaveLength(1);
        expect(ai!.requests[0]!.system).toContain(NO_SPOILERS);
    });

    it('refuses with a plain HTTP error before streaming, and reports a provider failure as an event', async () => {
        const off = await setup({ enabled: false });
        const res = await stream(off.app, off.cookie, {
            entryId: off.hades.id,
            messages: [{ role: 'user', content: 'x' }]
        });
        expect(res.status).toBe(403);
        expect((await res.json()).error).toMatch(/not switched on/);
        expect(
            (await stream(off.app, off.cookie, { entryId: off.hades.id, messages: [] })).status
        ).toBe(400);

        const broken = await setup({ ai: fakeAi({ fail: true }) });
        const failed = await stream(broken.app, broken.cookie, {
            entryId: broken.hades.id,
            messages: [{ role: 'user', content: 'SECRET-QUESTION' }]
        });
        expect(failed.status).toBe(200);
        const got = await events(failed);
        expect(got).toEqual([
            { event: 'error', data: { error: "The AI didn't answer. Try again in a moment." } }
        ]);
        expect(broken.db.select().from(aiUsage).all()).toEqual([]);
        expect(JSON.stringify(broken.db.select().from(errorEvents).all())).not.toContain(
            'SECRET-QUESTION'
        );
    });
});

describe('summarize to notes', () => {
    const convo = [
        { role: 'user', content: 'How do I beat MEG?' },
        { role: 'assistant', content: 'Dash through her attacks.' }
    ];

    it('returns a draft without saving anything, recorded as a summary call', async () => {
        const { call, hades, ai, db } = await setup({
            ai: fakeAi({ reply: '- Dash through attacks' })
        });
        const before = (await call(`/entries/${hades.id}`)).entry.notes.length;
        const res = await call('/ai/summarize', 'POST', { entryId: hades.id, messages: convo });
        expect(res).toMatchObject({ status: 200, draft: '- Dash through attacks' });
        expect(ai!.requests[0]!.messages[0]!.content).toContain('Player: How do I beat MEG?');
        expect(ai!.requests[0]!.messages[0]!.content).toContain(
            'Helper: Dash through her attacks.'
        );
        expect(ai!.requests[0]!.system).toContain(NO_SPOILERS);
        expect((await call(`/entries/${hades.id}`)).entry.notes).toHaveLength(before);
        expect(
            db
                .select()
                .from(aiUsage)
                .all()
                .map((r) => r.feature)
        ).toEqual(['summary']);
        // a conversation with no answer yet has nothing to summarize
        expect(
            (
                await call('/ai/summarize', 'POST', {
                    entryId: hades.id,
                    messages: convo.slice(0, 1)
                })
            ).status
        ).toBe(400);
    });

    it('saves the edited draft to each destination only when asked', async () => {
        const { call, hades, pid, app } = await setup();
        const { draft } = await call('/ai/summarize', 'POST', {
            entryId: hades.id,
            messages: convo
        });
        const edited = `${draft} (edited)`;

        const priv = await call(`/entries/${hades.id}/notes`, 'POST', {
            body: `${edited} private`
        });
        expect(priv.entry.notes.find((n: any) => n.body === `${edited} private`).public).toBe(
            false
        );

        const pub = await call(`/entries/${hades.id}/notes`, 'POST', {
            body: `${edited} public`,
            public: true
        });
        expect(pub.entry.notes.find((n: any) => n.body === `${edited} public`).public).toBe(true);
        const page = await (await app.request('/api/profiles/mine/games/1')).json();
        expect(JSON.stringify(page)).toContain(`${edited} public`);
        expect(JSON.stringify(page)).not.toContain(`${edited} private`);

        const post = await call(`/playthroughs/${pid}/posts`, 'POST', {
            kind: 'note',
            body: `${edited} journal`
        });
        expect(post.post).toMatchObject({ kind: 'note', body: `${edited} journal` });
    });
});

describe('budget and cost', () => {
    it('computes cost from the price table', () => {
        expect(costMicros('claude-sonnet-5-5', 1_000_000, 0)).toBe(2_000_000); // $2
        expect(costMicros('claude-sonnet-5-5', 0, 1_000_000)).toBe(10_000_000); // $10
        expect(costMicros('claude-haiku-5-5', 2000, 1000)).toBe(
            Math.round(2000 * 0.1 + 1000 * 0.5)
        );
        expect(costMicros('claude-opus-5-5', 1000, 1000)).toBe(24_000);
        // an unknown model is charged at the dearest known rate
        const dearest = Math.max(...Object.values(PRICES_PER_MTOK).map((p) => p.output));
        expect(costMicros('mystery-model', 0, 1000)).toBe(dearest * 1000);
    });

    it('warns at 80%, refuses at 100%, and the admin card shows spend, split and recent calls', async () => {
        // each call: 1000 in + 200 out on Sonnet = $0.004
        const { ask, admin, call, hades } = await setup();
        const as = await admin();
        expect(await as('/ai')).toMatchObject({
            configured: true,
            budgetUsd: 5,
            spentUsd: 0,
            warning: false
        });
        expect((await as('/ai/budget', 'PUT', { budgetUsd: 0.01 })).budgetUsd).toBe(0.01);

        await ask('one'); // $0.004 = 40%
        expect((await as('/ai')).warning).toBe(false);
        await call('/ai/summarize', 'POST', {
            entryId: hades.id,
            messages: [
                { role: 'user', content: 'q' },
                { role: 'assistant', content: 'a' }
            ]
        }); // $0.008 = 80%
        const card = await as('/ai');
        expect(card).toMatchObject({ warning: true, exhausted: false, spentUsd: 0.008 });
        expect(card.byFeature).toEqual([
            { feature: 'helper', calls: 1, costUsd: 0.004 },
            { feature: 'summary', calls: 1, costUsd: 0.004 }
        ]);
        expect(card.recent).toHaveLength(2);
        expect(card.recent[0]).toMatchObject({
            username: 'mine',
            feature: 'summary',
            inputTokens: 1000,
            outputTokens: 200
        });

        await ask('three'); // $0.012 = 120%: allowed because it started under budget
        const refused = await ask('four');
        expect(refused.status).toBe(429);
        expect(refused.error).toMatch(/budget is used up/);
        expect(await call('/ai/status')).toMatchObject({
            available: false,
            reason: 'budget_spent'
        });
        expect((await as('/ai')).exhausted).toBe(true);

        // raising the budget takes effect at once
        await as('/ai/budget', 'PUT', { budgetUsd: 1 });
        expect((await ask('five')).status).toBe(200);
        expect((await as('/ai/budget', 'PUT', { budgetUsd: -1 })).status).toBe(400);
    });

    it('counts only the current calendar month (UTC)', async () => {
        const { db, ask, admin } = await setup();
        await ask('now');
        db.insert(aiUsage)
            .values({
                userId: null,
                feature: 'helper',
                model: 'x',
                inputTokens: 1,
                outputTokens: 1,
                costMicros: 9_000_000,
                createdAt: Date.UTC(2000, 0, 15)
            })
            .run();
        const card = await (await admin())('/ai');
        expect(card.spentUsd).toBe(0.004);
        expect(card.month).toBe(new Date().toISOString().slice(0, 7));
    });

    it('is admin only', async () => {
        const { call } = await setup();
        expect((await call('/admin/ai')).status).toBe(403);
        expect((await call('/admin/ai/budget', 'PUT', { budgetUsd: 100 })).status).toBe(403);
    });
});

describe('the API key', () => {
    it('never reaches the browser: not in /auth/me, the admin card or server info', async () => {
        const { app, db } = makeApp(
            { anthropicApiKey: 'sk-ant-SECRET-KEY' },
            undefined,
            undefined,
            undefined,
            {
                ai: fakeAi().provider
            }
        );
        const root = cookieFrom(await register(app, 'root@example.com', undefined, 'root'));
        db.update(users)
            .set({ role: 'admin', aiEnabled: true })
            .where(eq(users.username, 'root'))
            .run();
        for (const path of [
            '/api/auth/me',
            '/api/admin/ai',
            '/api/admin/server',
            '/api/ai/status'
        ]) {
            const text = await (await app.request(path, { headers: { cookie: root } })).text();
            expect(text, path).not.toContain('SECRET-KEY');
        }
        const card = await (
            await app.request('/api/admin/ai', { headers: { cookie: root } })
        ).json();
        expect(card.configured).toBe(true);
    });
});
