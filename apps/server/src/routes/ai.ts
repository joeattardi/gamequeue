import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { aiChatSchema, aiPickChatSchema, aiSummarizeSchema } from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import type { AiProvider } from '../ai/provider.js';
import { HitLimiter } from '../auth/rate-limit.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';
import { HttpError } from '../errors.js';
import { parseId, validate } from '../http.js';
import { deleteChat, listChats, openChat, recentChats } from '../services/ai-chats.js';
import { pickChat } from '../services/ai-pick.js';
import { aiStatus, chat, prepareChat, summarize } from '../services/ai.js';

/** AI calls one user may make per hour, on top of the per-IP limit in request-limits.ts */
export const AI_CALLS_PER_USER_HOUR = 60;

const body = (c: { req: { json(): Promise<unknown> } }) => c.req.json().catch(() => undefined);

/** The game helper and its summaries: mounted at /api/ai. Nothing here stores conversation text. */
export function aiRoutes(deps: AppDeps, provider: AiProvider | null, perUser?: HitLimiter) {
    const { db, config } = deps;
    const limiter = perUser ?? new HitLimiter(AI_CALLS_PER_USER_HOUR, 3600_000);
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));
    const uid = (c: { get(k: 'user'): { id: number } }) => c.get('user').id;
    const limit = (c: { header(k: string, v: string): void }, userId: number) => {
        const { retryAfter } = limiter.hit(String(userId));
        if (retryAfter > 0) {
            c.header('Retry-After', String(retryAfter));
            throw new HttpError(
                429,
                `Too many AI requests. Try again in ${Math.ceil(retryAfter / 60)} minutes.`
            );
        }
    };

    r.get('/status', (c) => c.json(aiStatus(db, provider, uid(c))));
    // Saved chats: the list for one game, one chat in full, and deleting one. Reading them needs no
    // AI call, so they work even when AI is switched off or the budget is spent.
    // With `entryId`, that game's chats; without, the most recent ones across all games
    r.get('/chats', (c) => {
        const entryId = c.req.query('entryId');
        return c.json({
            chats: entryId ? listChats(db, uid(c), parseId(entryId)) : recentChats(db, uid(c))
        });
    });
    r.get('/chats/:id', (c) => c.json({ chat: openChat(db, uid(c), parseId(c.req.param('id'))) }));
    r.delete('/chats/:id', (c) => {
        deleteChat(db, uid(c), parseId(c.req.param('id')));
        return c.json({ ok: true });
    });
    r.post('/chat', async (c) => {
        const input = validate(aiChatSchema, await body(c));
        limit(c, uid(c));
        return c.json(await chat(db, provider, uid(c), input));
    });
    // The same turn, streamed as server-sent events: `delta` pieces of text as they arrive, then
    // `done` with the whole answer (which wins over the pieces), or `error`. Refusals that need no
    // AI call (validation, limits, budget, another user's game) are plain HTTP errors before it starts.
    r.post('/chat/stream', async (c) => {
        const input = validate(aiChatSchema, await body(c));
        limit(c, uid(c));
        const answer = prepareChat(db, provider, uid(c), input);
        c.header('Cache-Control', 'no-cache, no-transform');
        c.header('X-Accel-Buffering', 'no');
        return streamSSE(c, async (sse) => {
            // Writes are chained so the pieces keep their order and all go out before `done`
            let sent = Promise.resolve();
            const send = (event: string, data: unknown) =>
                (sent = sent.then(() => sse.writeSSE({ event, data: JSON.stringify(data) })));
            try {
                const done = await answer((text) => void send('delta', { text }));
                await send('done', done);
            } catch (err) {
                await send('error', {
                    error:
                        err instanceof HttpError
                            ? err.message
                            : "The AI didn't answer. Try again in a moment."
                });
            }
        });
    });
    // Pick-my-next-game: suggestions from the user's own queue and backlog; nothing is saved or changed
    r.post('/pick', async (c) => {
        const input = validate(aiPickChatSchema, await body(c));
        limit(c, uid(c));
        return c.json(await pickChat(db, provider, uid(c), input));
    });
    r.post('/summarize', async (c) => {
        const input = validate(aiSummarizeSchema, await body(c));
        limit(c, uid(c));
        return c.json({ draft: await summarize(db, provider, uid(c), input) });
    });
    return r;
}
