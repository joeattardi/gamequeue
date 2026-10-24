import { describe, expect, it } from 'vitest';
import { PC, setupApi } from './api.js';

const USER = 'user_me';

describe('activity calendar data', () => {
    it('returns the events and the days played, privately and publicly', async () => {
        const { add, call, app } = await setupApi();
        const hades = await add(1);
        await call(`/entries/${hades.id}/playthroughs`, 'POST', {
            outcome: 'finished',
            startedOn: '2025-03-01',
            endedOn: '2025-03-20',
            platformId: PC.id
        });
        const celeste = await add(2);
        await call(`/entries/${celeste.id}/playthroughs`, 'POST', {
            outcome: 'abandoned',
            startedOn: null,
            endedOn: '2025-03-05',
            platformId: PC.id
        });
        await call(`/entries/${celeste.id}/start`, 'POST', { platformId: PC.id });

        const q = 'from=2025-03-10&to=2025-03-31';
        const mine = (await call(`/stats/timeline?${q}`)).timeline;
        // Only the window's part of a long playthrough matters; the unknown start is skipped;
        // the open playthrough runs to today
        expect(mine.playing).toHaveLength(1);
        expect(mine.playing[0]).toMatchObject({
            game: { name: 'Hades' },
            start: '2025-03-01',
            end: '2025-03-20'
        });
        expect(mine.events).toEqual([]); // the events were all made today
        const now = new Date().toISOString().slice(0, 10);
        const today = (await call(`/stats/timeline?from=${now}&to=${now}`)).timeline;
        expect(today.events.map((e: any) => e.type)).toContain('started');
        expect(today.playing.map((p: any) => p.game.name)).toEqual(['Celeste']);

        const pub = (await (await app.request(`/api/profiles/${USER}/timeline?${q}`)).json())
            .timeline;
        expect(pub.playing).toEqual(mine.playing);
    });

    it('is empty when the activity is hidden, and rejects bad ranges', async () => {
        const { add, call, app } = await setupApi();
        await add(1);
        const now = new Date().toISOString().slice(0, 10);
        await call('/account/activity', 'PUT', { showActivity: false });
        const pub = (
            await (await app.request(`/api/profiles/${USER}/timeline?from=${now}&to=${now}`)).json()
        ).timeline;
        expect(pub).toEqual({ events: [], playing: [] });
        expect((await app.request(`/api/profiles/${USER}/timeline?from=${now}`)).status).toBe(400);
        expect(
            (await app.request(`/api/profiles/${USER}/timeline?from=2026-02-01&to=2026-01-01`))
                .status
        ).toBe(400);
        expect(
            (await app.request(`/api/profiles/nobody/timeline?from=${now}&to=${now}`)).status
        ).toBe(404);
    });
});

describe('days played for paused and unplayed games', () => {
    it('does not count a game added as paused, or never started, as played every day since', async () => {
        const { add, call } = await setupApi();
        await add(1); // unplayed
        const celeste = await call('/entries', 'POST', {
            igdbId: 2,
            platformIds: [PC.id],
            status: 'paused',
            date: '2020-01-10'
        });
        expect(celeste.entry ?? celeste).toBeTruthy();
        const timeline = (await call('/stats/timeline?from=2020-01-01&to=2026-12-31')).timeline;
        expect(timeline.playing).toEqual([
            { game: expect.objectContaining({ id: 2 }), start: '2020-01-10', end: '2020-01-10' }
        ]);
    });
});
