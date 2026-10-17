import type { GameRecord, IgdbSearchHit } from "./types.js";

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

const platforms = (raw?: RawNamed[]) =>
  (raw ?? []).map((p) => ({ id: p.id, name: p.name, abbreviation: p.abbreviation ?? null }));

/** Game types we don't want in a personal collection. Matched by name; unknown types are kept. */
const EXCLUDED_TYPES = new Set(["dlc", "dlc addon", "bundle", "mod", "episode", "season", "pack", "update", "fork"]);

export function isCollectable(raw: Pick<RawGame, "game_type">): boolean {
  const type = typeof raw.game_type === "object" ? raw.game_type?.type : undefined;
  return !type || !EXCLUDED_TYPES.has(type.toLowerCase());
}

export function mapSearchHit(raw: RawGame): IgdbSearchHit {
  return {
    id: raw.id,
    name: raw.name,
    year: raw.first_release_date === undefined ? null : new Date(raw.first_release_date * 1000).getUTCFullYear(),
    coverImageId: raw.cover?.image_id ?? null,
    platforms: platforms(raw.platforms),
  };
}

export function mapGame(raw: RawGame, ttb?: RawTtb): GameRecord {
  const hasTtb = ttb && (ttb.hastily || ttb.normally || ttb.completely);
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug ?? null,
    summary: raw.summary ?? null,
    releaseDate: toIsoDate(raw.first_release_date),
    coverImageId: raw.cover?.image_id ?? null,
    igdbRating: raw.total_rating === undefined ? null : Math.round(raw.total_rating),
    igdbRatingCount: raw.total_rating_count ?? null,
    gameType: typeof raw.game_type === "object" ? (raw.game_type?.type ?? null) : null,
    platforms: platforms(raw.platforms),
    genres: (raw.genres ?? []).map((g) => ({ id: g.id, name: g.name })),
    themes: (raw.themes ?? []).map((t) => ({ id: t.id, name: t.name })),
    ttb: hasTtb
      ? {
          hastilySeconds: ttb.hastily ?? null,
          normallySeconds: ttb.normally ?? null,
          completelySeconds: ttb.completely ?? null,
          count: ttb.count ?? 0,
        }
      : null,
  };
}
