import { and, asc, count, desc, eq, inArray, isNotNull, isNull, max } from 'drizzle-orm';
import {
    DEFAULT_TIERS,
    MAX_TIERS,
    MAX_TIER_ITEMS,
    MAX_TIER_LISTS,
    type AddTierInput,
    type AddTierItemInput,
    type CreateTierListInput,
    type MoveTierItemInput,
    type PatchTierInput,
    type PatchTierListInput,
    type PublicTierListDto,
    type TierColor,
    type TierItemDto,
    type TierListDto,
    type TierListSummaryDto
} from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { tierItems, tierLists, tiers, users } from '../db/schema.js';
import { HttpError } from '../errors.js';
import type { IgdbClient } from '../igdb/types.js';
import { forgetSubject, recordActivity } from './activity.js';
import { ensureGame, loadGames } from './games.js';

type ListRow = typeof tierLists.$inferSelect;

function requireList(db: Db, userId: number, id: number): ListRow {
    const l = db
        .select()
        .from(tierLists)
        .where(and(eq(tierLists.id, id), eq(tierLists.userId, userId)))
        .get();
    if (!l) throw new HttpError(404, 'Tier list not found');
    return l;
}

function requireTier(db: Db, listId: number, tierId: number) {
    const t = db
        .select()
        .from(tiers)
        .where(and(eq(tiers.id, tierId), eq(tiers.tierListId, listId)))
        .get();
    if (!t) throw new HttpError(404, 'Tier not found');
    return t;
}

const touch = (db: Db, id: number) =>
    db.update(tierLists).set({ updatedAt: Date.now() }).where(eq(tierLists.id, id)).run();

function toDto(db: Db, l: ListRow): TierListDto {
    const tierRows = db
        .select()
        .from(tiers)
        .where(eq(tiers.tierListId, l.id))
        .orderBy(asc(tiers.position))
        .all();
    const items = db
        .select()
        .from(tierItems)
        .where(eq(tierItems.tierListId, l.id))
        .orderBy(asc(tierItems.position))
        .all();
    const cached = loadGames(db, [...new Set(items.map((i) => i.gameId))]);
    const dto = (gameId: number): TierItemDto[] => {
        const game = cached.get(gameId);
        return game ? [{ igdbId: gameId, game }] : [];
    };
    return {
        id: l.id,
        title: l.title,
        description: l.description,
        tiers: tierRows.map((t) => ({
            id: t.id,
            name: t.name,
            color: t.color as TierColor,
            items: items.filter((i) => i.tierId === t.id).flatMap((i) => dto(i.gameId))
        })),
        unranked: items.filter((i) => i.tierId === null).flatMap((i) => dto(i.gameId)),
        createdAt: l.createdAt,
        updatedAt: l.updatedAt
    };
}

export const getTierList = (db: Db, userId: number, id: number) =>
    toDto(db, requireList(db, userId, id));

/** Anyone's tier list by username and id; one under the wrong username is a 404. */
export function getPublicTierList(db: Db, username: string, id: number): PublicTierListDto {
    const row = db
        .select({ l: tierLists })
        .from(tierLists)
        .innerJoin(users, eq(users.id, tierLists.userId))
        .where(
            and(
                eq(tierLists.id, id),
                eq(users.username, username),
                isNotNull(users.emailVerifiedAt)
            )
        )
        .get();
    if (!row) throw new HttpError(404, 'Not found');
    return { ...toDto(db, row.l), username };
}

/** A user's tier lists as tiles, newest first. */
export function listTierLists(db: Db, userId: number): TierListSummaryDto[] {
    const rows = db
        .select()
        .from(tierLists)
        .where(eq(tierLists.userId, userId))
        .orderBy(desc(tierLists.updatedAt), desc(tierLists.id))
        .all();
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const tierPos = new Map(
        db
            .select({ id: tiers.id, position: tiers.position })
            .from(tiers)
            .where(inArray(tiers.tierListId, ids))
            .all()
            .map((t) => [t.id, t.position])
    );
    const ranked = db
        .select()
        .from(tierItems)
        .where(inArray(tierItems.tierListId, ids))
        .all()
        .filter((i) => i.tierId !== null)
        .sort(
            (a, b) => tierPos.get(a.tierId!)! - tierPos.get(b.tierId!)! || a.position - b.position
        );
    const cached = loadGames(db, [...new Set(ranked.map((i) => i.gameId))]);
    return rows.map((l) => {
        const mine = ranked.filter((i) => i.tierListId === l.id);
        return {
            id: l.id,
            title: l.title,
            ranked: mine.length,
            covers: mine
                .flatMap((i) => {
                    const cover = cached.get(i.gameId)?.coverImageId;
                    return cover ? [cover] : [];
                })
                .slice(0, 4)
        };
    });
}

