import { describe, expect, it } from 'vitest';
import { setupApi } from './api.js';

const bodies = (e: { notes: { body: string }[] }) => e.notes.map((n) => n.body);

describe('notes', () => {
    it('adds, edits, toggles and deletes notes, newest first', async () => {
        const { add, call } = await setupApi();
        const e = await add(1);
        expect(e.notes).toEqual([]);

        const first = (await call(`/entries/${e.id}/notes`, 'POST', { body: '  one  ' })).entry;
        expect(first.notes[0]).toMatchObject({ body: 'one', public: false });
        await new Promise((r) => setTimeout(r, 5));
        const two = (await call(`/entries/${e.id}/notes`, 'POST', { body: 'two', public: true }))
            .entry;
        expect(bodies(two)).toEqual(['two', 'one']);

        const id = two.notes[1].id;
        const edited = (await call(`/entries/${e.id}/notes/${id}`, 'PATCH', { body: 'uno' })).entry;
        expect(bodies(edited)).toEqual(['two', 'uno']);
        const flipped = (await call(`/entries/${e.id}/notes/${id}`, 'PATCH', { public: true }))
            .entry;
        expect(flipped.notes.map((n: { public: boolean }) => n.public)).toEqual([true, true]);

        const left = (await call(`/entries/${e.id}/notes/${id}`, 'DELETE')).entry;
        expect(bodies(left)).toEqual(['two']);
    });

    it('validates input and 404s for other notes, entries and users', async () => {
        const { add, call, secondUser } = await setupApi();
        const e = await add(1);
        const other = await add(2);
        expect((await call(`/entries/${e.id}/notes`, 'POST', { body: '   ' })).status).toBe(400);
        expect((await call(`/entries/${e.id}/notes`, 'POST', {})).status).toBe(400);
        const note = (await call(`/entries/${e.id}/notes`, 'POST', { body: 'x' })).entry.notes[0];

        expect((await call(`/entries/${e.id}/notes/${note.id}`, 'PATCH', {})).status).toBe(400);
        // the note belongs to another entry
        expect((await call(`/entries/${other.id}/notes/${note.id}`, 'DELETE')).status).toBe(404);
        expect((await call(`/entries/999/notes`, 'POST', { body: 'x' })).status).toBe(404);

        const them = await secondUser();
        expect((await call(`/entries/${e.id}/notes`, 'POST', { body: 'y' }, them)).status).toBe(
            404
        );
        expect(
            (await call(`/entries/${e.id}/notes/${note.id}`, 'DELETE', undefined, them)).status
        ).toBe(404);
    });

    it('counts a changed note as touching the game, but not a visibility change', async () => {
        const { add, call } = await setupApi();
        const e = await add(1);
        const t0 = e.updatedAt;
        await new Promise((r) => setTimeout(r, 5));
        const withNote = (await call(`/entries/${e.id}/notes`, 'POST', { body: 'x' })).entry;
        expect(withNote.updatedAt).toBeGreaterThan(t0);
        await new Promise((r) => setTimeout(r, 5));
        const flipped = (
            await call(`/entries/${e.id}/notes/${withNote.notes[0].id}`, 'PATCH', { public: true })
        ).entry;
        expect(flipped.updatedAt).toBe(withNote.updatedAt);
    });

    it('is deleted with the entry', async () => {
        const { add, call } = await setupApi();
        const e = await add(1);
        await call(`/entries/${e.id}/notes`, 'POST', { body: 'x' });
        await call(`/entries/${e.id}`, 'DELETE');
        const again = await add(1);
        expect(again.notes).toEqual([]);
    });

    it('shows only public notes on the public game page', async () => {
        const { app, add, call } = await setupApi();
        const e = await add(1);
        await call(`/entries/${e.id}/notes`, 'POST', { body: 'hidden thought' });
        await call(`/entries/${e.id}/notes`, 'POST', { body: 'shared thought', public: true });
        const res = await app.request('/api/profiles/user_me/games/1');
        const text = await res.text();
        expect(JSON.parse(text).notes).toMatchObject([{ body: 'shared thought' }]);
        expect(text).not.toContain('hidden thought');
        // nowhere else on the public profile
        const profile = await (await app.request('/api/profiles/user_me')).text();
        const list = await (await app.request('/api/profiles/user_me/collection')).text();
        expect(profile + list).not.toContain('thought');
    });

    it('survives an export and a merge import, without duplicating', async () => {
        const a = await setupApi();
        const e = await a.add(1);
        await a.call(`/entries/${e.id}/notes`, 'POST', { body: 'private one' });
        await a.call(`/entries/${e.id}/notes`, 'POST', { body: 'public one', public: true });
        const file = await a.call('/data/export');

        const b = await setupApi();
        const mine = await b.add(1);
        await b.call(`/entries/${mine.id}/notes`, 'POST', { body: 'public one' });
        const imp = () => b.call('/data/import?commit=true', 'POST', file);
        await imp();
        await imp();
        const got = (await b.call(`/entries/${mine.id}`)).entry;
        expect(bodies(got).sort()).toEqual(['private one', 'public one']);
        // my own copy of the shared text kept its visibility
        expect(got.notes.find((n: { body: string }) => n.body === 'public one').public).toBe(false);
    });

    it('reads the single text of older export files as one private note', async () => {
        const a = await setupApi();
        await a.add(1);
        const file = (await a.call('/data/export')) as any;
        file.games[0].notes = 'from an old file';
        delete file.games[0].noteItems;
        const b = await setupApi();
        await b.call('/data/import?commit=true', 'POST', file);
        await b.call('/data/import?commit=true', 'POST', file);
        const entry = (await b.call('/entries')).entries[0];
        expect(entry.notes).toMatchObject([{ body: 'from an old file', public: false }]);
    });

    it('puts notes in the CSV export', async () => {
        const { app, add, call, cookie } = await setupApi();
        const e = await add(1);
        await call(`/entries/${e.id}/notes`, 'POST', { body: 'first' });
        await call(`/entries/${e.id}/notes`, 'POST', { body: 'second' });
        const csv = await (
            await app.request('/api/data/export.csv', { headers: { cookie } })
        ).text();
        expect(csv).toContain('first');
        expect(csv).toContain('second');
    });
});
