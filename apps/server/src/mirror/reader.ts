import type Database from 'better-sqlite3';
import { SERIES_GAME_TYPES, type PlatformDto, type SeriesRefDto } from '@gamequeue/shared';
import type { GameRecord, IgdbSearchHit, ReleaseInfo, SeriesRecord } from '../igdb/types.js';

/** What search returns at most, as the live client does. */
const SEARCH_LIMIT = 20;
/**
 * Search ranks by how many people rated a game, scaled by how well the text matches. A game named
 * exactly what was typed counts as `EXACT_NAME_WEIGHT` times more popular (not an absolute first
 * place: a game literally called "Zelda" with no ratings must not beat Breath of the Wild, but
 * "Hades" should beat "Hades II"). A title that contains the typed words side by side counts fully,
 * one found through an alternative name ("FF7") counts a bit less, and one that only has the words
 * somewhere ("Warcraft II: Beyond the Dark Portal" for "portal 2") much less.
 */
const EXACT_NAME_WEIGHT = 20;
const ALIAS_WEIGHT = 0.3;
const SCATTERED_WEIGHT = 0.1;
/** A series page lists at most this many games, as the live query does. */
const SERIES_LIMIT = 500;

interface GameRow {
    id: number;
    name: string;
    slug: string | null;
    summary: string | null;
    release_date: string | null;
    release_precision: GameRecord['releasePrecision'];
    cover_image_id: string | null;
    screenshots: string | null;
    igdb_rating: number | null;
    igdb_rating_count: number | null;
    game_type: string | null;
    ttb_hastily_s: number | null;
    ttb_normally_s: number | null;
    ttb_completely_s: number | null;
    ttb_count: number | null;
    similar_games: string | null;
}

const ROMAN = [
    '',
    'i',
    'ii',
    'iii',
    'iv',
    'v',
    'vi',
    'vii',
    'viii',
    'ix',
    'x',
    'xi',
    'xii',
    'xiii',
    'xiv',
    'xv',
    'xvi',
    'xvii',
    'xviii',
    'xix',
    'xx'
];

/** "7" and "vii" name the same sequel: the other spelling of a numeral word, or null. Only 2-20 (a bare "i", "v" or "x" is more likely a word or a letter). */
function numeralTwin(word: string): string | null {
    const lower = word.toLowerCase();
    const isNumber = /^\d+$/.test(lower);
    // A lone "v" or "x" is far more often a letter ("Mega Man X") than a number
    if (!isNumber && lower.length < 2) return null;
    const n = isNumber ? Number(lower) : ROMAN.indexOf(lower);
    if (n < 2 || n > 20) return null;
    return isNumber ? ROMAN[n]! : String(n);
}

