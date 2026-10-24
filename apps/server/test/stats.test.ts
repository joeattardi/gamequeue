import { describe, expect, it } from 'vitest';
import { PC, setupApi } from './api.js';

async function setup() {
    const s = await setupApi();
    const hades = await s.add(1, [PC.id], ['roguelike']);
    const celeste = await s.add(2, [PC.id]);
    await s.add(3, [PC.id]);
    await s.call(`/entries/${hades.id}/playthroughs`, 'POST', {
        outcome: 'finished',
        endedOn: '2024-05-05',
        playtimeMinutes: 1200
    });
    await s.call(`/entries/${hades.id}`, 'PATCH', { rating: 5, notes: 'secret note' });
    await s.call(`/entries/${celeste.id}/playthroughs`, 'POST', { outcome: 'abandoned' });
    return { ...s, hades, celeste };
}

describe('stats', () => {
    it('summarises the collection and finished playthroughs', async () => {
        const { call } = await setup();
        const { status, stats } = await call('/stats');
        expect(status).toBe(200);
        expect(stats.overview).toMatchObject({
            total: 3,
            backlogCount: 1,
            ratedCount: 1,
            averageRating: 5
        });
        expect(stats.overview.byStatus).toMatchObject({ finished: 1, abandoned: 1, unplayed: 1 });
        expect(stats.finished.years).toEqual([{ year: '2024', count: 1 }]);
        expect(stats.playtime).toMatchObject({ finishes: 1, playMinutes: 1200 });
        expect(stats.breakdowns.platforms[0]).toMatchObject({
            name: PC.name,
            total: 3,
            finished: 1
        });
        expect(stats.ratings.top.map((e: any) => e.game.name)).toEqual(['Hades']);
    });

    it('is per user and needs login', async () => {
        const { call, app, secondUser } = await setup();
        expect((await app.request('/api/stats')).status).toBe(401);
        const other = await secondUser();
        expect((await call('/stats', 'GET', undefined, other)).stats.overview.total).toBe(0);
    });

    it('is public on the profile without notes', async () => {
        const { app, call } = await setup();
        const me = (await call('/auth/me')).user.username as string;
        const res = await app.request(`/api/profiles/${me}/stats`);
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(JSON.parse(text).stats.overview.total).toBe(3);
        expect(text).not.toContain('secret note');
        expect((await app.request('/api/profiles/nobody/stats')).status).toBe(404);
        // a user called "stats" can't shadow the route, and other views still work
        expect((await app.request(`/api/profiles/${me}/backlog`)).status).toBe(200);
    });
});
