import { asc, eq, inArray, sql } from 'drizzle-orm';
import {
    EXPORT_FORMAT,
    EXPORT_VERSION,
    type ExportEntry,
    type ExportFile,
    type ExportGrid,
    type ExportTierList,
    type ExportWishlistItem
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
    gridCells,
    grids,
    listItems,
    lists,
    platforms,
    playthroughs,
    slots,
    tags,
    themes,
    tierItems,
    tierLists,
    tiers,
    wishlistItems
} from '../db/schema.js';
import { findWishlist } from './wishlist.js';
import { listSmartListRows } from './smart-lists.js';

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

    const wishlist = findWishlist(db, userId);
    const wished = wishlist
        ? db
              .select({ item: wishlistItems, g: games, platform: platforms })
              .from(wishlistItems)
              .innerJoin(games, eq(games.id, wishlistItems.gameId))
              .leftJoin(platforms, eq(platforms.id, wishlistItems.platformId))
              .where(eq(wishlistItems.wishlistId, wishlist.id))
              .orderBy(asc(wishlistItems.position))
              .all()
        : [];
    // Game metadata is snapshotted for everything in the file: owned games and wishlisted ones.
    // A subquery rather than an id list, so there is nothing to chunk.
    const wantedGames = sql`(select game_id from entries where user_id = ${userId}
        union select wi.game_id from wishlist_items wi
            join wishlists w on w.id = wi.wishlist_id where w.user_id = ${userId}
        union select gc.game_id from grid_cells gc
            join grids g on g.id = gc.grid_id where g.user_id = ${userId} and gc.game_id is not null
        union select ti.game_id from tier_items ti
            join tier_lists tl on tl.id = ti.tier_list_id where tl.user_id = ${userId})`;

    const gamePlats = group(
        db
            .select({ key: gamePlatforms.gameId, value: platforms })
            .from(gamePlatforms)
            .innerJoin(platforms, eq(platforms.id, gamePlatforms.platformId))
            .where(inArray(gamePlatforms.gameId, wantedGames))
            .orderBy(asc(platforms.id))
            .all()
    );
    const gameGen = group(
        db
            .select({ key: gameGenres.gameId, value: genres })
            .from(gameGenres)
            .innerJoin(genres, eq(genres.id, gameGenres.genreId))
            .where(inArray(gameGenres.gameId, wantedGames))
            .orderBy(asc(genres.id))
            .all()
    );
    const gameThem = group(
        db
            .select({ key: gameThemes.gameId, value: themes })
            .from(gameThemes)
            .innerJoin(themes, eq(themes.id, gameThemes.themeId))
            .where(inArray(gameThemes.gameId, wantedGames))
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

    const snapshot = (g: typeof games.$inferSelect) => ({
        name: g.name,
        slug: g.slug,
        summary: g.summary,
        releaseDate: g.releaseDate,
        releasePrecision: g.releasePrecision,
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
    });

    const gameEntries: ExportEntry[] = rows.map(({ e, g }) => ({
        igdbId: g.id,
        game: snapshot(g),
        status: e.status,
        rating: e.rating,
        favorite: e.favorite,
        notes: e.notes,
        addedAt: e.addedAt,
        platforms: (owned.get(e.id) ?? []).map(ref),
        tags: entryTagNames.get(e.id) ?? [],
        playthroughs: (history.get(e.id) ?? []).map(({ p, platform }) => ({
            platform: platform ? ref(platform) : null,
            startedOn: p.startedOn,
            endedOn: p.endedOn,
            outcome: p.outcome,
            rating: p.rating,
            playtimeMinutes: p.playtimeMinutes
        }))
    }));

    const igdbIds = (entryIds: number[] = []) =>
        entryIds.flatMap((entryId) => {
            const igdbId = igdbIdOfEntry.get(entryId);
            return igdbId === undefined ? [] : [igdbId];
        });
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
    const queueRow = listRows.find((l) => l.kind === 'queue');
    const items = group(
        db
            .select({ key: listItems.listId, value: listItems.entryId })
            .from(listItems)
            .innerJoin(lists, eq(lists.id, listItems.listId))
            .where(eq(lists.userId, userId))
            .orderBy(asc(listItems.position))
            .all()
    );

    const placed = (g: typeof games.$inferSelect) => ({ igdbId: g.id, game: snapshot(g) });

    const gridRows = db
        .select()
        .from(grids)
        .where(eq(grids.userId, userId))
        .orderBy(asc(grids.id))
        .all();
    const cellRows = group(
        db
            .select({ gridId: gridCells.gridId, cell: gridCells, g: games })
            .from(gridCells)
            .innerJoin(grids, eq(grids.id, gridCells.gridId))
            .leftJoin(games, eq(games.id, gridCells.gameId))
            .where(eq(grids.userId, userId))
            .orderBy(asc(gridCells.position))
            .all()
            .map((r) => ({ key: r.gridId, value: { cell: r.cell, g: r.g } }))
    );
    const exportedGrids: ExportGrid[] = gridRows.map((g) => ({
        title: g.title,
        description: g.description,
        cols: g.cols,
        rows: g.rows,
        cells: (cellRows.get(g.id) ?? []).map(({ cell, g: game }) => ({
            position: cell.position,
            label: cell.label,
            game: game ? placed(game) : null
        }))
    }));

    const tierListRows = db
        .select()
        .from(tierLists)
        .where(eq(tierLists.userId, userId))
        .orderBy(asc(tierLists.id))
        .all();
    const tierRows = group(
        db
            .select({ key: tiers.tierListId, value: tiers })
            .from(tiers)
            .innerJoin(tierLists, eq(tierLists.id, tiers.tierListId))
            .where(eq(tierLists.userId, userId))
            .orderBy(asc(tiers.position))
            .all()
    );
    const tierItemRows = group(
        db
            .select({ tierListId: tierItems.tierListId, item: tierItems, g: games })
            .from(tierItems)
            .innerJoin(tierLists, eq(tierLists.id, tierItems.tierListId))
            .innerJoin(games, eq(games.id, tierItems.gameId))
            .where(eq(tierLists.userId, userId))
            .orderBy(asc(tierItems.position))
            .all()
            .map((r) => ({ key: r.tierListId, value: { item: r.item, g: r.g } }))
    );
    const exportedTierLists: ExportTierList[] = tierListRows.map((l) => {
        const items = tierItemRows.get(l.id) ?? [];
        return {
            title: l.title,
            description: l.description,
            tiers: (tierRows.get(l.id) ?? []).map((t) => ({
                name: t.name,
                color: t.color as ExportTierList['tiers'][number]['color'],
                games: items.filter((i) => i.item.tierId === t.id).map((i) => placed(i.g))
            })),
            unranked: items.filter((i) => i.item.tierId === null).map((i) => placed(i.g))
        };
    });

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
        lists: listRows
            .filter((l) => l.kind === 'list')
            .map((l) => ({
                name: l.name,
                description: l.description,
                games: igdbIds(items.get(l.id))
            })),
        queue: igdbIds(queueRow && items.get(queueRow.id)),
        smartLists: listSmartListRows(db, userId),
        grids: exportedGrids,
        tierLists: exportedTierLists,
        wishlist: wished.map(({ item, g, platform }): ExportWishlistItem => ({
            igdbId: g.id,
            game: snapshot(g),
            platform: platform ? ref(platform) : null,
            note: item.note,
            addedAt: item.addedAt
        }))
    };
}
