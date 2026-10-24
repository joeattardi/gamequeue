import type { EntryDto } from './collection.js';
import { toPublicEntry, type PublicEntryDto } from './profile.js';

export interface RecapPlaythrough {
    entryId: number;
    platformId: number | null;
    startedOn: string | null;
    endedOn: string | null;
    outcome: 'finished' | 'abandoned' | null;
    playtimeMinutes: number | null;
}

export type RecapArchetypeId =
    'collector' | 'marathoner' | 'sprinter' | 'returner' | 'explorer' | 'finisher' | 'steady';

export interface RecapRank {
    name: string;
    count: number;
}

/** Everything here is safe to show publicly: counts and games as `PublicEntryDto` (no notes). */
export interface RecapDto {
    year: number;
    /** Years with any activity (a finish, an abandon, a start or an added game), newest first */
    years: number[];
    /** Games finished in the year (a game counts once, however often it was finished) */
    finishedGames: number;
    /** Games finished the year before, to compare with */
    previousFinishedGames: number;
    /** Games dropped in the year */
    abandonedGames: number;
    /** Playthroughs begun in the year (unknown start dates never count) */
    startedCount: number;
    /** Games added to the collection in the year */
    addedCount: number;
    /** Finished games that had also been finished in an earlier year */
    replays: number;
    /** Play time the user entered, summed over the year's finished playthroughs */
    playMinutes: number;
    /** Finished playthroughs in the year with no play time entered */
    unrecordedCount: number;
    /** Games finished per month, January first (a game counts once per month) */
    months: number[];
    /** 1-12, the month with the most finishes (the earliest on a tie); null if none */
    busiestMonth: number | null;
    topGenres: RecapRank[];
    topPlatforms: RecapRank[];
    /** Finished games with a rating, best first */
    topRated: PublicEntryDto[];
    /** Average rating of the finished games that have one */
    averageRating: number | null;
    /** Finished games with a known time to beat: the longest, and the shortest if it's another game */
    longest: { entry: PublicEntryDto; minutes: number } | null;
    shortest: { entry: PublicEntryDto; minutes: number } | null;
    /** The playthrough that took the most days from start to finish, when both dates are known */
    longestHaul: { entry: PublicEntryDto; days: number } | null;
    firstFinish: { entry: PublicEntryDto; on: string } | null;
    lastFinish: { entry: PublicEntryDto; on: string } | null;
    /** Every game finished in the year, by finish date */
    games: PublicEntryDto[];
    /** A playful label for the year; null when nothing was finished */
    archetype: { id: RecapArchetypeId; title: string; blurb: string } | null;
}

export const RECAP_TOP_N = 3;
const TOP_RATED = 5;

/** A year the API accepts. */
export const isRecapYear = (year: string) => /^\d{4}$/.test(year) && Number(year) >= 1970;

const yearOfDate = (date: string | null) => (date ? Number(date.slice(0, 4)) : null);

function daysBetween(from: string, to: string): number {
    return Math.round(
        (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
    );
}

function rank(names: string[]): RecapRank[] {
    const rows = new Map<string, RecapRank>();
    for (const name of names) {
        const key = name.toLowerCase();
        const row = rows.get(key) ?? rows.set(key, { name, count: 0 }).get(key)!;
        row.count++;
    }
    return [...rows.values()]
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, RECAP_TOP_N);
}

/** The year to show when none was asked for: this one if it has activity, else the latest. */
export function defaultRecapYear(years: number[], now: Date): number {
    const current = now.getUTCFullYear();
    return years.includes(current) ? current : (years[0] ?? current);
}

