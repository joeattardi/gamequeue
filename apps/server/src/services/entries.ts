import {
    and,
    asc,
    count,
    desc,
    eq,
    exists,
    inArray,
    isNotNull,
    ne,
    or,
    sql,
    type AnyColumn,
    type SQL
} from 'drizzle-orm';
import type {
    AddEntryInput,
    EntriesPageDto,
    EntryDto,
    EntryQuery,
    FacetCountsDto,
    FacetsDto,
    GameDto,
    PageQuery,
    PatchEntryInput,
    PlatformDto,
    PlaythroughDto
} from '@gamequeue/shared';
import { ENTRY_STATUSES } from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import {
    entries,
    entryPlatforms,
    entryTags,
    listItems,
    lists,
    gameGenres,
    gameSeries,
    series,
    gamePlatforms,
    games,
    gameThemes,
    genres,
    platforms,
    playthroughs,
    slots,
    tags,
    themes
} from '../db/schema.js';
import { HttpError } from '../errors.js';
import type { IgdbClient } from '../igdb/types.js';
import { ensureGame, existingPlatformIds, loadGames } from './games.js';
import { toDto } from './playthrough-dto.js';
import { dropFromWishlists } from './wishlist.js';

const dedupeTags = (names: string[]) => {
    const seen = new Map<string, string>();
    for (const n of names) {
        const name = n.trim();
        if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
    }
    return [...seen.values()];
};

function assertPlatformsExist(db: Db, ids: number[]) {
    const known = existingPlatformIds(db, ids);
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length) throw new HttpError(400, `Unknown platform id(s): ${missing.join(', ')}`);
}

/** Replaces an entry's tag set, creating tags as needed (case-insensitive, first spelling wins). */
export function setTags(db: Db, userId: number, entryId: number, names: string[]) {
    const wanted = dedupeTags(names);
    db.delete(entryTags).where(eq(entryTags.entryId, entryId)).run();
    for (const name of wanted) {
        db.insert(tags).values({ userId, name }).onConflictDoNothing().run();
        const tag = db
            .select({ id: tags.id })
            .from(tags)
            .where(and(eq(tags.userId, userId), sql`lower(${tags.name}) = lower(${name})`))
            .get()!;
        db.insert(entryTags).values({ entryId, tagId: tag.id }).onConflictDoNothing().run();
    }
    // Drop tags nothing uses any more so the tag list doesn't accumulate cruft
    db.delete(tags)
        .where(and(eq(tags.userId, userId), sql`${tags.id} NOT IN (SELECT tag_id FROM entry_tags)`))
        .run();
}

const utcToday = () => new Date().toISOString().slice(0, 10);

export async function addEntry(
    db: Db,
    igdb: IgdbClient | undefined,
    userId: number,
    input: AddEntryInput
) {
    const existing = db
        .select({ id: entries.id })
        .from(entries)
        .where(and(eq(entries.userId, userId), eq(entries.gameId, input.igdbId)))
        .get();
    if (existing)
        throw new HttpError(409, 'That game is already in your collection', {
            entryId: existing.id
        });

    await ensureGame(db, igdb, input.igdbId);
    const platformIds = [...new Set(input.platformIds)];
    assertPlatformsExist(db, platformIds);

    const id = db.transaction((tx) => {
        const t = tx as unknown as Db;
        const row = t
            .insert(entries)
            .values({ userId, gameId: input.igdbId, status: input.status ?? 'unplayed' })
            .returning({ id: entries.id })
            .get();
        t.insert(entryPlatforms)
            .values(platformIds.map((platformId) => ({ entryId: row.id, platformId })))
            .run();
        // Pre-fill tags from IGDB genres + themes (lowercased) unless the caller supplied their own
        const fromIgdb = () =>
            [
                ...t
                    .select({ name: genres.name })
                    .from(gameGenres)
                    .innerJoin(genres, eq(genres.id, gameGenres.genreId))
                    .where(eq(gameGenres.gameId, input.igdbId))
                    .all(),
                ...t
                    .select({ name: themes.name })
                    .from(gameThemes)
                    .innerJoin(themes, eq(themes.id, gameThemes.themeId))
                    .where(eq(gameThemes.gameId, input.igdbId))
                    .all()
            ].map((r) => r.name.toLowerCase());
        setTags(t, userId, row.id, input.tags ?? fromIgdb());
        // Pre-existing history: one playthrough that matches the status (never slotted or queued)
        if (input.status === 'paused' || input.status === 'abandoned') {
            t.insert(playthroughs)
                .values({
                    userId,
                    entryId: row.id,
                    platformId: platformIds.length === 1 ? platformIds[0]! : null,
                    startedOn: input.status === 'paused' ? (input.date ?? utcToday()) : null,
                    endedOn: null,
                    outcome: input.status === 'abandoned' ? 'abandoned' : null
                })
                .run();
        }
        // Owning it ends the wish
        dropFromWishlists(t, userId, input.igdbId);
        return row.id;
    });
    return getEntry(db, userId, id)!;
}

