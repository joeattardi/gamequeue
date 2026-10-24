import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { activityEvents } from '../src/db/schema.js';
import { PC, setupApi } from './api.js';

const USER = 'user_me';

async function setup() {
    const s = await setupApi();
    const feed = async () =>
        (await (await s.app.request(`/api/profiles/${USER}/activity`)).json()).activity as {
            events: any[];
            total: number;
        };
    /** "type:name" newest first, e.g. "finished:Hades" */
    const lines = async () =>
        (await feed()).events.map((e) => `${e.type}:${e.game?.name ?? e.subject?.name}`);
    return { ...s, feed, lines };
}

describe('activity feed', () => {
    it('records what you do, newest first, and needs no login to read', async () => {
        const { add, call, lines } = await setup();
        const hades = await add(1);
        await call(`/entries/${hades.id}/start`, 'POST', { platformId: PC.id });
        await call(`/entries/${hades.id}/pause`, 'POST', {});
        await call(`/entries/${hades.id}/resume`, 'POST', {});
        await call(`/entries/${hades.id}/finish`, 'POST', { rating: 5 });
        const celeste = await add(2);
        await call(`/entries/${celeste.id}/start`, 'POST', { platformId: PC.id });
        await call(`/entries/${celeste.id}/abandon`, 'POST', {});
        expect(await lines()).toEqual([
            'abandoned:Celeste',
            'started:Celeste',
            'added:Celeste',
            'finished:Hades',
            'resumed:Hades',
            'paused:Hades',
            'started:Hades',
            'added:Hades'
        ]);
    });

    it('records ratings, favorites, queueing, wishlisting and the things you create', async () => {
        const { add, call, lines, feed } = await setup();
        const hades = await add(1);
        await call(`/entries/${hades.id}`, 'PATCH', { rating: 4, favorite: true });
        await call('/queue/items', 'POST', { entryId: hades.id });
        await call('/wishlist/items', 'POST', { igdbId: 2 });
        await call('/lists', 'POST', { name: 'Roguelikes' });
        await call('/grids', 'POST', { title: 'Top 9', cols: 3, rows: 3 });
        await call('/tier-lists', 'POST', { title: 'Platformers' });
        expect(await lines()).toEqual([
            'tier:Platformers',
            'grid:Top 9',
            'list:Roguelikes',
            'wishlisted:Celeste',
            'queued:Hades',
            'favorited:Hades',
            'rated:Hades',
            'added:Hades'
        ]);
        expect((await feed()).events.find((e) => e.type === 'rated').detail).toBe(4);
    });

    it('folds a repeat of the latest event into one', async () => {
        const { add, call, feed } = await setup();
        const hades = await add(1);
        await call(`/entries/${hades.id}`, 'PATCH', { rating: 3 });
        await call(`/entries/${hades.id}`, 'PATCH', { rating: 5 });
        const events = (await feed()).events.filter((e) => e.type === 'rated');
        expect(events).toHaveLength(1);
        expect(events[0].detail).toBe(5);
    });

    it('does not record a no-op queue add or a rating that did not change', async () => {
        const { add, call, feed } = await setup();
        const hades = await add(1);
        await call(`/entries/${hades.id}`, 'PATCH', { rating: 3 });
        await call(`/entries/${hades.id}`, 'PATCH', { rating: 3, tags: ['x'] });
        await call('/queue/items', 'POST', { entryId: hades.id });
        await call('/queue/items', 'POST', { entryId: hades.id });
        expect((await feed()).total).toBe(3);
    });

    it('forgets deleted games, grids and lists', async () => {
        const { add, call, lines } = await setup();
        const hades = await add(1);
        const list = (await call('/lists', 'POST', { name: 'Temp' })).list;
        const grid = (await call('/grids', 'POST', { title: 'Temp grid', cols: 3, rows: 3 })).grid;
        await call(`/lists/${list.id}`, 'DELETE');
        await call(`/grids/${grid.id}`, 'DELETE');
        expect(await lines()).toEqual(['added:Hades']);
        await call(`/entries/${hades.id}`, 'DELETE');
        expect(await lines()).toEqual([]);
    });

    it('is hidden from the profile when switched off, but keeps recording', async () => {
        const { add, call, app, feed } = await setup();
        await add(1);
        const off = await call('/account/activity', 'PUT', { showActivity: false });
        expect(off.user.showActivity).toBe(false);
        const profile = (await (await app.request(`/api/profiles/${USER}`)).json()).profile;
        expect(profile.activity).toBeNull();
        expect(await feed()).toMatchObject({ events: [], total: 0 });
        await add(2);
        await call('/account/activity', 'PUT', { showActivity: true });
        expect((await feed()).total).toBe(2);
        expect(
            (await (await app.request(`/api/profiles/${USER}`)).json()).profile.activity.total
        ).toBe(2);
    });

    it('pages, and leaves out old playthroughs that are only being logged', async () => {
        const { add, call, app, db, feed } = await setup();
        const hades = await add(1);
        await call(`/entries/${hades.id}/playthroughs`, 'POST', {
            outcome: 'finished',
            startedOn: '2015-01-01',
            endedOn: '2015-02-01',
            platformId: PC.id
        });
        expect((await feed()).total).toBe(1);
        for (let i = 0; i < 4; i++)
            db.insert(activityEvents)
                .values({ userId: 1, type: 'grid', subjectId: 100 + i, subjectName: `G${i}` })
                .run();
        const page = (
            await (await app.request(`/api/profiles/${USER}/activity?limit=2&offset=1`)).json()
        ).activity;
        expect(page.total).toBe(5);
        expect(page.events).toHaveLength(2);
        expect((await app.request('/api/profiles/nobody/activity')).status).toBe(404);
        db.delete(activityEvents).where(eq(activityEvents.userId, 1)).run();
    });
});