function pickArchetype(r: {
    finished: number;
    abandoned: number;
    added: number;
    replays: number;
    genres: number;
    averageMinutes: number | null;
}): RecapDto['archetype'] {
    if (r.finished === 0) return null;
    const n = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`;
    if (r.added >= 5 && r.added >= r.finished * 2)
        return {
            id: 'collector',
            title: 'The Collector',
            blurb: `You added ${n(r.added, 'game')} and finished ${r.finished}. The shelf is growing faster than the playing.`
        };
    if (r.averageMinutes !== null && r.averageMinutes >= 30 * 60)
        return {
            id: 'marathoner',
            title: 'The Marathoner',
            blurb: `Your finished games averaged ${Math.round(r.averageMinutes / 60)} hours each. You like to settle in.`
        };
    if (r.finished >= 5 && r.averageMinutes !== null && r.averageMinutes <= 8 * 60)
        return {
            id: 'sprinter',
            title: 'The Sprinter',
            blurb: `${r.finished} games at about ${Math.max(1, Math.round(r.averageMinutes / 60))} hours each. Short and sweet.`
        };
    if (r.replays >= 2 && r.replays * 4 >= r.finished)
        return {
            id: 'returner',
            title: 'The Returner',
            blurb: `${n(r.replays, 'old favourite')} got another finish this year. Some games are worth a second lap.`
        };
    if (r.finished >= 6 && r.genres >= 6)
        return {
            id: 'explorer',
            title: 'The Explorer',
            blurb: `${r.genres} different genres in ${r.finished} games. You go wherever the good stuff is.`
        };
    if (r.finished >= 5 && r.abandoned === 0)
        return {
            id: 'finisher',
            title: 'The Finisher',
            blurb: `${r.finished} games started, ${r.finished} games seen through, none dropped.`
        };
    return {
        id: 'steady',
        title: 'The Steady Player',
        blurb: `${n(r.finished, 'game')} finished, one at a time.`
    };
}

/** Pure: the "year in review" from the collection and every playthrough. */
export function computeRecap(
    entries: EntryDto[],
    playthroughs: RecapPlaythrough[],
    requestedYear?: number,
    now = new Date()
): RecapDto {
    const byId = new Map(entries.map((e) => [e.id, e]));

    const activity = new Set<number>();
    for (const e of entries) activity.add(new Date(e.addedAt).getUTCFullYear());
    for (const p of playthroughs) {
        const started = yearOfDate(p.startedOn);
        const ended = p.outcome ? yearOfDate(p.endedOn) : null;
        if (started !== null) activity.add(started);
        if (ended !== null) activity.add(ended);
    }
    const years = [...activity].sort((a, b) => b - a);
    const year = requestedYear ?? defaultRecapYear(years, now);

    const finishedIn = (y: number) =>
        playthroughs.filter((p) => p.outcome === 'finished' && yearOfDate(p.endedOn) === y);

    const thisYear = finishedIn(year);
    const finishedIds = new Set(thisYear.map((p) => p.entryId));
    const previousFinishedGames = new Set(finishedIn(year - 1).map((p) => p.entryId)).size;
    const abandoned = new Set(
        playthroughs
            .filter((p) => p.outcome === 'abandoned' && yearOfDate(p.endedOn) === year)
            .map((p) => p.entryId)
    );
    const startedCount = playthroughs.filter((p) => yearOfDate(p.startedOn) === year).length;
    const addedCount = entries.filter((e) => new Date(e.addedAt).getUTCFullYear() === year).length;
    const replays = [...finishedIds].filter((id) =>
        playthroughs.some(
            (p) =>
                p.entryId === id &&
                p.outcome === 'finished' &&
                (yearOfDate(p.endedOn) ?? year) < year
        )
    ).length;

    let playMinutes = 0;
    let unrecordedCount = 0;
    const perMonth = Array.from({ length: 12 }, () => new Set<number>());
    for (const p of thisYear) {
        if (p.playtimeMinutes === null) unrecordedCount++;
        else playMinutes += p.playtimeMinutes;
        perMonth[Number(p.endedOn!.slice(5, 7)) - 1]?.add(p.entryId);
    }
    const months = perMonth.map((s) => s.size);
    const peak = Math.max(...months);
    const busiestMonth = peak > 0 ? months.indexOf(peak) + 1 : null;

    // One row per finished game, in the order they were finished (its last finish of the year)
    const lastEnd = new Map<number, string>();
    for (const p of thisYear)
        if (!lastEnd.has(p.entryId) || p.endedOn! > lastEnd.get(p.entryId)!)
            lastEnd.set(p.entryId, p.endedOn!);
    const finished = [...lastEnd]
        .flatMap(([id, on]) => {
            const entry = byId.get(id);
            return entry ? [{ entry, on }] : [];
        })
        .sort(
            (a, b) => a.on.localeCompare(b.on) || a.entry.game.name.localeCompare(b.entry.game.name)
        );
    const finishedEntries = finished.map((f) => f.entry);

    // A game listing a genre twice (or in different case) counts once; first spelling wins
    const genreNames = finishedEntries.flatMap((e) => {
        const seen = new Set<string>();
        return e.game.genres.filter((g) => !seen.has(g.toLowerCase()) && seen.add(g.toLowerCase()));
    });
    const platformNames = thisYear.flatMap((p) => {
        const e = byId.get(p.entryId);
        const platform = [...(e?.platforms ?? []), ...(e?.game.platforms ?? [])].find(
            (x) => x.id === p.platformId
        );
        return platform ? [platform.name] : [];
    });

    const rated = finishedEntries.filter((e) => e.rating !== null);
    const timed = finishedEntries
        .filter((e) => e.ttbMinutes !== null)
        .sort((a, b) => b.ttbMinutes! - a.ttbMinutes! || a.game.name.localeCompare(b.game.name));
    const longest = timed[0];
    const shortest = timed.length > 1 ? timed[timed.length - 1] : undefined;

    let haul: { entry: EntryDto; days: number } | null = null;
    for (const p of thisYear) {
        const entry = byId.get(p.entryId);
        if (!entry || !p.startedOn || p.startedOn > p.endedOn!) continue;
        const days = daysBetween(p.startedOn, p.endedOn!);
        if (!haul || days > haul.days) haul = { entry, days };
    }

    const timedMinutes = timed.map((e) => e.ttbMinutes!);
    const first = finished[0];
    const last = finished[finished.length - 1];
    return {
        year,
        years,
        finishedGames: finishedIds.size,
        previousFinishedGames,
        abandonedGames: abandoned.size,
        startedCount,
        addedCount,
        replays,
        playMinutes,
        unrecordedCount,
        months,
        busiestMonth,
        topGenres: rank(genreNames),
        topPlatforms: rank(platformNames),
        topRated: [...rated]
            .sort(
                (a, b) =>
                    b.rating! - a.rating! || a.game.name.localeCompare(b.game.name) || a.id - b.id
            )
            .slice(0, TOP_RATED)
            .map(toPublicEntry),
        averageRating: rated.length
            ? Math.round((rated.reduce((n, e) => n + e.rating!, 0) / rated.length) * 10) / 10
            : null,
        longest: longest ? { entry: toPublicEntry(longest), minutes: longest.ttbMinutes! } : null,
        shortest: shortest
            ? { entry: toPublicEntry(shortest), minutes: shortest.ttbMinutes! }
            : null,
        longestHaul: haul ? { entry: toPublicEntry(haul.entry), days: haul.days } : null,
        firstFinish: first ? { entry: toPublicEntry(first.entry), on: first.on } : null,
        lastFinish: last ? { entry: toPublicEntry(last.entry), on: last.on } : null,
        games: finishedEntries.map(toPublicEntry),
        archetype: pickArchetype({
            finished: finishedIds.size,
            abandoned: abandoned.size,
            added: addedCount,
            replays,
            genres: new Set(genreNames.map((g) => g.toLowerCase())).size,
            averageMinutes: timedMinutes.length
                ? timedMinutes.reduce((a, b) => a + b, 0) / timedMinutes.length
                : null
        })
    };
}