export function patchEntry(db: Db, userId: number, entryId: number, patch: PatchEntryInput) {
    const current = db
        .select({ id: entries.id })
        .from(entries)
        .where(and(eq(entries.id, entryId), eq(entries.userId, userId)))
        .get();
    if (!current) throw new HttpError(404, 'Entry not found');
    const platformIds = patch.platformIds ? [...new Set(patch.platformIds)] : undefined;
    if (platformIds) assertPlatformsExist(db, platformIds);

    db.transaction((tx) => {
        const t = tx as unknown as Db;
        const set: Partial<typeof entries.$inferInsert> = {};
        // Favoriting alone isn't a change to the game: it must not reset "last changed"
        if (Object.keys(patch).some((k) => k !== 'favorite')) set.updatedAt = Date.now();
        if (patch.favorite !== undefined) set.favorite = patch.favorite;
        if (patch.rating !== undefined) set.rating = patch.rating;
        if (patch.notes !== undefined) set.notes = patch.notes;
        if (patch.ttbOverrideMinutes !== undefined)
            set.ttbOverrideMinutes = patch.ttbOverrideMinutes;
        if (Object.keys(set).length > 0)
            t.update(entries).set(set).where(eq(entries.id, entryId)).run();
        if (platformIds) {
            t.delete(entryPlatforms).where(eq(entryPlatforms.entryId, entryId)).run();
            t.insert(entryPlatforms)
                .values(platformIds.map((platformId) => ({ entryId, platformId })))
                .run();
        }
        if (patch.tags) setTags(t, userId, entryId, patch.tags);
    });
    return getEntry(db, userId, entryId)!;
}