/** The words of a search: apostrophes dropped like in the index, other punctuation separating. */
function searchWords(text: string): string[] {
    return text
        .replace(/['’]/g, '')
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean);
}

/**
 * The words of a search as an FTS5 expression: every word must match (in the name or an alternative
 * name) and the last may be a prefix (type-ahead). Apostrophes are dropped like in the index
 * ("baldurs gate" finds "Baldur's Gate"), other punctuation separates words, and a sequel number
 * also matches its Roman numeral ("final fantasy 7" finds "Final Fantasy VII"). A numeral is matched
 * whole, never as a prefix, so "vii" doesn't pull in "viii". Null when nothing searchable is left.
 */
export function ftsQuery(text: string): string | null {
    const words = searchWords(text);
    if (!words.length) return null;
    return words
        .map((w, i) => {
            const twin = numeralTwin(w);
            if (twin) return `("${w}" OR "${twin}")`;
            return `"${w}"${i === words.length - 1 ? '*' : ''}`;
        })
        .join(' AND ');
}

/** Spellings of a search with each sequel number written both ways; few enough to spell out. */
const MAX_PHRASE_VARIANTS = 16;

/**
 * The search as exact phrases (the words side by side, in order, the last a prefix unless it is a
 * numeral), one per numeral spelling: `("final fantasy 7" OR "final fantasy vii")`. Used to tell a
 * title that contains what was typed from one that merely has the same words somewhere.
 */
export function ftsPhrases(text: string): string | null {
    const words = searchWords(text);
    if (!words.length) return null;
    let variants: string[][] = [[]];
    for (const w of words) {
        const twin = numeralTwin(w);
        const spellings = twin && variants.length * 2 <= MAX_PHRASE_VARIANTS ? [w, twin] : [w];
        variants = variants.flatMap((v) => spellings.map((x) => [...v, x]));
    }
    const last = words[words.length - 1]!;
    const star = numeralTwin(last) ? '' : ' *';
    return `(${variants.map((v) => `"${v.join(' ')}"${star}`).join(' OR ')})`;
}

const yearOf = (releaseDate: string | null) =>
    releaseDate ? Number(releaseDate.slice(0, 4)) : null;

function prepareStatements(db: Database.Database) {
    // Id lists go in as one JSON array so there is no limit on how many
    const ids = 'SELECT value FROM json_each(?)';
    return {
        search: db.prepare(
            `SELECT g.id, g.name, g.release_date, g.cover_image_id, g.igdb_rating
             FROM games_fts f JOIN games g ON g.id = f.rowid
             WHERE games_fts MATCH @match
             ORDER BY (coalesce(g.igdb_rating_count, 0) + 1)
                      * CASE WHEN lower(replace(replace(replace(replace(replace(g.name, '''', ''), '’', ''), ':', ''), '-', ' '), '.', '')) = @exact THEN ${EXACT_NAME_WEIGHT} ELSE 1 END
                      * CASE
                          WHEN f.rowid IN (SELECT rowid FROM games_fts WHERE games_fts MATCH @namePhrase) THEN 1
                          WHEN f.rowid IN (SELECT rowid FROM games_fts WHERE games_fts MATCH @anyPhrase) THEN ${ALIAS_WEIGHT}
                          ELSE ${SCATTERED_WEIGHT}
                        END DESC,
                      g.id
             LIMIT ${SEARCH_LIMIT}`
        ),
        hits: db.prepare(
            `SELECT id, name, release_date, cover_image_id, igdb_rating FROM games
             WHERE searchable = 1 AND id IN (${ids})`
        ),
        game: db.prepare('SELECT * FROM games WHERE id = ?'),
        gameDates: db.prepare(
            `SELECT id, release_date, release_precision FROM games WHERE id IN (${ids})`
        ),
        platforms: db.prepare(
            `SELECT j.game_id, p.id, p.name, p.abbreviation
             FROM game_platforms j JOIN platforms p ON p.id = j.platform_id
             WHERE j.game_id IN (${ids}) ORDER BY p.id`
        ),
        genres: db.prepare(
            `SELECT g.id, g.name FROM game_genres j JOIN genres g ON g.id = j.genre_id
             WHERE j.game_id = ? ORDER BY g.id`
        ),
        themes: db.prepare(
            `SELECT t.id, t.name FROM game_themes j JOIN themes t ON t.id = j.theme_id
             WHERE j.game_id = ? ORDER BY t.id`
        ),
        series: db.prepare(
            `SELECT j.game_id, s.id, s.name FROM game_series j JOIN series s ON s.id = j.series_id
             WHERE j.game_id IN (${ids}) ORDER BY s.id`
        ),
        seriesName: db.prepare('SELECT name FROM series WHERE id = ?').pluck(),
        seriesGames: db.prepare(
            `SELECT g.id, g.name, g.cover_image_id, g.release_date, g.release_precision
             FROM game_series j JOIN games g ON g.id = j.game_id
             WHERE j.series_id = ? AND g.is_edition = 0
               AND g.game_type_id IN (${SERIES_GAME_TYPES.join(',')})
             ORDER BY g.release_date IS NULL, g.release_date, g.id
             LIMIT ${SERIES_LIMIT}`
        ),
        allPlatforms: db.prepare('SELECT id, name, abbreviation FROM platforms ORDER BY name'),
        meta: db.prepare('SELECT key, value FROM meta')
    };
}
type Statements = ReturnType<typeof prepareStatements>;

/** Reads the mirror (see `schema.ts`) and answers in the shapes the live IGDB client does. */
export class MirrorReader {
    private stmt: Statements;

    constructor(db: Database.Database) {
        this.stmt = prepareStatements(db);
    }

    private platformsOf(gameIds: number[]): Map<number, PlatformDto[]> {
        const out = new Map<number, PlatformDto[]>();
        const rows = this.stmt.platforms.all(JSON.stringify(gameIds)) as {
            game_id: number;
            id: number;
            name: string;
            abbreviation: string | null;
        }[];
        for (const r of rows) {
            const list = out.get(r.game_id) ?? [];
            list.push({ id: r.id, name: r.name, abbreviation: r.abbreviation });
            out.set(r.game_id, list);
        }
        return out;
    }

    private toHits(
        rows: {
            id: number;
            name: string;
            release_date: string | null;
            cover_image_id: string | null;
            igdb_rating: number | null;
        }[]
    ): IgdbSearchHit[] {
        const platforms = this.platformsOf(rows.map((r) => r.id));
        return rows.map((r) => ({
            id: r.id,
            name: r.name,
            year: yearOf(r.release_date),
            coverImageId: r.cover_image_id,
            rating: r.igdb_rating,
            platforms: platforms.get(r.id) ?? []
        }));
    }

    /** Name search over the games search may show, best match first (see `ftsQuery`). */
    search(query: string): IgdbSearchHit[] {
        const match = ftsQuery(query);
        const phrases = ftsPhrases(query);
        if (!match || !phrases) return [];
        const rows = this.stmt.search.all({
            match,
            anyPhrase: phrases,
            namePhrase: `{name} : ${phrases}`,
            exact: searchWords(query).join(' ').toLowerCase()
        }) as Parameters<MirrorReader['toHits']>[0];
        return this.toHits(rows);
    }

    game(id: number): GameRecord | null {
        const g = this.stmt.game.get(id) as GameRow | undefined;
        if (!g) return null;
        const hasTtb = g.ttb_count !== null;
        return {
            id: g.id,
            name: g.name,
            slug: g.slug,
            summary: g.summary,
            releaseDate: g.release_date,
            releasePrecision: g.release_precision,
            series: this.seriesOf([id]).get(id) ?? [],
            screenshots: g.screenshots ? (JSON.parse(g.screenshots) as string[]) : [],
            coverImageId: g.cover_image_id,
            igdbRating: g.igdb_rating,
            igdbRatingCount: g.igdb_rating_count,
            gameType: g.game_type,
            platforms: this.platformsOf([id]).get(id) ?? [],
            genres: this.stmt.genres.all(id) as GameRecord['genres'],
            themes: this.stmt.themes.all(id) as GameRecord['themes'],
            ttb: hasTtb
                ? {
                      hastilySeconds: g.ttb_hastily_s,
                      normallySeconds: g.ttb_normally_s,
                      completelySeconds: g.ttb_completely_s,
                      count: g.ttb_count ?? 0
                  }
                : null
        };
    }

    /** Release info for the ids the mirror knows; the others are left out. */
    releaseInfo(ids: number[]): ReleaseInfo[] {
        const rows = this.stmt.gameDates.all(JSON.stringify(ids)) as {
            id: number;
            release_date: string | null;
            release_precision: ReleaseInfo['releasePrecision'];
        }[];
        return rows.map((r) => ({
            id: r.id,
            releaseDate: r.release_date,
            releasePrecision: r.release_precision
        }));
    }

    private seriesOf(ids: number[]): Map<number, SeriesRefDto[]> {
        const out = new Map<number, SeriesRefDto[]>();
        const rows = this.stmt.series.all(JSON.stringify(ids)) as {
            game_id: number;
            id: number;
            name: string;
        }[];
        for (const r of rows) {
            const list = out.get(r.game_id) ?? [];
            list.push({ id: r.id, name: r.name });
            out.set(r.game_id, list);
        }
        return out;
    }

    /** Series per game for the ids the mirror knows; the others are left out. */
    gameSeries(ids: number[]): { id: number; series: SeriesRefDto[] }[] {
        const known = this.releaseInfo(ids).map((r) => r.id);
        const series = this.seriesOf(known);
        return known.map((id) => ({ id, series: series.get(id) ?? [] }));
    }

    /** Screenshot image ids, or null when the mirror doesn't know the game. */
    screenshots(id: number): string[] | null {
        const g = this.stmt.game.get(id) as GameRow | undefined;
        if (!g) return null;
        return g.screenshots ? (JSON.parse(g.screenshots) as string[]) : [];
    }

    /** A series with its main games, oldest first; null when the mirror doesn't know the series. */
    seriesRecord(id: number): SeriesRecord | null {
        const name = this.stmt.seriesName.get(id) as string | undefined;
        if (name === undefined) return null;
        const rows = this.stmt.seriesGames.all(id) as {
            id: number;
            name: string;
            cover_image_id: string | null;
            release_date: string | null;
            release_precision: SeriesRecord['games'][number]['releasePrecision'];
        }[];
        return {
            id,
            name,
            games: rows.map((r) => ({
                id: r.id,
                name: r.name,
                coverImageId: r.cover_image_id,
                releaseDate: r.release_date,
                releasePrecision: r.release_precision
            }))
        };
    }

    /** IGDB's similar games in IGDB's order, add-ons and editions dropped; null for an unknown game. */
    similar(id: number): IgdbSearchHit[] | null {
        const g = this.stmt.game.get(id) as GameRow | undefined;
        if (!g) return null;
        if (!g.similar_games) return [];
        const order = JSON.parse(g.similar_games) as number[];
        const rows = this.stmt.hits.all(g.similar_games) as Parameters<MirrorReader['toHits']>[0];
        const hits = new Map(this.toHits(rows).map((h) => [h.id, h]));
        return order.flatMap((similarId) => {
            const hit = hits.get(similarId);
            return hit ? [hit] : [];
        });
    }

    platforms(): PlatformDto[] {
        return this.stmt.allPlatforms.all() as PlatformDto[];
    }

    meta(): Record<string, string> {
        const rows = this.stmt.meta.all() as { key: string; value: string }[];
        return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    }
}
