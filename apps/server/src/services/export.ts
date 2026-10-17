import { asc, eq, sql } from 'drizzle-orm';
import {
    EXPORT_FORMAT,
    EXPORT_VERSION,
    type ExportEntry,
    type ExportFile
} from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import {
    entries,
    entryPlatforms,
    entryTags,
    gameGenres,
    gamePlatforms,
    games,
    gameThemes,
    genres,
    listItems,
    lists,
    platforms,
    playthroughs,
    slots,
    tags,
    themes
} from '../db/schema.js';

const group = <K, V>(rows: { key: K; value: V }[]) => {
    const m = new Map<K, V[]>();
    for (const { key, value } of rows) (m.get(key) ?? m.set(key, []).get(key)!).push(value);
    return m;
};

/** Everything the user owns, as one self-contained document (see `exportFileSchema`). */
export function buildExport(db: Db, userId: number, now = new Date()): ExportFile {
    // Relations are joined through the user's entries, so there are no id lists to chunk.
    const mine = eq(entries.userId, userId);
    const rows = db
        .select({ e: entries, g: games })
        .from(entries)
        .innerJoin(games, eq(games.id, entries.gameId))
        .where(mine)
        .orderBy(asc(entries.id))
        .all();

    const gamePlats = group(
        db
            .select({ key: gamePlatforms.gameId, value: platforms })
            .from(gamePlatforms)
            .innerJoin(entries, eq(entries.gameId, gamePlatforms.gameId))
            .innerJoin(platforms, eq(platforms.id, gamePlatforms.platformId))
            .where(mine)
            .orderBy(asc(platforms.id))
            .all()
    );
    const gameGen = group(
        db
            .select({ key: gameGenres.gameId, value: genres })
            .from(gameGenres)
            .innerJoin(entries, eq(entries.gameId, gameGenres.gameId))
            .innerJoin(genres, eq(genres.id, gameGenres.genreId))
            .where(mine)
            .orderBy(asc(genres.id))
            .all()
    );
    const gameThem = group(
        db
            .select({ key: gameThemes.gameId, value: themes })
            .from(gameThemes)
            .innerJoin(entries, eq(entries.gameId, gameThemes.gameId))
            .innerJoin(themes, eq(themes.id, gameThemes.themeId))
            .where(mine)
            .orderBy(asc(themes.id))
            .all()
    );
    const owned = group(
        db
            .select({ key: entryPlatforms.entryId, value: platforms })
            .from(entryPlatforms)
            .innerJoin(entries, eq(entries.id, entryPlatforms.entryId))
            .innerJoin(platforms, eq(platforms.id, entryPlatforms.platformId))
            .where(mine)
            .orderBy(asc(platforms.id))
            .all()
    );
    const entryTagNames = group(
        db
            .select({ key: entryTags.entryId, value: tags.name })
            .from(entryTags)
            .innerJoin(entries, eq(entries.id, entryTags.entryId))
            .innerJoin(tags, eq(tags.id, entryTags.tagId))
            .where(mine)
            .orderBy(asc(sql`lower(${tags.name})`))
            .all()
    );
    const history = group(
        db
            .select({ entryId: playthroughs.entryId, p: playthroughs, platform: platforms })
            .from(playthroughs)
            .leftJoin(platforms, eq(platforms.id, playthroughs.platformId))
            .where(eq(playthroughs.userId, userId))
            .orderBy(asc(playthroughs.id))
            .all()
            .map((r) => ({ key: r.entryId, value: { p: r.p, platform: r.platform } }))
    );

    const ref = (p: { id: number; name: string; abbreviation: string | null }) => ({
        id: p.id,
        name: p.name,
        abbreviation: p.abbreviation
    });
    const igdbIdOfEntry = new Map(rows.map(({ e }) => [e.id, e.gameId]));

    const gameEntries: ExportEntry[] = rows.map(({ e, g }) => ({
        igdbId: g.id,
        game: {
            name: g.name,
            slug: g.slug,
            summary: g.summary,
            releaseDate: g.releaseDate,
            coverImageId: g.coverImageId,
            igdbRating: g.igdbRating,
            igdbRatingCount: g.igdbRatingCount,
            gameType: g.gameType,
            platforms: (gamePlats.get(g.id) ?? []).map(ref),
            genres: (gameGen.get(g.id) ?? []).map((x) => ({ id: x.id, name: x.name })),
            themes: (gameThem.get(g.id) ?? []).map((x) => ({ id: x.id, name: x.name })),
            ttb:
                g.ttbHastilySeconds === null &&
                g.ttbNormallySeconds === null &&
                g.ttbCompletelySeconds === null
                    ? null
                    : {
                          hastilySeconds: g.ttbHastilySeconds,
                          normallySeconds: g.ttbNormallySeconds,
                          completelySeconds: g.ttbCompletelySeconds,
                          count: g.ttbCount ?? 0
                      }
        },
        status: e.status,
        rating: e.rating,
        notes: e.notes,
        ttbOverrideMinutes: e.ttbOverrideMinutes,
        addedAt: e.addedAt,
        platforms: (owned.get(e.id) ?? []).map(ref),
        tags: entryTagNames.get(e.id) ?? [],
        playthroughs: (history.get(e.id) ?? []).map(({ p, platform }) => ({
            platform: platform ? ref(platform) : null,
            startedOn: p.startedOn,
            endedOn: p.endedOn,
            outcome: p.outcome,
            rating: p.rating
        }))
    }));

    const slotRows = db
        .select()
        .from(slots)
        .where(eq(slots.userId, userId))
        .orderBy(asc(slots.position))
        .all();
    const listRows = db
        .select()
        .from(lists)
        .where(eq(lists.userId, userId))
        .orderBy(asc(lists.id))
        .all();
    const items = group(
        db
            .select({ key: listItems.listId, value: listItems.entryId })
            .from(listItems)
            .innerJoin(lists, eq(lists.id, listItems.listId))
            .where(eq(lists.userId, userId))
            .orderBy(asc(listItems.position))
            .all()
    );

    return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exportedAt: now.toISOString(),
        games: gameEntries,
        slots: slotRows.map((s) => ({
            name: s.name,
            position: s.position,
            igdbId: s.entryId === null ? null : (igdbIdOfEntry.get(s.entryId) ?? null)
        })),
        lists: listRows.map((l) => ({
            name: l.name,
            games: (items.get(l.id) ?? []).flatMap((entryId) => {
                const igdbId = igdbIdOfEntry.get(entryId);
                return igdbId === undefined ? [] : [igdbId];
            })
        }))
    };
}