export function deleteEntry(db: Db, userId: number, entryId: number): boolean {
    const res = db
        .delete(entries)
        .where(and(eq(entries.id, entryId), eq(entries.userId, userId)))
        .run();
    if (res.changes > 0) {
        db.delete(tags)
            .where(
                and(eq(tags.userId, userId), sql`${tags.id} NOT IN (SELECT tag_id FROM entry_tags)`)
            )
            .run();
    }
    return res.changes > 0;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const effectiveTtbSeconds = sql<
    number | null
>`coalesce(${entries.ttbOverrideMinutes} * 60, ${games.ttbNormallySeconds})`;

function buildOrder(q: EntryQuery): SQL[] {
    const defaultDir = {
        title: 'asc',
        added: 'desc',
        release: 'desc',
        rating: 'desc',
        ttb: 'asc'
    } as const;
    const dir = q.dir ?? defaultDir[q.sort];
    const d = dir === 'asc' ? asc : desc;
    const key: Record<EntryQuery['sort'], SQL | AnyColumn> = {
        title: sql`lower(${games.name})`,
        added: entries.addedAt,
        release: games.releaseDate,
        rating: entries.rating,
        ttb: effectiveTtbSeconds
    };
    const k = key[q.sort];
    // Missing values always sort last, whichever direction
    return [sql`${k} IS NULL`, d(k), asc(sql`lower(${games.name})`), asc(entries.id)];
}

type Facet = 'status' | 'platform' | 'genre' | 'series' | 'tag' | 'favorite';

/** Conditions for a query. `omit` leaves one facet out, which is how facet counts are computed. */
function filterWhere(db: Db, userId: number, q: EntryQuery, omit?: Facet): SQL[] {
    const where: SQL[] = [eq(entries.userId, userId)];
    if (q.view === 'backlog') where.push(eq(entries.status, 'unplayed'));
    else if (q.status?.length && omit !== 'status') where.push(inArray(entries.status, q.status));
    if (q.platform?.length && omit !== 'platform')
        where.push(
            exists(
                db
                    .select({ x: sql`1` })
                    .from(entryPlatforms)
                    .where(
                        and(
                            eq(entryPlatforms.entryId, entries.id),
                            inArray(entryPlatforms.platformId, q.platform)
                        )
                    )
            )
        );
    if (q.genre?.length && omit !== 'genre')
        where.push(
            exists(
                db
                    .select({ x: sql`1` })
                    .from(gameGenres)
                    .where(
                        and(
                            eq(gameGenres.gameId, entries.gameId),
                            inArray(gameGenres.genreId, q.genre)
                        )
                    )
            )
        );
    if (q.series?.length && omit !== 'series')
        where.push(
            exists(
                db
                    .select({ x: sql`1` })
                    .from(gameSeries)
                    .where(
                        and(
                            eq(gameSeries.gameId, entries.gameId),
                            inArray(gameSeries.seriesId, q.series)
                        )
                    )
            )
        );
    if (q.tag?.length && omit !== 'tag')
        where.push(
            exists(
                db
                    .select({ x: sql`1` })
                    .from(entryTags)
                    .innerJoin(tags, eq(tags.id, entryTags.tagId))
                    .where(
                        and(
                            eq(entryTags.entryId, entries.id),
                            inArray(
                                sql`lower(${tags.name})`,
                                q.tag.map((t) => t.toLowerCase())
                            )
                        )
                    )
            )
        );
    if (q.favorite && omit !== 'favorite') where.push(eq(entries.favorite, true));
    if (q.q) where.push(sql`instr(lower(${games.name}), lower(${q.q})) > 0`);
    return where;
}

/** Every match: for server-side work (stats, pick, smart lists, exports). The API pages instead. */
export function listEntries(db: Db, userId: number, q: EntryQuery): EntryDto[] {
    return pageEntries(db, userId, q).entries;
}

/** One page of matches (all of them when `page` is omitted) plus the number of matches overall. */
export function pageEntries(
    db: Db,
    userId: number,
    q: EntryQuery,
    page?: PageQuery
): EntriesPageDto {
    const where = and(...filterWhere(db, userId, q));
    const total = db
        .select({ n: count() })
        .from(entries)
        .innerJoin(games, eq(games.id, entries.gameId))
        .where(where)
        .get()!.n;
    const query = db
        .select({ id: entries.id })
        .from(entries)
        .innerJoin(games, eq(games.id, entries.gameId))
        .where(where)
        .orderBy(...buildOrder(q));
    const ids = (page ? query.limit(page.limit).offset(page.offset) : query).all().map((r) => r.id);
    return { entries: hydrate(db, userId, ids), total };
}

/**
 * Games to put in a slot: the queue first (in order), then playing, paused and unplayed, each by
 * title. Finished and abandoned games are only offered if they're queued.
 */
export function pageSlotCandidates(
    db: Db,
    userId: number,
    opts: { q?: string; excludeEntryId?: number },
    page: PageQuery
): EntriesPageDto {
    const queue = db
        .select({ id: lists.id })
        .from(lists)
        .where(and(eq(lists.userId, userId), eq(lists.kind, 'queue')))
        .get();
    const queuedAt = sql<
        number | null
    >`(select ${listItems.position} from ${listItems} where ${listItems.listId} = ${queue?.id ?? 0} and ${listItems.entryId} = ${entries.id})`;
    const where = and(
        eq(entries.userId, userId),
        or(isNotNull(queuedAt), inArray(entries.status, ['playing', 'paused', 'unplayed'])),
        opts.excludeEntryId ? ne(entries.id, opts.excludeEntryId) : undefined,
        opts.q ? sql`instr(lower(${games.name}), lower(${opts.q})) > 0` : undefined
    );
    const total = db
        .select({ n: count() })
        .from(entries)
        .innerJoin(games, eq(games.id, entries.gameId))
        .where(where)
        .get()!.n;
    const ids = db
        .select({ id: entries.id })
        .from(entries)
        .innerJoin(games, eq(games.id, entries.gameId))
        .where(where)
        .orderBy(
            sql`${queuedAt} IS NULL`,
            asc(queuedAt),
            sql`case ${entries.status} when 'playing' then 0 when 'paused' then 1 else 2 end`,
            asc(sql`lower(${games.name})`),
            asc(entries.id)
        )
        .limit(page.limit)
        .offset(page.offset)
        .all()
        .map((r) => r.id);
    return { entries: hydrate(db, userId, ids), total };
}

export function getEntry(db: Db, userId: number, id: number): EntryDto | undefined {
    return hydrate(db, userId, [id])[0];
}

/** Loads full DTOs for the given entry ids, preserving their order. */
export function hydrate(db: Db, userId: number, ids: number[]): EntryDto[] {
    if (ids.length === 0) return [];
    // Chunked to stay clear of SQLite's bound-parameter limit on very large collections
    const chunks: number[][] = [];
    for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500));

    const rows = new Map<
        number,
        { e: typeof entries.$inferSelect; g: typeof games.$inferSelect }
    >();
    const owned = new Map<number, PlatformDto[]>();
    const tagMap = new Map<number, string[]>();
    const history = new Map<number, PlaythroughDto[]>();
    const slotOf = new Map<number, number>();
    const listsOf = new Map<number, { id: number; name: string }[]>();
    const queued = new Set<number>();
    const gameIds = new Set<number>();

    for (const chunk of chunks) {
        for (const r of db
            .select({ e: entries, g: games })
            .from(entries)
            .innerJoin(games, eq(games.id, entries.gameId))
            .where(and(eq(entries.userId, userId), inArray(entries.id, chunk)))
            .all()) {
            rows.set(r.e.id, r);
            gameIds.add(r.g.id);
        }
        for (const r of db
            .select({ entryId: entryPlatforms.entryId, p: platforms })
            .from(entryPlatforms)
            .innerJoin(platforms, eq(platforms.id, entryPlatforms.platformId))
            .where(inArray(entryPlatforms.entryId, chunk))
            .orderBy(asc(platforms.name))
            .all()) {
            (owned.get(r.entryId) ?? owned.set(r.entryId, []).get(r.entryId)!).push(r.p);
        }
        for (const r of db
            .select({ p: playthroughs, platform: platforms })
            .from(playthroughs)
            .leftJoin(platforms, eq(platforms.id, playthroughs.platformId))
            .where(inArray(playthroughs.entryId, chunk))
            .all()) {
            (history.get(r.p.entryId) ?? history.set(r.p.entryId, []).get(r.p.entryId)!).push(
                toDto(r.p, r.platform)
            );
        }
        for (const r of db
            .select({ entryId: slots.entryId, id: slots.id })
            .from(slots)
            .where(and(eq(slots.userId, userId), inArray(slots.entryId, chunk)))
            .all()) {
            slotOf.set(r.entryId!, r.id);
        }
        for (const r of db
            .select({
                entryId: listItems.entryId,
                id: lists.id,
                name: lists.name,
                kind: lists.kind
            })
            .from(listItems)
            .innerJoin(lists, eq(lists.id, listItems.listId))
            .where(inArray(listItems.entryId, chunk))
            .orderBy(asc(sql`lower(${lists.name})`))
            .all()) {
            if (r.kind === 'queue') {
                queued.add(r.entryId);
                continue;
            }
            (listsOf.get(r.entryId) ?? listsOf.set(r.entryId, []).get(r.entryId)!).push({
                id: r.id,
                name: r.name
            });
        }
        for (const r of db
            .select({ entryId: entryTags.entryId, name: tags.name })
            .from(entryTags)
            .innerJoin(tags, eq(tags.id, entryTags.tagId))
            .where(inArray(entryTags.entryId, chunk))
            .orderBy(asc(sql`lower(${tags.name})`))
            .all()) {
            (tagMap.get(r.entryId) ?? tagMap.set(r.entryId, []).get(r.entryId)!).push(r.name);
        }
    }

    const gameDtos = loadGames(db, [...gameIds]);

    const minutes = (s: number | null) => (s === null ? null : Math.round(s / 60));
    return ids.flatMap((id) => {
        const r = rows.get(id);
        if (!r) return [];
        const { e, g } = r;
        return [
            {
                id: e.id,
                status: e.status,
                rating: e.rating,
                favorite: e.favorite,
                notes: e.notes,
                ttbOverrideMinutes: e.ttbOverrideMinutes,
                ttbMinutes: e.ttbOverrideMinutes ?? minutes(g.ttbNormallySeconds),
                addedAt: e.addedAt,
                updatedAt: e.updatedAt,
                slotId: slotOf.get(e.id) ?? null,
                lists: listsOf.get(e.id) ?? [],
                queued: queued.has(e.id),
                playthroughCount: history.get(e.id)?.length ?? 0,
                openPlaythrough: history.get(e.id)?.find((p) => p.outcome === null) ?? null,
                lastFinishedOn:
                    (history.get(e.id) ?? [])
                        .filter((p) => p.outcome === 'finished' && p.endedOn)
                        .map((p) => p.endedOn!)
                        .sort()
                        .at(-1) ?? null,
                finishedYears: [
                    ...new Set(
                        (history.get(e.id) ?? [])
                            .filter((p) => p.outcome === 'finished' && p.endedOn)
                            .map((p) => Number(p.endedOn!.slice(0, 4)))
                    )
                ].sort((a, b) => a - b),
                platforms: owned.get(e.id) ?? [],
                tags: tagMap.get(e.id) ?? [],
                game: gameDtos.get(g.id)!
            }
        ];
    });
}

