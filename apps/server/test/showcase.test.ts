import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { games } from '../src/db/schema.js';
import { createMirrorIgdbClient } from '../src/mirror/client.js';
import { runMirror } from '../src/mirror/run.js';
import { fakeSource, GAME_HEADER } from './mirror-fixtures.js';
import { makeApp } from './helpers.js';

// Only 1, 6, 7 and 8 may be shown: 2 has too few ratings, 3 is erotic, 4 has no cover, 5 is a DLC
const GAMES = [
    GAME_HEADER,
    '1,Popular,popular,,,0,,10,,,500,,,,,',
    '2,Obscure,obscure,,,0,,11,,,10,,,,,',
    '3,Adult,adult,,,0,,12,,,900,,,,"{31,42}",',
    '4,No Cover,no-cover,,,0,,,,,900,,,,,',
    '5,Some DLC,some-dlc,,,1,,13,,,900,,,,,',
    '6,Just Enough,just-enough,,,0,,14,,,50,,,,"{31}",',
    '7,Famous,famous,,,0,,15,,,5000,,,,,',
    '8,Liked,liked,,,0,,16,,,60,,,,,'
].join('\n');
const COVERS = 'id,image_id\n10,co1\n11,co2\n12,co3\n13,co5\n14,co6\n15,co7\n16,co8';
const SHOWABLE = [1, 6, 7, 8];

let dir: string;
let path: string;
beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'showcase-'));
    path = join(dir, 'igdb.db');
    await runMirror({
        source: fakeSource({
            games: GAMES,
            covers: COVERS,
            themes: 'id,name\n31,Drama\n42,Erotic'
        }),
        path,
        minGames: 1
    });
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

type Body = { games: { id: number; name: string; coverImageId: string }[] };

describe('showcase', () => {
    it('is public and empty without a mirror', async () => {
        const { app } = makeApp();
        const res = await app.request('/api/showcase');
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect(await res.json()).toEqual({ games: [] });
    });

    it('never shows games from the shared cache, which imports can write to', async () => {
        const { app, db } = makeApp({}, createMirrorIgdbClient({ path: join(dir, 'missing.db') }));
        db.insert(games)
            .values([{ id: 99, name: 'Imported', coverImageId: 'co99', fetchedAt: 0 }])
            .run();
        expect(await (await app.request('/api/showcase')).json()).toEqual({ games: [] });
    });

    it('picks three different well-known games with a cover from the mirror', async () => {
        const { app } = makeApp({}, createMirrorIgdbClient({ path }));
        const seen = new Set<number>();
        for (let i = 0; i < 30; i++) {
            const body = (await (await app.request('/api/showcase')).json()) as Body;
            expect(body.games).toHaveLength(3);
            expect(new Set(body.games.map((g) => g.id)).size).toBe(3);
            for (const g of body.games) {
                expect(SHOWABLE).toContain(g.id);
                expect(g.coverImageId).toBe(`co${g.id}`);
                seen.add(g.id);
            }
        }
        // Random, not always the same three
        expect([...seen].sort()).toEqual(SHOWABLE);
    });
});
