import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { entries } from '../src/db/schema.js';
import { setupApi } from './api.js';

async function setup() {
    const s = await setupApi();
    const hades = await s.add(1);
    const celeste = await s.add(2);
    const knight = await s.add(3);
    const fav = (id: number, favorite = true) => s.call(`/entries/${id}`, 'PATCH', { favorite });
    const names = (r: Record<string, any>) => r.entries.map((e: any) => e.game.name);
    return { ...s, hades, celeste, knight, fav, names };
}

describe('favorites', () => {
    it('toggles per game, defaulting to not a favorite', async () => {
        const { call, hades, celeste, fav } = await setup();
        expect(hades.favorite).toBe(false);
        expect((await fav(hades.id)).entry.favorite).toBe(true);
        expect((await call(`/entries/${hades.id}`)).entry.favorite).toBe(true);
        expect((await call(`/entries/${celeste.id}`)).entry.favorite).toBe(false);
        expect((await fav(hades.id, false)).entry.favorite).toBe(false);
    });

    it('leaves rating, lists and "last changed" alone', async () => {
        const { call, db, hades, fav } = await setup();
        await call(`/entries/${hades.id}`, 'PATCH', { rating: 4 });
        db.update(entries).set({ updatedAt: 1000 }).where(eq(entries.id, hades.id)).run();
        const { entry } = await fav(hades.id);
        expect(entry).toMatchObject({ favorite: true, rating: 4, lists: [], queued: false });
        expect(entry.updatedAt).toBe(1000);
    });

    it('filters the collection and counts favorites among the other facets', async () => {
        const { call, hades, knight, fav, names, celeste } = await setup();
        await fav(hades.id);
        await fav(knight.id);
        expect(names(await call('/entries?favorite=true'))).toEqual(['Hades', 'Hollow Knight']);
        expect((await call('/entries?favorite=true')).total).toBe(2);
        expect((await call('/entries/facet-counts')).favorites).toBe(2);
        // counted against the other facets, but not against itself
        await call(`/entries/${celeste.id}/start`, 'POST', {});
        expect((await call('/entries/facet-counts?status=playing')).favorites).toBe(0);
        expect((await call('/entries/facet-counts?favorite=true')).favorites).toBe(2);
    });

    it('is a smart list rule', async () => {
        const { call, hades, fav, names } = await setup();
        await fav(hades.id);
        const made = await call('/smart-lists', 'POST', {
            name: 'Loved',
            rules: [{ field: 'favorite' }],
            sort: 'title'
        });
        expect(made.status).toBe(201);
        expect(made.smartList.ruleText).toEqual(['Is a favorite']);
        expect(names(made.smartList)).toEqual(['Hades']);
    });

    it('shows on the public profile, with its own page', async () => {
        const { app, hades, knight, fav } = await setup();
        await fav(hades.id);
        await fav(knight.id);
        const profile = (await (await app.request('/api/profiles/user_me')).json()).profile;
        expect(profile.summary.favorites).toBe(2);
        const page = (await (await app.request('/api/profiles/user_me/favorites')).json()).games;
        expect(page.entries.map((e: any) => e.game.name)).toEqual(['Hades', 'Hollow Knight']);
        expect(page.entries[0].favorite).toBe(true);
        expect(page.total).toBe(2);
    });

    it('round-trips through export and CSV, and import only ever adds the mark', async () => {
        const s = await setup();
        await s.fav(s.hades.id);
        const file = await s.call('/data/export');
        expect(file.games.find((g: any) => g.igdbId === 1).favorite).toBe(true);
        expect(file.games.find((g: any) => g.igdbId === 2).favorite).toBe(false);

        const csv = await (
            await s.app.request('/api/data/export.csv', {
                headers: { cookie: s.cookie }
            })
        ).text();
        expect(csv).toContain('Favorite');
        expect(csv).toMatch(/Hades,[^\r]*,yes,/);

        // Unfavorite locally, then import: the file's mark fills it back in
        await s.fav(s.hades.id, false);
        await s.call('/data/import?commit=true', 'POST', file);
        expect((await s.call(`/entries/${s.hades.id}`)).entry.favorite).toBe(true);
        // A file that says false doesn't clear a favorite you have
        await s.call('/data/import?commit=true', 'POST', {
            ...file,
            games: file.games.map((g: any) => ({ ...g, favorite: false }))
        });
        expect((await s.call(`/entries/${s.hades.id}`)).entry.favorite).toBe(true);
    });
});
