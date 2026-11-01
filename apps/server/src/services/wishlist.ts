import { and, asc, count, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import { FIRST_PAGE, releasesWithin } from '@gamequeue/shared';
import type {
    AddWishlistItemInput,
    PageQuery,
    PatchWishlistItemInput,
    PlatformDto,
    WishlistDto,
    WishlistItemDto
} from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { games, listItems, lists, platforms } from '../db/schema.js';
import { HttpError } from '../errors.js';
import type { IgdbClient } from '../igdb/types.js';
import { addGameToList, ensureWishlist, findWishlist, removeItem } from './lists.js';
import { existingPlatformIds, loadGames, refreshReleaseDates } from './games.js';

export { ensureWishlist, findWishlist };

/**
 * The wishlist is the user's one `wishlist`-kind list (see `services/lists.ts`), so ordering,
 * moving, reordering and removing go through the generic list functions. This file adds what only
 * a wishlist has: the target platform and note per game, release dates and "releasing soon".
 */

/** `YYYY-MM-DD` plus whole days, in UTC so daylight saving can't shift the day. */
const addDays = (day: string, days: number) =>
    new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Items of one wishlist, in order, with their game details; one page, or all without `page`. */
export function wishlistItemsOf(
    db: Db,
    wishlistId: number,
    page?: PageQuery
): { items: WishlistItemDto[]; total: number } {
    const total = db
        .select({ n: count() })
        .from(listItems)
        .where(eq(listItems.listId, wishlistId))
        .get()!.n;
    const query = db
        .select({ item: listItems, platform: platforms })
        .from(listItems)
        .leftJoin(platforms, eq(platforms.id, listItems.platformId))
        .where(eq(listItems.listId, wishlistId))
        .orderBy(asc(listItems.position));
    const rows = (page ? query.limit(page.limit).offset(page.offset) : query).all();
    return { items: toItems(db, rows), total };
}

/** Unreleased wishlisted games with an exact release day within `days` of `today`, soonest first. */
export function releasingSoon(
    db: Db,
    wishlistId: number,
    today: string,
    days: number
): WishlistItemDto[] {
    const rows = db
        .select({ item: listItems, platform: platforms })
        .from(listItems)
        .innerJoin(games, eq(games.id, listItems.gameId))
        .leftJoin(platforms, eq(platforms.id, listItems.platformId))
        .where(
            and(
                eq(listItems.listId, wishlistId),
                isNotNull(games.releaseDate),
                gte(games.releaseDate, today),
                lte(games.releaseDate, addDays(today, days))
            )
        )
        .orderBy(asc(games.releaseDate), asc(listItems.position))
        .all();
    // `releasesWithin` also checks the date's precision, which SQL can't
    return toItems(db, rows).filter(({ game }) =>
        releasesWithin(game.releaseDate, game.releasePrecision, today, days)
    );
}

function toItems(
    db: Db,
    rows: {
        item: typeof listItems.$inferSelect;
        platform: typeof platforms.$inferSelect | null;
    }[]
): WishlistItemDto[] {
    const ids = [...new Set(rows.map((r) => r.item.gameId))];
    const gameDtos = loadGames(db, ids);
    return rows.flatMap(({ item, platform }) => {
        const game = gameDtos.get(item.gameId);
        return game
            ? [
                  {
                      igdbId: item.gameId,
                      game,
                      platform: platform as PlatformDto | null,
                      note: item.note,
                      addedAt: item.addedAt
                  }
              ]
            : [];
    });
}

/** Brings the release dates of the unreleased games on a wishlist up to date (see `refreshReleaseDates`). */
export async function refreshWishlistReleases(
    db: Db,
    igdb: IgdbClient | undefined,
    wishlistId: number
) {
    const ids = db
        .select({ id: listItems.gameId })
        .from(listItems)
        .where(eq(listItems.listId, wishlistId))
        .all()
        .map((r) => r.id);
    await refreshReleaseDates(db, igdb, ids);
}

/** The user's wishlist (the first page of it, unless `page` says otherwise). */
export function getWishlist(db: Db, userId: number, page: PageQuery = FIRST_PAGE): WishlistDto {
    const w = ensureWishlist(db, userId);
    return { id: w.id, name: w.name, ...wishlistItemsOf(db, w.id, page) };
}

function assertPlatform(db: Db, platformId: number) {
    if (!existingPlatformIds(db, [platformId]).has(platformId))
        throw new HttpError(400, `Unknown platform id: ${platformId}`);
}

/**
 * Adds to the end; a game already on the wishlist is a no-op. A game you own can't be wishlisted
 * (409, with the entry id, enforced by `addToList`), which keeps "wishlist" and "collection"
 * disjoint.
 */
export async function addToWishlist(
    db: Db,
    igdb: IgdbClient | undefined,
    userId: number,
    input: AddWishlistItemInput
): Promise<WishlistDto> {
    await addGameToList(db, igdb, userId, ensureWishlist(db, userId).id, input.igdbId, {
        platformId: input.platformId,
        note: input.note
    });
    return getWishlist(db, userId);
}

export function patchWishlistItem(
    db: Db,
    userId: number,
    igdbId: number,
    patch: PatchWishlistItemInput
): WishlistDto {
    const wishlistId = ensureWishlist(db, userId).id;
    if (patch.platformId) assertPlatform(db, patch.platformId);
    const set: Partial<typeof listItems.$inferInsert> = {};
    if (patch.platformId !== undefined) set.platformId = patch.platformId;
    if (patch.note !== undefined) set.note = patch.note;
    const res = db
        .update(listItems)
        .set(set)
        .where(and(eq(listItems.listId, wishlistId), eq(listItems.gameId, igdbId)))
        .run();
    if (res.changes === 0) throw new HttpError(404, 'That game is not on the wishlist');
    return getWishlist(db, userId);
}

/** Removes one game from the wishlist and closes the gap. */
export function removeFromWishlist(db: Db, userId: number, igdbId: number): WishlistDto {
    const wishlistId = ensureWishlist(db, userId).id;
    db.transaction((tx) => removeItem(tx as unknown as Db, wishlistId, igdbId));
    return getWishlist(db, userId);
}

/** The ids of the user's wishlisted games, all of them or only those among `among`. */
export function wishlistedIds(db: Db, userId: number, among?: number[]): Set<number> {
    if (among && among.length === 0) return new Set();
    return new Set(
        db
            .select({ gameId: listItems.gameId })
            .from(listItems)
            .innerJoin(lists, eq(lists.id, listItems.listId))
            .where(
                and(
                    eq(lists.userId, userId),
                    eq(lists.kind, 'wishlist'),
                    among ? inArray(listItems.gameId, among) : undefined
                )
            )
            .all()
            .map((r) => r.gameId)
    );
}
