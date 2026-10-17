import { and, asc, desc, eq, exists, inArray, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import type {
    AddEntryInput,
    EntryDto,
    EntryQuery,
    FacetsDto,
    PatchEntryInput,
    PlatformDto,
    PlaythroughDto
} from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import {
    entries,
    entryPlatforms,
    entryTags,
    listItems,
    lists,
    gameGenres,
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
import { ensureGame, existingPlatformIds } from './games.js';
import { toDto } from './playthrough-dto.js';

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
            .values({ userId, gameId: input.igdbId })
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
        const set: Partial<typeof entries.$inferInsert> = { updatedAt: Date.now() };
        if (patch.rating !== undefined) set.rating = patch.rating;
        if (patch.notes !== undefined) set.notes = patch.notes;
        if (patch.ttbOverrideMinutes !== undefined)
            set.ttbOverrideMinutes = patch.ttbOverrideMinutes;
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

export function listEntries(db: Db, userId: number, q: EntryQuery): EntryDto[] {
    const where: (SQL | undefined)[] = [eq(entries.userId, userId)];
    if (q.view === 'backlog') where.push(eq(entries.status, 'unplayed'));
    else if (q.status) where.push(eq(entries.status, q.status));
    if (q.platform)
        where.push(
            exists(
                db
                    .select({ x: sql`1` })
                    .from(entryPlatforms)
                    .where(
                        and(
                            eq(entryPlatforms.entryId, entries.id),
                            eq(entryPlatforms.platformId, q.platform)
                        )
                    )
            )
        );
    if (q.genre)
        where.push(
            exists(
                db
                    .select({ x: sql`1` })
                    .from(gameGenres)
                    .where(
                        and(eq(gameGenres.gameId, entries.gameId), eq(gameGenres.genreId, q.genre))
                    )
            )
        );
    if (q.tag)
        where.push(
            exists(
                db
                    .select({ x: sql`1` })
                    .from(entryTags)
                    .innerJoin(tags, eq(tags.id, entryTags.tagId))
                    .where(
                        and(
                            eq(entryTags.entryId, entries.id),
                            sql`lower(${tags.name}) = lower(${q.tag})`
                        )
                    )
            )
        );
    if (q.q) where.push(sql`instr(lower(${games.name}), lower(${q.q})) > 0`);

    const ids = db
        .select({ id: entries.id })
        .from(entries)
        .innerJoin(games, eq(games.id, entries.gameId))
        .where(and(...where))
        .orderBy(...buildOrder(q))
        .all()
        .map((r) => r.id);
    return hydrate(db, userId, ids);
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

    const gameChunks: number[][] = [];
    const gids = [...gameIds];
    for (let i = 0; i < gids.length; i += 500) gameChunks.push(gids.slice(i, i + 500));
    const gPlatforms = new Map<number, PlatformDto[]>();
    const gGenres = new Map<number, string[]>();
    const gThemes = new Map<number, string[]>();
    const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => (m.get(k) ?? m.set(k, []).get(k)!).push(v);
    for (const chunk of gameChunks) {
        for (const r of db
            .select({ gameId: gamePlatforms.gameId, p: platforms })
            .from(gamePlatforms)
            .innerJoin(platforms, eq(platforms.id, gamePlatforms.platformId))
            .where(inArray(gamePlatforms.gameId, chunk))
            .orderBy(asc(platforms.name))
            .all())
            push(gPlatforms, r.gameId, r.p);
        for (const r of db
            .select({ gameId: gameGenres.gameId, name: genres.name })
            .from(gameGenres)
            .innerJoin(genres, eq(genres.id, gameGenres.genreId))
            .where(inArray(gameGenres.gameId, chunk))
            .orderBy(asc(genres.name))
            .all())
            push(gGenres, r.gameId, r.name);
        for (const r of db
            .select({ gameId: gameThemes.gameId, name: themes.name })
            .from(gameThemes)
            .innerJoin(themes, eq(themes.id, gameThemes.themeId))
            .where(inArray(gameThemes.gameId, chunk))
            .orderBy(asc(themes.name))
            .all())
            push(gThemes, r.gameId, r.name);
    }

    const minutes = (s: number | null) => (s === null ? null : Math.round(s / 60));
    return ids.flatMap((id) => {
        const r = rows.get(id);
        if (!r) return [];
        const { e, g } = r;
        const hasTtb =
            g.ttbHastilySeconds !== null ||
            g.ttbNormallySeconds !== null ||
            g.ttbCompletelySeconds !== null;
        return [
            {
                id: e.id,
                status: e.status,
                rating: e.rating,
                notes: e.notes,
                ttbOverrideMinutes: e.ttbOverrideMinutes,
                ttbMinutes: e.ttbOverrideMinutes ?? minutes(g.ttbNormallySeconds),
                addedAt: e.addedAt,
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
                platforms: owned.get(e.id) ?? [],
                tags: tagMap.get(e.id) ?? [],
                game: {
                    id: g.id,
                    name: g.name,
                    slug: g.slug,
                    summary: g.summary,
                    releaseDate: g.releaseDate,
                    coverImageId: g.coverImageId,
                    igdbRating: g.igdbRating,
                    genres: gGenres.get(g.id) ?? [],
                    themes: gThemes.get(g.id) ?? [],
                    platforms: gPlatforms.get(g.id) ?? [],
                    ttb: hasTtb
                        ? {
                              hastily: minutes(g.ttbHastilySeconds),
                              normally: minutes(g.ttbNormallySeconds),
                              completely: minutes(g.ttbCompletelySeconds),
                              count: g.ttbCount ?? 0
                          }
                        : null
                }
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
            .all()
    };
}