/** Filter options drawn from what the user actually owns. */
export function getFacets(db: Db, userId: number): FacetsDto {
    return {
        platforms: db
            .selectDistinct({
                id: platforms.id,
                name: platforms.name,
                abbreviation: platforms.abbreviation
            })
            .from(entryPlatforms)
            .innerJoin(entries, eq(entries.id, entryPlatforms.entryId))
            .innerJoin(platforms, eq(platforms.id, entryPlatforms.platformId))
            .where(eq(entries.userId, userId))
            .orderBy(asc(sql`lower(${platforms.name})`))
            .all(),
        tags: db
            .select({ name: tags.name })
            .from(tags)
            .where(eq(tags.userId, userId))
            .orderBy(asc(sql`lower(${tags.name})`))
            .all()
            .map((t) => t.name),
        genres: db
            .selectDistinct({ id: genres.id, name: genres.name })
            .from(entries)
            .innerJoin(gameGenres, eq(gameGenres.gameId, entries.gameId))
            .innerJoin(genres, eq(genres.id, gameGenres.genreId))
            .where(eq(entries.userId, userId))
            .orderBy(asc(genres.name))
            .all(),
        finishedYears: db
            .selectDistinct({ year: sql<string>`substr(${playthroughs.endedOn}, 1, 4)` })
            .from(playthroughs)
            .where(
                and(
                    eq(playthroughs.userId, userId),
                    eq(playthroughs.outcome, 'finished'),
                    isNotNull(playthroughs.endedOn)
                )
            )
            .all()
            .map((r) => Number(r.year))
            .sort((a, b) => b - a)
    };
}

