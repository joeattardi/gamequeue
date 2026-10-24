import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { FailureLimiter } from './auth/rate-limit.js';
import { adminRoutes } from './routes/admin.js';
import { accountRoutes } from './routes/account.js';
import { avatarRoutes } from './routes/avatar.js';
import { authRoutes } from './routes/auth.js';
import { dataRoutes } from './routes/data.js';
import { profileRoutes } from './routes/profile.js';
import { entryRoutes } from './routes/entries.js';
import { igdbRoutes } from './routes/igdb.js';
import { ogRoutes } from './routes/og.js';
import { createCardRenderer, type CardRenderer } from './og/render.js';
import { listRoutes, pickRoutes, queueRoutes, smartListRoutes } from './routes/lists.js';
import { recapRoutes } from './routes/recap.js';
import { statsRoutes } from './routes/stats.js';
import { showcaseRoutes } from './routes/showcase.js';
import { seriesRoutes } from './routes/series.js';
import { slotRoutes } from './routes/slots.js';
import { wishlistRoutes } from './routes/wishlist.js';
import { entryActionRoutes, playthroughRoutes } from './routes/playthroughs.js';
import { HttpError } from './errors.js';
import type { IgdbClient } from './igdb/types.js';
import type { ItadClient } from './itad/types.js';
import type { AuthVars } from './auth/middleware.js';
import { reportError } from './services/error-log.js';
import { createNotifier, type Notify } from './services/notify.js';

export interface AppDeps {
    db: Db;
    config: Config;
    /** Undefined when IGDB credentials aren't configured; IGDB-backed routes then return 503 */
    igdb?: IgdbClient;
    /** Undefined when ITAD_API_KEY isn't set; wishlist prices are then simply absent */
    itad?: ItadClient;
    /** Owner alerts; defaults to Resend email when configured. Overridable for tests */
    notify?: Notify;
    /** Share-card renderer (holds the in-memory card cache); overridable for tests */
    cards?: CardRenderer;
    /** Overridable for tests */
    limiters?: { loginByAccount: FailureLimiter; loginByIp: FailureLimiter };
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function createApp(deps: AppDeps) {
    const { config } = deps;
    const app = new Hono<{ Variables: AuthVars }>();

    const sameOrAllowed = (origin: string, requestUrl: string) =>
        origin === new URL(requestUrl).origin || config.allowedOrigins.includes(origin);

    app.use('/api/*', csrf({ origin: (origin, c) => sameOrAllowed(origin, c.req.url) }));

    // Hono's csrf only inspects form-style content types, so on top of it: any mutation that carries an
    // Origin header must come from an allowed origin, and bodies must be JSON (which forces a CORS preflight).
    app.use('/api/*', async (c, next) => {
        if (MUTATING.has(c.req.method)) {
            const origin = c.req.header('origin');
            if (origin && !sameOrAllowed(origin, c.req.url))
                return c.json({ error: 'Forbidden origin' }, 403);
            const type = c.req.header('content-type');
            // No content-type means no body; anything else must be JSON.
            if (type && !type.toLowerCase().startsWith('application/json')) {
                return c.json({ error: 'Content-Type must be application/json' }, 415);
            }
        }
        await next();
    });

    app.get('/api/health', (c) => c.json({ ok: true }));
    const limiters = deps.limiters ?? {
        loginByAccount: new FailureLimiter(5, 15 * 60_000),
        loginByIp: new FailureLimiter(30, 15 * 60_000)
    };
    app.route(
        '/api/auth',
        authRoutes({
            ...deps,
            limiters,
            notify:
                deps.notify ??
                createNotifier(config, fetch, (e) => reportError(deps.db, 'email_failed', e))
        })
    );

    app.route('/api/account', accountRoutes({ ...deps, limiters }));
    app.route('/api/admin', adminRoutes(deps));
    app.route('/api/avatar', avatarRoutes(deps));
    app.route('/api/igdb', igdbRoutes(deps));
    app.route('/api/entries', entryRoutes(deps));
    app.route('/api/entries', entryActionRoutes(deps));
    app.route('/api/playthroughs', playthroughRoutes(deps));
    app.route('/api/slots', slotRoutes(deps));
    app.route('/api/lists', listRoutes(deps));
    app.route('/api/smart-lists', smartListRoutes(deps));
    app.route('/api/queue', queueRoutes(deps));
    app.route('/api/wishlist', wishlistRoutes(deps));
    app.route('/api/series', seriesRoutes(deps));
    app.route('/api/stats', statsRoutes(deps));
    app.route('/api/recap', recapRoutes(deps));
    app.route('/api/pick', pickRoutes(deps));
    app.route('/api/data', dataRoutes(deps));
    // Public: no login required
    app.route('/api/profiles', profileRoutes(deps));
    app.route('/api/showcase', showcaseRoutes(deps));
    app.route('/api/og', ogRoutes({ ...deps, cards: deps.cards ?? createCardRenderer() }));

    app.notFound((c) => c.json({ error: 'Not found' }, 404));
    app.onError((err, c) => {
        if (err instanceof HTTPException) return err.getResponse();
        if (err instanceof HttpError)
            return c.json({ error: err.message, ...err.extra }, err.status);
        reportError(deps.db, 'server_500', err, {
            status: 500,
            route: `${c.req.method} ${c.req.path}`
        });
        return c.json({ error: 'Internal server error' }, 500);
    });
    return app;
}
