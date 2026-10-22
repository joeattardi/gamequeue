import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db/client.js';
import { createNotifier } from '../src/services/notify.js';
import { json, register } from './helpers.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createNotifier', () => {
    const config = loadConfig({ RESEND_API_KEY: 're_key', NOTIFY_EMAIL: 'me@example.com' });

    it('posts to Resend with the key and recipient', async () => {
        const fetchFake = vi.fn(async () => new Response('{}', { status: 200 }));
        createNotifier(config, fetchFake as unknown as typeof fetch)('Subject', 'Body');
        await flush();
        const [url, init] = fetchFake.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('https://api.resend.com/emails');
        expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_key');
        expect(JSON.parse(init.body as string)).toMatchObject({
            to: ['me@example.com'],
            subject: 'Subject',
            text: 'Body'
        });
    });

    it('does nothing when not configured', async () => {
        const fetchFake = vi.fn();
        createNotifier(loadConfig({}), fetchFake as unknown as typeof fetch)('s', 'b');
        await flush();
        expect(fetchFake).not.toHaveBeenCalled();
    });

    it('swallows failures', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const failing = vi.fn(async () => {
            throw new Error('network down');
        });
        expect(() =>
            createNotifier(config, failing as unknown as typeof fetch)('s', 'b')
        ).not.toThrow();
        await flush();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});

describe('signup notification', () => {
    const setup = () => {
        const notify = vi.fn();
        const app = createApp({ db: openDb(':memory:'), config: loadConfig({}), notify });
        return { app, notify };
    };

    it('notifies with the username only', async () => {
        const { app, notify } = setup();
        const res = await register(app, 'new@example.com', 'correct horse battery', 'newbie');
        expect(res.status).toBe(201);
        expect(notify).toHaveBeenCalledTimes(1);
        const [subject, text] = notify.mock.calls[0]!;
        expect(subject).toBe('New GameQueue signup');
        expect(text).toContain('newbie');
        expect(text).not.toContain('new@example.com');
    });

    it('does not notify for a failed signup', async () => {
        const { app, notify } = setup();
        await register(app, 'a@example.com', 'correct horse battery', 'dupe');
        notify.mockClear();
        const res = await app.request(
            '/api/auth/register',
            json({ username: 'dupe', email: 'b@example.com', password: 'correct horse battery' })
        );
        expect(res.status).toBe(409);
        expect(notify).not.toHaveBeenCalled();
    });
});
