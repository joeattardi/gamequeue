import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { users } from '../src/db/schema.js';
import { makeApp, register } from './helpers.js';

const badgeOf = async (app: ReturnType<typeof makeApp>['app'], username: string) => {
    const body = await (await app.request(`/api/profiles/${username}`)).json();
    return { badge: body.profile.badge, leaked: JSON.stringify(body).includes('@') };
};

describe('profile badges', () => {
    it('gives the founder a founder badge and other admins a staff badge', async () => {
        const { app, db } = makeApp({ founderEmail: 'founder@example.com' });
        await register(app, 'Founder@Example.com', undefined, 'the_founder');
        await register(app, 'admin@example.com', undefined, 'an_admin');
        await register(app, 'plain@example.com', undefined, 'plain_user');
        db.update(users).set({ role: 'admin' }).where(eq(users.username, 'an_admin')).run();

        expect((await badgeOf(app, 'the_founder')).badge).toBe('founder');
        expect((await badgeOf(app, 'an_admin')).badge).toBe('staff');
        expect((await badgeOf(app, 'plain_user')).badge).toBeNull();
    });

    it('prefers founder over staff for a founder who is also an admin', async () => {
        const { app, db } = makeApp({ founderEmail: 'founder@example.com' });
        await register(app, 'founder@example.com', undefined, 'the_founder');
        db.update(users).set({ role: 'admin' }).where(eq(users.username, 'the_founder')).run();
        expect((await badgeOf(app, 'the_founder')).badge).toBe('founder');
    });

    it('never exposes the email, and with no founder configured only admins get a badge', async () => {
        const { app, db } = makeApp();
        await register(app, 'founder@example.com', undefined, 'the_founder');
        expect(await badgeOf(app, 'the_founder')).toEqual({ badge: null, leaked: false });
        db.update(users).set({ role: 'admin' }).where(eq(users.username, 'the_founder')).run();
        expect((await badgeOf(app, 'the_founder')).badge).toBe('staff');
    });
});
