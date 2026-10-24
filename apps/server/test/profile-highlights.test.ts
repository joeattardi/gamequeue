import { describe, expect, it } from 'vitest';
import { PC, setupApi } from './api.js';

describe('profile highlight rows', () => {
    it('lists the latest dated finishes, newest first, and favorites best rated first', async () => {
        const { app, add, call } = await setup();
        const [hades, celeste, knight, wilds] = [
            await add(1),
            await add(2),
            await add(3),
            await add(4)
        ];
        const finish = async (id: number, date: string) => {
            await call(`/entries/${id}/start`, 'POST', { platformId: PC.id, date: '2026-01-01' });
            await call(`/entries/${id}/finish`, 'POST', { date });
        };
        await finish(hades.id, '2026-03-01');
        await finish(celeste.id, '2026-05-01');
        // finished long ago with no known date: not "recent"
        await call(`/entries/${knight.id}/playthroughs`, 'POST', {
            outcome: 'finished',
            platformId: PC.id
        });
        await call(`/entries/${hades.id}`, 'PATCH', { favorite: true, rating: 3 });
        await call(`/entries/${wilds.id}`, 'PATCH', { favorite: true, rating: 5 });

        const profile = (await (await app.request('/api/profiles/user_me')).json()).profile;
        expect(profile.recentlyFinished.map((e: any) => e.game.name)).toEqual(['Celeste', 'Hades']);
        expect(profile.favoriteGames.map((e: any) => e.game.name)).toEqual([
            'Outer Wilds',
            'Hades'
        ]);
        expect(profile.favoriteGames[0].notes).toBeUndefined();
        // the activity preview is raw events, enough to group
        expect(profile.activity.events.length).toBeGreaterThan(8);
    });

    it('is empty for a new profile', async () => {
        const { app } = await setup();
        const profile = (await (await app.request('/api/profiles/user_me')).json()).profile;
        expect(profile).toMatchObject({ recentlyFinished: [], favoriteGames: [] });
    });
});

const setup = () => setupApi();
