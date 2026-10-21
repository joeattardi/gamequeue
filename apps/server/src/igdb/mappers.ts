import type { ReleasePrecision } from '@gamequeue/shared';
import type { GameRecord, IgdbSearchHit, ReleaseInfo } from './types.js';

interface RawNamed {
    id: number;
    name: string;
    abbreviation?: string;
}
export interface RawGame {
    id: number;
    name: string;
    slug?: string;
    summary?: string;
    first_release_date?: number;
    collections?: { id: number; name: string }[];
    release_dates?: { date?: number; date_format?: number | { id?: number } }[];
    cover?: { image_id?: string };
    platforms?: RawNamed[];
    genres?: RawNamed[];
    themes?: RawNamed[];
    total_rating?: number;
    total_rating_count?: number;
    game_type?: { type?: string } | number;
}
export interface RawTtb {
    game_id: number;
    hastily?: number;
    normally?: number;
    completely?: number;
    count?: number;
}

const toIsoDate = (unixSeconds?: number) =>
    unixSeconds === undefined ? null : new Date(unixSeconds * 1000).toISOString().slice(0, 10);

/** IGDB `date_formats` ids (checked live): 0 day, 1 month, 2 year, 3-6 quarters 1-4, 7 TBD. */
const PRECISION_BY_FORMAT: Record<number, ReleasePrecision | 'tbd'> = {
    0: 'day',
    1: 'month',
    2: 'year',
    3: 'quarter',
    4: 'quarter',
    5: 'quarter',
    6: 'quarter',
    7: 'tbd'
};
const PRECISION_RANK: Record<string, number> = { day: 0, month: 1, quarter: 2, year: 3 };

/**
 * The game's first release date and how exact it is. `first_release_date` is the earliest of the
 * per-platform `release_dates`, so the precision comes from the ones that carry that same date (the
 * most exact wins). A format of TBD, or no matching row, leaves the precision unknown (null).
 */
export function mapRelease(raw: Pick<RawGame, 'first_release_date' | 'release_dates'>) {
    const date = toIsoDate(raw.first_release_date);
    let precision: ReleasePrecision | null = null;
    let tbd = false;
    for (const r of raw.release_dates ?? []) {
        if (r.date === undefined || r.date !== raw.first_release_date) continue;
        const id = typeof r.date_format === 'object' ? r.date_format?.id : r.date_format;
        const p = id === undefined ? undefined : PRECISION_BY_FORMAT[id];
        if (p === 'tbd') tbd = true;
        else if (p && (!precision || PRECISION_RANK[p]! < PRECISION_RANK[precision]!))
            precision = p;
    }
    return tbd && !precision
        ? { releaseDate: null, releasePrecision: null }
        : { releaseDate: date, releasePrecision: precision };
}

export const mapSeriesRefs = (raw: Pick<RawGame, 'collections'>) =>
    (raw.collections ?? []).map((c) => ({ id: c.id, name: c.name }));

export const mapReleaseInfo = (raw: RawGame): ReleaseInfo => ({ id: raw.id, ...mapRelease(raw) });

const platforms = (raw?: RawNamed[]) =>
    (raw ?? []).map((p) => ({ id: p.id, name: p.name, abbreviation: p.abbreviation ?? null }));

/**
 * Game types that are add-ons rather than something you'd own as a game. Matched by name; unknown
 * types are kept. IGDB's full list (checked live): Main Game, DLC, Expansion, Bundle, Standalone
 * Expansion, Mod, Episode, Season, Remake, Remaster, Expanded Game, Port, Fork, Pack / Addon, Update.
 *
 * Everything else is deliberately kept, because IGDB files real, ownable games under unexpected types:
 * "Bundle" is "Kingdom Hearts HD 1.5 + 2.5 Remix", "Update" is "The Witcher 3: Wild Hunt Remastered",
 * "Fork" is "Predecessor", "Episode" is "Deltarune: Chapter 1". When in doubt, show it: an extra search
 * result costs a glance, a hidden game costs the user the ability to add it at all.
 */
const EXCLUDED_TYPES = new Set(['dlc', 'mod', 'pack / addon']);

export function isCollectable(raw: Pick<RawGame, 'game_type'>): boolean {
    const type = typeof raw.game_type === 'object' ? raw.game_type?.type : undefined;
    return !type || !EXCLUDED_TYPES.has(type.toLowerCase());
}

export function mapSearchHit(raw: RawGame): IgdbSearchHit {
    return {
        id: raw.id,
        name: raw.name,
        year:
            raw.first_release_date === undefined
                ? null
                : new Date(raw.first_release_date * 1000).getUTCFullYear(),
        coverImageId: raw.cover?.image_id ?? null,
        rating: raw.total_rating === undefined ? null : Math.round(raw.total_rating),
        platforms: platforms(raw.platforms)
    };
}

export function mapGame(raw: RawGame, ttb?: RawTtb): GameRecord {
    const hasTtb = ttb && (ttb.hastily || ttb.normally || ttb.completely);
    return {
        id: raw.id,
        name: raw.name,
        slug: raw.slug ?? null,
        summary: raw.summary ?? null,
        ...mapRelease(raw),
        series: mapSeriesRefs(raw),
        coverImageId: raw.cover?.image_id ?? null,
        igdbRating: raw.total_rating === undefined ? null : Math.round(raw.total_rating),
        igdbRatingCount: raw.total_rating_count ?? null,
        gameType: typeof raw.game_type === 'object' ? (raw.game_type?.type ?? null) : null,
        platforms: platforms(raw.platforms),
        genres: (raw.genres ?? []).map((g) => ({ id: g.id, name: g.name })),
        themes: (raw.themes ?? []).map((t) => ({ id: t.id, name: t.name })),
        ttb: hasTtb
            ? {
                  hastilySeconds: ttb.hastily ?? null,
                  normallySeconds: ttb.normally ?? null,
                  completelySeconds: ttb.completely ?? null,
                  count: ttb.count ?? 0
              }
            : null
    };
}
