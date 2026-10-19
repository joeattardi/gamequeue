import { ENTRY_STATUSES, type EntryDto, type EntryStatus } from './collection.js';
import { toPublicEntry, type PublicEntryDto } from './profile.js';

/** The `year` of a finish with no known date, as on the profile's finished pages. */
export const STATS_UNKNOWN_YEAR = 'unknown';

export interface BreakdownRow {
    name: string;
    total: number;
    finished: number;
    unplayed: number;
}

/** Everything here is safe to show publicly: counts, plus games as `PublicEntryDto` (no notes). */
export interface StatsDto {
    overview: {
        total: number;
        byStatus: Record<EntryStatus, number>;
        /** Unplayed games */
        backlogCount: number;
        /** Sum of time to beat of backlog games that have one */
        backlogMinutes: number;
        /** Backlog games with no known time to beat (not in `backlogMinutes`) */
        backlogUnknown: number;
        ratedCount: number;
        /** null when nothing is rated */
        averageRating: number | null;
    };
    finished: {
        /** Games finished per year (a game counts once per year), oldest first, `unknown` last */
        years: { year: string; count: number }[];
        /** The last 12 months including this one, oldest first (unknown dates are skipped) */
        months: { month: string; count: number }[];
    };
    /** The biggest few of each, by number of games */
    breakdowns: { platforms: BreakdownRow[]; genres: BreakdownRow[]; tags: BreakdownRow[] };
    ratings: {
        /** One row per star, 1 to RATING_MAX */
        distribution: { rating: number; count: number }[];
        top: PublicEntryDto[];
    };
    playtime: {
        /** Time to beat summed over finished playthroughs (a replay counts again). An estimate, not tracked time. */
        estimatedMinutes: number;
        finishes: number;
        /** Finished playthroughs of games with no known time to beat */
        unknownCount: number;
    };
}

export interface Finish {
    entryId: number;
    endedOn: string | null;
}

export const STATS_TOP_N = 10;
const TOP_RATED = 8;
const RATING_STARS = [1, 2, 3, 4, 5];

function breakdown(
    entries: EntryDto[],
    namesOf: (e: EntryDto) => string[],
    limit: number
): BreakdownRow[] {
    const rows = new Map<string, BreakdownRow & { key: string }>();
    for (const e of entries) {
        // A game listing a name twice (or in different case) still counts once; first spelling wins
        const seen = new Set<string>();
        for (const name of namesOf(e)) {
            if (seen.has(name.toLowerCase())) continue;
            seen.add(name.toLowerCase());
            const key = name.toLowerCase();
            const row =
                rows.get(key) ??
                rows.set(key, { key, name, total: 0, finished: 0, unplayed: 0 }).get(key)!;
            row.total++;
            if (e.status === 'finished') row.finished++;
            if (e.status === 'unplayed') row.unplayed++;
        }
    }
    return [...rows.values()]
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
        .slice(0, limit)
        .map(({ name, total, finished, unplayed }) => ({ name, total, finished, unplayed }));
}

/** Pure: the whole stats page from the collection and the finished playthroughs. */
export function computeStats(entries: EntryDto[], finishes: Finish[], now = new Date()): StatsDto {
    const byStatus = Object.fromEntries(ENTRY_STATUSES.map((s) => [s, 0])) as Record<
        EntryStatus,
        number
    >;
    let backlogMinutes = 0;
    let backlogUnknown = 0;
    let ratingSum = 0;
    const stars = new Map(RATING_STARS.map((r) => [r, 0]));
    for (const e of entries) {
        byStatus[e.status]++;
        if (e.status === 'unplayed') {
            if (e.ttbMinutes === null) backlogUnknown++;
            else backlogMinutes += e.ttbMinutes;
        }
        if (e.rating !== null) {
            ratingSum += e.rating;
            stars.set(e.rating, (stars.get(e.rating) ?? 0) + 1);
        }
    }
    const rated = entries.filter((e) => e.rating !== null);

    const perYear = new Map<string, Set<number>>();
    const perMonth = new Map<string, Set<number>>();
    for (const f of finishes) {
        const year = f.endedOn?.slice(0, 4) ?? STATS_UNKNOWN_YEAR;
        (perYear.get(year) ?? perYear.set(year, new Set()).get(year)!).add(f.entryId);
        if (f.endedOn) {
            const month = f.endedOn.slice(0, 7);
            (perMonth.get(month) ?? perMonth.set(month, new Set()).get(month)!).add(f.entryId);
        }
    }
    const months = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - i), 1));
        const month = d.toISOString().slice(0, 7);
        return { month, count: perMonth.get(month)?.size ?? 0 };
    });

    const ttbOf = new Map(entries.map((e) => [e.id, e.ttbMinutes]));
    let estimatedMinutes = 0;
    let unknownCount = 0;
    let counted = 0;
    for (const f of finishes) {
        if (!ttbOf.has(f.entryId)) continue;
        counted++;
        const ttb = ttbOf.get(f.entryId)!;
        if (ttb === null) unknownCount++;
        else estimatedMinutes += ttb;
    }

    return {
        overview: {
            total: entries.length,
            byStatus,
            backlogCount: byStatus.unplayed,
            backlogMinutes,
            backlogUnknown,
            ratedCount: rated.length,
            averageRating: rated.length ? Math.round((ratingSum / rated.length) * 10) / 10 : null
        },
        finished: {
            years: [...perYear]
                .map(([year, ids]) => ({ year, count: ids.size }))
                .sort((a, b) =>
                    a.year === STATS_UNKNOWN_YEAR
                        ? 1
                        : b.year === STATS_UNKNOWN_YEAR
                          ? -1
                          : a.year.localeCompare(b.year)
                ),
            months
        },
        breakdowns: {
            platforms: breakdown(entries, (e) => e.platforms.map((p) => p.name), STATS_TOP_N),
            genres: breakdown(entries, (e) => e.game.genres, STATS_TOP_N),
            tags: breakdown(entries, (e) => e.tags, STATS_TOP_N)
        },
        ratings: {
            distribution: RATING_STARS.map((rating) => ({ rating, count: stars.get(rating) ?? 0 })),
            top: [...rated]
                .sort(
                    (a, b) =>
                        b.rating! - a.rating! ||
                        a.game.name.localeCompare(b.game.name) ||
                        a.id - b.id
                )
                .slice(0, TOP_RATED)
                .map(toPublicEntry)
        },
        playtime: { estimatedMinutes, finishes: counted, unknownCount }
    };
}
