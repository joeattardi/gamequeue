import { describe, expect, it } from 'vitest';
import { games } from '../src/db/schema.js';
import { makeApp } from './helpers.js';

describe('showcase', () => {
    it('is public and empty when nothing is cached', async () => {
        const { app } = makeApp();
        const res = await app.request('/api/showcase');
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect(await res.json()).toEqual({ games: [] });
    });

    it('returns up to three cached games, only ones with a cover', async () => {
        const { app, db } = makeApp();
        db.insert(games)
            .values([
                { id: 1, name: 'A', coverImageId: 'co1', fetchedAt: 0 },
                { id: 2, name: 'B', coverImageId: 'co2', fetchedAt: 0 },
                { id: 3, name: 'C', coverImageId: 'co3', fetchedAt: 0 },
                { id: 4, name: 'D', coverImageId: 'co4', fetchedAt: 0 },
                { id: 5, name: 'No cover', coverImageId: null, fetchedAt: 0 }
            ])
            .run();
        const body = (await (await app.request('/api/showcase')).json()) as {
            games: { id: number; coverImageId: string }[];
        };
        expect(body.games).toHaveLength(3);
        expect(new Set(body.games.map((g) => g.id)).size).toBe(3);
        expect(body.games.every((g) => g.id !== 5 && g.coverImageId)).toBe(true);
    });
});