export function createTierList(db: Db, userId: number, input: CreateTierListInput): TierListDto {
    return db.transaction((tx) => {
        const have = tx
            .select({ n: count() })
            .from(tierLists)
            .where(eq(tierLists.userId, userId))
            .get()!.n;
        if (have >= MAX_TIER_LISTS)
            throw new HttpError(409, `You can have up to ${MAX_TIER_LISTS} tier lists`);
        const l = tx
            .insert(tierLists)
            .values({ userId, title: input.title, description: input.description ?? '' })
            .returning()
            .get();
        tx.insert(tiers)
            .values(DEFAULT_TIERS.map((t, position) => ({ tierListId: l.id, position, ...t })))
            .run();
        recordActivity(tx as unknown as Db, userId, {
            type: 'tier',
            subjectId: l.id,
            subjectName: l.title
        });
        return toDto(tx as unknown as Db, l);
    });
}

export function patchTierList(
    db: Db,
    userId: number,
    id: number,
    patch: PatchTierListInput
): TierListDto {
    const l = requireList(db, userId, id);
    const updated = db
        .update(tierLists)
        .set({
            title: patch.title ?? l.title,
            description: patch.description ?? l.description,
            updatedAt: Date.now()
        })
        .where(eq(tierLists.id, id))
        .returning()
        .get();
    return toDto(db, updated);
}

export function deleteTierList(db: Db, userId: number, id: number) {
    requireList(db, userId, id);
    db.transaction((tx) => {
        tx.delete(tierLists).where(eq(tierLists.id, id)).run();
        forgetSubject(tx as unknown as Db, userId, ['tier'], id);
    });
}

// --- tiers -------------------------------------------------------------------------------------

export function addTier(db: Db, userId: number, id: number, input: AddTierInput): TierListDto {
    const l = requireList(db, userId, id);
    const have = db
        .select({ n: count(), top: max(tiers.position) })
        .from(tiers)
        .where(eq(tiers.tierListId, id))
        .get()!;
    if (have.n >= MAX_TIERS)
        throw new HttpError(409, `A tier list can have up to ${MAX_TIERS} tiers`);
    db.insert(tiers)
        .values({
            tierListId: id,
            position: (have.top ?? -1) + 1,
            name: input.name,
            color: input.color
        })
        .run();
    touch(db, id);
    return toDto(db, requireList(db, userId, l.id));
}

export function patchTier(
    db: Db,
    userId: number,
    id: number,
    tierId: number,
    patch: PatchTierInput
): TierListDto {
    requireList(db, userId, id);
    const t = requireTier(db, id, tierId);
    db.update(tiers)
        .set({ name: patch.name ?? t.name, color: patch.color ?? t.color })
        .where(eq(tiers.id, tierId))
        .run();
    touch(db, id);
    return getTierList(db, userId, id);
}

/** Deleting a tier keeps its games: they go to the end of the unranked pool, in order. */
export function deleteTier(db: Db, userId: number, id: number, tierId: number): TierListDto {
    return db.transaction((tx) => {
        const db = tx as unknown as Db;
        requireList(db, userId, id);
        requireTier(db, id, tierId);
        const pool = containerIds(db, id, null);
        setOrder(db, id, null, [...pool, ...containerIds(db, id, tierId)]);
        db.delete(tiers).where(eq(tiers.id, tierId)).run();
        const left = db
            .select()
            .from(tiers)
            .where(eq(tiers.tierListId, id))
            .orderBy(asc(tiers.position))
            .all();
        left.forEach((t, position) => {
            if (t.position !== position)
                db.update(tiers).set({ position }).where(eq(tiers.id, t.id)).run();
        });
        touch(db, id);
        return getTierList(db, userId, id);
    });
}

export function reorderTiers(db: Db, userId: number, id: number, tierIds: number[]): TierListDto {
    return db.transaction((tx) => {
        const db = tx as unknown as Db;
        requireList(db, userId, id);
        const have = db.select({ id: tiers.id }).from(tiers).where(eq(tiers.tierListId, id)).all();
        const same =
            tierIds.length === have.length &&
            new Set(tierIds).size === tierIds.length &&
            have.every((t) => tierIds.includes(t.id));
        if (!same) throw new HttpError(400, 'The order must list every tier exactly once');
        tierIds.forEach((tierId, position) =>
            db.update(tiers).set({ position }).where(eq(tiers.id, tierId)).run()
        );
        touch(db, id);
        return getTierList(db, userId, id);
    });
}