/**
 * Facet options with counts. Each facet's counts apply every other active filter but not its own
 * selection, so picking a value shows what the alternatives would add rather than collapsing to 0.
 */
export function getFacetCounts(db: Db, userId: number, q: EntryQuery): FacetCountsDto {
    const base = getFacets(db, userId);
    const count = <K extends string | number>(rows: { key: K; n: number }[]) =>
        new Map(rows.map((r) => [r.key, r.n]));
    const n = sql<number>`count(distinct ${entries.id})`;
    const scoped = (omit: Facet) => and(...filterWhere(db, userId, q, omit));

    const byStatus = count(
        db
            .select({ key: entries.status, n })
            .from(entries)
            .innerJoin(games, eq(games.id, entries.gameId))
            .where(scoped('status'))
            .groupBy(entries.status)
            .all()
    );
    const byPlatform = count(
        db
            .select({ key: entryPlatforms.platformId, n })
            .from(entries)
            .innerJoin(games, eq(games.id, entries.gameId))
            .innerJoin(entryPlatforms, eq(entryPlatforms.entryId, entries.id))
            .where(scoped('platform'))
            .groupBy(entryPlatforms.platformId)
            .all()
    );
    const byGenre = count(
        db
            .select({ key: gameGenres.genreId, n })
            .from(entries)
            .innerJoin(games, eq(games.id, entries.gameId))
            .innerJoin(gameGenres, eq(gameGenres.gameId, entries.gameId))
            .where(scoped('genre'))
            .groupBy(gameGenres.genreId)
            .all()
    );
    const bySeries = count(
        db
            .select({ key: gameSeries.seriesId, n })
            .from(entries)
            .innerJoin(games, eq(games.id, entries.gameId))
            .innerJoin(gameSeries, eq(gameSeries.gameId, entries.gameId))
            .where(scoped('series'))
            .groupBy(gameSeries.seriesId)
            .all()
    );
    // A series with one game of yours has nothing to filter, so it is only offered from two up
    // (or when already selected, so a link to one never shows an empty sidebar)
    const ownedSeries = db
        .select({ id: series.id, name: series.name, n: sql<number>`count(distinct ${entries.id})` })
        .from(entries)
        .innerJoin(gameSeries, eq(gameSeries.gameId, entries.gameId))
        .innerJoin(series, eq(series.id, gameSeries.seriesId))
        .where(eq(entries.userId, userId))
        .groupBy(series.id)
        .all()
        .filter((s) => s.n >= 2 || q.series?.includes(s.id))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    const byTag = count(
        db
            .select({ key: sql<string>`lower(${tags.name})`, n })
            .from(entries)
            .innerJoin(games, eq(games.id, entries.gameId))
            .innerJoin(entryTags, eq(entryTags.entryId, entries.id))
            .innerJoin(tags, eq(tags.id, entryTags.tagId))
            .where(scoped('tag'))
            .groupBy(sql`lower(${tags.name})`)
            .all()
    );

    const favorites =
        db
            .select({ n })
            .from(entries)
            .innerJoin(games, eq(games.id, entries.gameId))
            .where(and(scoped('favorite'), eq(entries.favorite, true)))
            .get()?.n ?? 0;

    return {
        // The backlog view is already "unplayed only", so other statuses would be dead options
        statuses: ENTRY_STATUSES.filter((s) => q.view === 'all' || s === 'unplayed').map((s) => ({
            value: s,
            count: byStatus.get(s) ?? 0
        })),
        platforms: base.platforms.map((p) => ({ ...p, count: byPlatform.get(p.id) ?? 0 })),
        genres: base.genres.map((g) => ({ ...g, count: byGenre.get(g.id) ?? 0 })),
        series: ownedSeries.map((s) => ({
            id: s.id,
            name: s.name,
            count: bySeries.get(s.id) ?? 0
        })),
        tags: base.tags.map((name) => ({ name, count: byTag.get(name.toLowerCase()) ?? 0 })),
        favorites
    };
}
