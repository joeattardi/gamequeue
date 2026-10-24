import { describe, expect, it } from 'vitest';
import { PC, setupApi } from './api.js';

async function setup() {
    const s = await setupApi();
    const hades = await s.add(1, [PC.id]);
    const celeste = await s.add(2, [PC.id]);
    await s.add(3, [PC.id]);
    const log = (id: number, body: object) => s.call(`/entries/${id}/playthroughs`, 'POST', body);
    await log(hades.id, {
        outcome: 'finished',
        startedOn: '2024-02-01',
        endedOn: '2024-05-05',
        playtimeMinutes: 1200
    });
    await log(celeste.id, { outcome: 'finished', endedOn: '2023-03-03' });
    await log(celeste.id, { outcome: 'finished', endedOn: '2024-06-06', playtimeMinutes: 480 });
    await s.call(`/entries/${hades.id}`, 'PATCH', { rating: 5, notes: 'secret note' });
    return { ...s, hades, celeste };
}

describe('recap', () => {
    it('summarises one year', async () => {
        const { call } = await setup();
        const { status, recap } = await call('/recap?year=2024');
        expect(status).toBe(200);
        expect(recap).toMatchObject({
            year: 2024,
            finishedGames: 2,
            previousFinishedGames: 1,
            replays: 1,
            // Hades 20h + Celeste 8h
            playMinutes: 1680,
            busiestMonth: 5,
            longestHaul: { days: 94 }
        });
        expect(recap.games.map((e: any) => e.game.name)).toEqual(['Hades', 'Celeste']);
        expect(recap.topRated.map((e: any) => e.game.name)).toEqual(['Hades']);
        expect(recap.topPlatforms).toEqual([{ name: PC.name, count: 2 }]);
        expect(recap.years).toContain(2023);
        expect(recap.years).toContain(2024);
    });

    it('picks a year when none is asked for', async () => {
        const { call } = await setup();
        const { recap } = await call('/recap');
        // Games were added this year, so this year is a candidate even with nothing finished
        expect(recap.year).toBe(new Date().getUTCFullYear());
        expect(recap.finishedGames).toBe(0);
        expect(recap.archetype).toBeNull();
        expect(recap.addedCount).toBe(3);
    });

    it('rejects a bad year', async () => {
        const { call } = await setup();
        expect((await call('/recap?year=abc')).status).toBe(400);
        expect((await call('/recap?year=99')).status).toBe(400);
    });

    it('is per user and needs login', async () => {
        const { call, app, secondUser } = await setup();
        expect((await app.request('/api/recap')).status).toBe(401);
        const other = await secondUser();
        expect((await call('/recap?year=2024', 'GET', undefined, other)).recap.finishedGames).toBe(
            0
        );
    });

    it('is public on the profile without notes', async () => {
        const { app, call } = await setup();
        const me = (await call('/auth/me')).user.username as string;
        const res = await app.request(`/api/profiles/${me}/recap?year=2024`);
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(JSON.parse(text).recap.finishedGames).toBe(2);
        expect(text).not.toContain('secret note');
        expect((await app.request('/api/profiles/nobody/recap')).status).toBe(404);
        expect((await app.request(`/api/profiles/${me}/recap?year=x`)).status).toBe(400);
    });
});
