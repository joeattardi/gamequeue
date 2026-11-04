import type { EntryDto, SearchResultDto } from '@gamequeue/shared';
import type { StatusKey } from './statusColor';

/** Both the palette and the phone search start looking at this many characters. */
export const MIN_QUERY = 2;

/** All, only what is in the library, only what can be added, or one of the user's platforms. */
export type SearchScope = 'all' | 'library' | 'new' | `p:${number}`;

export const platformScope = (id: number): SearchScope => `p:${id}`;

export const normalizeQuery = (q: string) => q.trim().replace(/\s+/g, ' ');

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Splits `text` into pieces, marking the ones that match any word of the query (case-insensitive). */
export function highlight(text: string, query: string): { text: string; match: boolean }[] {
    const terms = normalizeQuery(query)
        .split(' ')
        .filter((t) => t.length > 0)
        .sort((a, b) => b.length - a.length);
    if (terms.length === 0 || !text) return [{ text, match: false }];
    const re = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
    const out: { text: string; match: boolean }[] = [];
    let last = 0;
    for (const m of text.matchAll(re)) {
        if (m.index > last) out.push({ text: text.slice(last, m.index), match: false });
        out.push({ text: m[0], match: true });
        last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ text: text.slice(last), match: false });
    return out;
}

/** 0 = the name is the query, 1 = starts with it, 2 = a word starts with it, 3 = contains it. */
function rank(name: string, query: string): number {
    const n = name.toLowerCase();
    const q = normalizeQuery(query).toLowerCase();
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
    if (n.includes(` ${q}`) || n.includes(`: ${q}`)) return 2;
    return 3;
}

/** Best matches first; equal ranks keep their incoming order (the library list is title-sorted). */
export function rankByQuery<T>(items: T[], name: (t: T) => string, query: string): T[] {
    return items
        .map((item, i) => ({ item, i, r: rank(name(item), query) }))
        .sort((a, b) => a.r - b.r || a.i - b.i)
        .map((x) => x.item);
}

/** What the user did to a result in this session, so its row can show the new status in place. */
export type AddedState = { status: StatusKey; entryId: number | null };

export interface ResultSet {
    /** Games in the library, best match first */
    library: EntryDto[];
    /** IGDB games to add (and ones just added this session, kept where they were) */
    add: SearchResultDto[];
    /** Counts before a platform scope, for the chips */
    counts: { all: number; library: number; add: number };
}

/** The state an IGDB row shows: addable, or already somewhere. */
export type IgdbRowState =
    | { kind: 'add' }
    | { kind: 'added'; status: StatusKey; entryId: number | null }
    | { kind: 'owned'; entryId: number }
    | { kind: 'wishlist' };

export function igdbRowState(r: SearchResultDto, added: Map<number, AddedState>): IgdbRowState {
    const a = added.get(r.igdbId);
    if (a) return { kind: 'added', ...a };
    if (r.entryId !== null) return { kind: 'owned', entryId: r.entryId };
    if (r.wishlisted) return { kind: 'wishlist' };
    return { kind: 'add' };
}

/**
 * Merges the library matches and the IGDB matches into the two groups both screens show. An IGDB
 * game that is already in the library is not offered again (its library row is the one to open)
 * unless the library list doesn't carry it, in which case it stays as an "owned" row. A game added
 * during this search stays in its place with its new state.
 */
export function buildResults(input: {
    query: string;
    entries: EntryDto[];
    igdb: SearchResultDto[];
    scope: SearchScope;
    added?: Map<number, AddedState>;
}): ResultSet {
    const added = input.added ?? new Map<number, AddedState>();
    const libraryIds = new Set(input.entries.map((e) => e.game.id));
    const library = rankByQuery(input.entries, (e) => e.game.name, input.query);
    const add = input.igdb.filter((r) => added.has(r.igdbId) || !libraryIds.has(r.igdbId));
    const counts = { all: library.length + add.length, library: library.length, add: add.length };

    const platformId = input.scope.startsWith('p:') ? Number(input.scope.slice(2)) : null;
    const showLibrary = input.scope !== 'new';
    const showAdd = input.scope !== 'library';
    return {
        library: showLibrary
            ? library.filter(
                  (e) => platformId === null || e.platforms.some((p) => p.id === platformId)
              )
            : [],
        add: showAdd
            ? add.filter((r) => platformId === null || r.platforms.some((p) => p.id === platformId))
            : [],
        counts
    };
}

/** One line under a title: the year, then up to three platforms and "+N" for the rest. */
export function metaParts(
    year: number | string | null,
    platforms: { abbreviation: string | null; name: string }[]
): string[] {
    const names = platforms.map((p) => p.abbreviation ?? p.name);
    const shown = names.slice(0, 3);
    const parts: string[] = [];
    if (year !== null && year !== '') parts.push(String(year));
    parts.push(...shown);
    if (names.length > 3) parts.push(`+${names.length - 3}`);
    return parts;
}

/**
 * The platform to preselect when adding a game: the one the user added most recently if the game
 * is on it, otherwise the game's first platform. Empty when IGDB lists no platform for the game.
 */
export function defaultPlatformIds(recent: number[], available: { id: number }[]): number[] {
    const known = new Set(available.map((p) => p.id));
    const hit = recent.find((id) => known.has(id));
    if (hit !== undefined) return [hit];
    return available[0] ? [available[0].id] : [];
}