// --- items -------------------------------------------------------------------------------------

const where = (listId: number, tierId: number | null) =>
    and(
        eq(tierItems.tierListId, listId),
        tierId === null ? isNull(tierItems.tierId) : eq(tierItems.tierId, tierId)
    );

/** Game ids of a tier (or the unranked pool when `tierId` is null), in order. */
function containerIds(db: Db, listId: number, tierId: number | null): number[] {
    return db
        .select({ gameId: tierItems.gameId })
        .from(tierItems)
        .where(where(listId, tierId))
        .orderBy(asc(tierItems.position))
        .all()
        .map((r) => r.gameId);
}

/** Puts exactly these games in the container, in this order. */
function setOrder(db: Db, listId: number, tierId: number | null, gameIds: number[]) {
    gameIds.forEach((gameId, position) =>
        db
            .update(tierItems)
            .set({ tierId, position })
            .where(and(eq(tierItems.tierListId, listId), eq(tierItems.gameId, gameId)))
            .run()
    );
}

/**
 * Adds a game to the end of a tier or the unranked pool. Adding one that is already in the list
 * changes nothing. A game never seen before is cached from IGDB (one request, triggered by a click).
 */
export async function addTierItem(
    db: Db,
    igdb: IgdbClient | undefined,
    userId: number,
    id: number,
    input: AddTierItemInput
): Promise<TierListDto> {
    requireList(db, userId, id);
    const tierId = input.tierId ?? null;
    if (tierId !== null) requireTier(db, id, tierId);
    const present = db
        .select({ n: count() })
        .from(tierItems)
        .where(eq(tierItems.tierListId, id))
        .get()!.n;
    const already = db
        .select({ g: tierItems.gameId })
        .from(tierItems)
        .where(and(eq(tierItems.tierListId, id), eq(tierItems.gameId, input.igdbId)))
        .get();
    if (!already) {
        if (present >= MAX_TIER_ITEMS)
            throw new HttpError(409, `A tier list can hold up to ${MAX_TIER_ITEMS} games`);
        await ensureGame(db, igdb, input.igdbId);
        const top = db
            .select({ n: max(tierItems.position) })
            .from(tierItems)
            .where(where(id, tierId))
            .get()!.n;
        db.insert(tierItems)
            .values({ tierListId: id, gameId: input.igdbId, tierId, position: (top ?? -1) + 1 })
            .onConflictDoNothing()
            .run();
        touch(db, id);
    }
    return getTierList(db, userId, id);
}

/** Moves a game to `toIndex` (clamped) of a tier or the pool, closing the gap it leaves behind. */
export function moveTierItem(
    db: Db,
    userId: number,
    id: number,
    input: MoveTierItemInput
): TierListDto {
    return db.transaction((tx) => {
        const db = tx as unknown as Db;
        requireList(db, userId, id);
        if (input.tierId !== null) requireTier(db, id, input.tierId);
        const item = db
            .select()
            .from(tierItems)
            .where(and(eq(tierItems.tierListId, id), eq(tierItems.gameId, input.igdbId)))
            .get();
        if (!item) throw new HttpError(404, 'That game is not in this tier list');
        const target = containerIds(db, id, input.tierId).filter((g) => g !== input.igdbId);
        target.splice(Math.min(input.toIndex, target.length), 0, input.igdbId);
        setOrder(db, id, input.tierId, target);
        if (item.tierId !== input.tierId)
            setOrder(
                db,
                id,
                item.tierId,
                containerIds(db, id, item.tierId).filter((g) => g !== input.igdbId)
            );
        touch(db, id);
        return getTierList(db, userId, id);
    });
}

export function removeTierItem(db: Db, userId: number, id: number, igdbId: number): TierListDto {
    return db.transaction((tx) => {
        const db = tx as unknown as Db;
        requireList(db, userId, id);
        const item = db
            .select()
            .from(tierItems)
            .where(and(eq(tierItems.tierListId, id), eq(tierItems.gameId, igdbId)))
            .get();
        if (!item) throw new HttpError(404, 'That game is not in this tier list');
        db.delete(tierItems)
            .where(and(eq(tierItems.tierListId, id), eq(tierItems.gameId, igdbId)))
            .run();
        setOrder(db, id, item.tierId, containerIds(db, id, item.tierId));
        touch(db, id);
        return getTierList(db, userId, id);
    });
}
