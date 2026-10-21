import { and, asc, eq, inArray, max } from 'drizzle-orm';
import type {
    AddWishlistItemInput,
    PatchWishlistItemInput,
    PlatformDto,
    WishlistDto,
    WishlistItemDto
} from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { entries, platforms, wishlistItems, wishlists } from '../db/schema.js';
import { HttpError } from '../errors.js';
import type { IgdbClient } from '../igdb/types.js';
import { ensureGame, existingPlatformIds, loadGames, refreshReleaseDates } from './games.js';

export const DEFAULT_WISHLIST_NAME = 'Wishlist';

function requireWishlist(db: Db, userId: number, id: number) {
    const w = db
        .select()
        .from(wishlists)
        .where(and(eq(wishlists.id, id), eq(wishlists.userId, userId)))
        .get();
    if (!w) throw new HttpError(404, 'Wishlist not found');
    return w;
}

/** The user's first wishlist, if they have one. Read-only: nothing is created. */
export const findWishlist = (db: Db, userId: number) =>
    db
        .select()
        .from(wishlists)
        .where(eq(wishlists.userId, userId))
        .orderBy(asc(wishlists.id))
        .get();

/** The user's (default) wishlist, created the first time it's needed. */
export function ensureWishlist(db: Db, userId: number) {
    return (
        findWishlist(db, userId) ??
        db.insert(wishlists).values({ userId, name: DEFAULT_WISHLIST_NAME }).returning().get()
    );
}

/** Items of one wishlist, in order, with their game details. */
export function wishlistItemsOf(db: Db, wishlistId: number): WishlistItemDto[] {
    const rows = db
        .select({ item: wishlistItems, platform: platforms })
        .from(wishlistItems)
        .leftJoin(platforms, eq(platforms.id, wishlistItems.platformId))
        .where(eq(wishlistItems.wishlistId, wishlistId))
        .orderBy(asc(wishlistItems.position))
        .all();
    const gameDtos = loadGames(db, [...new Set(rows.map((r) => r.item.gameId))]);
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
        .select({ id: wishlistItems.gameId })
        .from(wishlistItems)
        .where(eq(wishlistItems.wishlistId, wishlistId))
        .all()
        .map((r) => r.id);
    await refreshReleaseDates(db, igdb, ids);
}

export function getWishlist(db: Db, userId: number, id: number): WishlistDto {
    const w = requireWishlist(db, userId, id);
    return { id: w.id, name: w.name, items: wishlistItemsOf(db, w.id) };
}

function assertPlatform(db: Db, platformId: number) {
    if (!existingPlatformIds(db, [platformId]).has(platformId))
        throw new HttpError(400, `Unknown platform id: ${platformId}`);
}

/**
 * Adds to the end; a game already on the wishlist is a no-op. A game you own can't be wishlisted
 * (409, with the entry id), which keeps "wishlist" and "collection" disjoint.
 */
export async function addToWishlist(
    db: Db,
    igdb: IgdbClient | undefined,
    userId: number,
    wishlistId: number,
    input: AddWishlistItemInput
): Promise<WishlistDto> {
    requireWishlist(db, userId, wishlistId);
    const owned = db
        .select({ id: entries.id })
        .from(entries)
        .where(and(eq(entries.userId, userId), eq(entries.gameId, input.igdbId)))
        .get();
    if (owned)
        throw new HttpError(409, 'That game is already in your collection', { entryId: owned.id });

    await ensureGame(db, igdb, input.igdbId);
    if (input.platformId) assertPlatform(db, input.platformId);
    const top = db
        .select({ n: max(wishlistItems.position) })
        .from(wishlistItems)
        .where(eq(wishlistItems.wishlistId, wishlistId))
        .get()!.n;
    db.insert(wishlistItems)
        .values({
            wishlistId,
            gameId: input.igdbId,
            position: (top ?? -1) + 1,
            platformId: input.platformId ?? null,
            note: input.note ?? ''
        })
        .onConflictDoNothing()
        .run();
    return getWishlist(db, userId, wishlistId);
}

export function patchWishlistItem(
    db: Db,
    userId: number,
    wishlistId: number,
    igdbId: number,
    patch: PatchWishlistItemInput
): WishlistDto {
    requireWishlist(db, userId, wishlistId);
    if (patch.platformId) assertPlatform(db, patch.platformId);
    const set: Partial<typeof wishlistItems.$inferInsert> = {};
    if (patch.platformId !== undefined) set.platformId = patch.platformId;
    if (patch.note !== undefined) set.note = patch.note;
    const res = db
        .update(wishlistItems)
        .set(set)
        .where(and(eq(wishlistItems.wishlistId, wishlistId), eq(wishlistItems.gameId, igdbId)))
        .run();
    if (res.changes === 0) throw new HttpError(404, 'That game is not on the wishlist');
    return getWishlist(db, userId, wishlistId);
}

/** Deletes items and closes the gaps so positions stay 0..n-1. */
function removeItems(db: Db, wishlistId: number, gameIds: number[]) {
    db.delete(wishlistItems)
        .where(
            and(eq(wishlistItems.wishlistId, wishlistId), inArray(wishlistItems.gameId, gameIds))
        )
        .run();
    db.select({ gameId: wishlistItems.gameId })
        .from(wishlistItems)
        .where(eq(wishlistItems.wishlistId, wishlistId))
        .orderBy(asc(wishlistItems.position))
        .all()
        .forEach((r, i) =>
            db
                .update(wishlistItems)
                .set({ position: i })
                .where(
                    and(
                        eq(wishlistItems.wishlistId, wishlistId),
                        eq(wishlistItems.gameId, r.gameId)
                    )
                )
                .run()
        );
}

export function removeFromWishlist(
    db: Db,
    userId: number,
    wishlistId: number,
    igdbId: number
): WishlistDto {
    requireWishlist(db, userId, wishlistId);
    db.transaction((tx) => removeItems(tx as unknown as Db, wishlistId, [igdbId]));
    return getWishlist(db, userId, wishlistId);
}

/** Owning a game ends the wish: called when a game joins the collection, from any wishlist. */
export function dropFromWishlists(db: Db, userId: number, igdbId: number) {
    const mine = db
        .select({ id: wishlists.id })
        .from(wishlists)
        .where(eq(wishlists.userId, userId))
        .all();
    for (const w of mine) removeItems(db, w.id, [igdbId]);
}

export function reorderWishlist(
    db: Db,
    userId: number,
    wishlistId: number,
    igdbIds: number[]
): WishlistDto {
    requireWishlist(db, userId, wishlistId);
    const current = db
        .select({ gameId: wishlistItems.gameId })
        .from(wishlistItems)
        .where(eq(wishlistItems.wishlistId, wishlistId))
        .all();
    const same =
        igdbIds.length === current.length &&
        new Set(igdbIds).size === igdbIds.length &&
        current.every((r) => igdbIds.includes(r.gameId));
    if (!same) throw new HttpError(400, "The new order must contain exactly the wishlist's games");
    db.transaction((tx) =>
        igdbIds.forEach((gameId, i) =>
            tx
                .update(wishlistItems)
                .set({ position: i })
                .where(
                    and(eq(wishlistItems.wishlistId, wishlistId), eq(wishlistItems.gameId, gameId))
                )
                .run()
        )
    );
    return getWishlist(db, userId, wishlistId);
}
