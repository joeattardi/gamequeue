import { Hono } from 'hono';
import { aiChatSchema, aiSummarizeSchema } from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import type { AiProvider } from '../ai/provider.js';
import { HitLimiter } from '../auth/rate-limit.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';
import { HttpError } from '../errors.js';
import { validate } from '../http.js';
import { aiStatus, chat, summarize } from '../services/ai.js';

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
    r.post('/chat', async (c) => {
        const input = validate(aiChatSchema, await body(c));
        limit(c, uid(c));
        return c.json({ reply: await chat(db, provider, uid(c), input) });
    });
    r.post('/summarize', async (c) => {
        const input = validate(aiSummarizeSchema, await body(c));
        limit(c, uid(c));
        return c.json({ draft: await summarize(db, provider, uid(c), input) });
    });
    return r;
}
