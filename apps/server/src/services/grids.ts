import { and, asc, count, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import {
    GRID_LABEL_PROMPTS,
    MAX_GRIDS,
    type CreateGridInput,
    type GridCellDto,
    type GridDto,
    type GridSummaryDto,
    type PatchGridInput,
    type PublicGridDto,
    type SetGridCellInput
} from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { gridCells, grids, users } from '../db/schema.js';
import { HttpError } from '../errors.js';
import type { IgdbClient } from '../igdb/types.js';
import { forgetSubject, recordActivity } from './activity.js';
import { ensureGame, loadGames } from './games.js';

type GridRow = typeof grids.$inferSelect;

function requireGrid(db: Db, userId: number, id: number): GridRow {
    const g = db
        .select()
        .from(grids)
        .where(and(eq(grids.id, id), eq(grids.userId, userId)))
        .get();
    if (!g) throw new HttpError(404, 'Grid not found');
    return g;
}

const touch = (db: Db, id: number) =>
    db.update(grids).set({ updatedAt: Date.now() }).where(eq(grids.id, id)).run();

/** Every cell of the grid in order, empty ones included. */
function toDto(db: Db, g: GridRow): GridDto {
    const stored = new Map(
        db
            .select()
            .from(gridCells)
            .where(eq(gridCells.gridId, g.id))
            .all()
            .map((c) => [c.position, c])
    );
    const gameIds = [...stored.values()].flatMap((c) => (c.gameId === null ? [] : [c.gameId]));
    const cached = loadGames(db, [...new Set(gameIds)]);
    const cells: GridCellDto[] = Array.from({ length: g.cols * g.rows }, (_, position) => {
        const c = stored.get(position);
        return {
            position,
            label: c?.label ?? '',
            game: (c?.gameId != null && cached.get(c.gameId)) || null
        };
    });
    return {
        id: g.id,
        title: g.title,
        description: g.description,
        cols: g.cols,
        rows: g.rows,
        cells,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt
    };
}

export function getGrid(db: Db, userId: number, id: number): GridDto {
    return toDto(db, requireGrid(db, userId, id));
}

/** Anyone's grid by username and id; a grid under the wrong username is a 404. */
export function getPublicGrid(db: Db, username: string, id: number): PublicGridDto {
    const row = db
        .select({ g: grids })
        .from(grids)
        .innerJoin(users, eq(users.id, grids.userId))
        .where(
            and(eq(grids.id, id), eq(users.username, username), isNotNull(users.emailVerifiedAt))
        )
        .get();
    if (!row) throw new HttpError(404, 'Not found');
    return { ...toDto(db, row.g), username };
}

/** A user's grids as tiles, newest first. */
export function listGrids(db: Db, userId: number): GridSummaryDto[] {
    const rows = db
        .select()
        .from(grids)
        .where(eq(grids.userId, userId))
        .orderBy(desc(grids.updatedAt), desc(grids.id))
        .all();
    if (rows.length === 0) return [];
    const cells = db
        .select({ gridId: gridCells.gridId, gameId: gridCells.gameId })
        .from(gridCells)
        .where(
            inArray(
                gridCells.gridId,
                rows.map((r) => r.id)
            )
        )
        .orderBy(asc(gridCells.position))
        .all()
        .filter((c) => c.gameId !== null);
    const cached = loadGames(db, [...new Set(cells.map((c) => c.gameId!))]);
    return rows.map((g) => {
        const mine = cells.filter((c) => c.gridId === g.id);
        return {
            id: g.id,
            title: g.title,
            cols: g.cols,
            rows: g.rows,
            filled: mine.length,
            covers: mine
                .flatMap((c) => {
                    const cover = cached.get(c.gameId!)?.coverImageId;
                    return cover ? [cover] : [];
                })
                .slice(0, 4)
        };
    });
}

export function createGrid(db: Db, userId: number, input: CreateGridInput): GridDto {
    return db.transaction((tx) => {
        const have = tx.select({ n: count() }).from(grids).where(eq(grids.userId, userId)).get()!.n;
        if (have >= MAX_GRIDS) throw new HttpError(409, `You can have up to ${MAX_GRIDS} grids`);
        const g = tx
            .insert(grids)
            .values({
                userId,
                title: input.title,
                description: input.description ?? '',
                cols: input.cols,
                rows: input.rows
            })
            .returning()
            .get();
        if (input.prompts) {
            const labels = GRID_LABEL_PROMPTS.slice(0, g.cols * g.rows);
            tx.insert(gridCells)
                .values(labels.map((label, position) => ({ gridId: g.id, position, label })))
                .run();
        }
        recordActivity(tx as unknown as Db, userId, {
            type: 'grid',
            subjectId: g.id,
            subjectName: g.title
        });
        return toDto(tx as unknown as Db, g);
    });
}

/** Changes the title or description, or resizes: cells keep their row and column where they still fit. */
export function patchGrid(db: Db, userId: number, id: number, patch: PatchGridInput): GridDto {
    return db.transaction((tx) => {
        const db = tx as unknown as Db;
        const g = requireGrid(db, userId, id);
        const cols = patch.cols ?? g.cols;
        const rows = patch.rows ?? g.rows;
        if (cols !== g.cols || rows !== g.rows) {
            const kept = db
                .select()
                .from(gridCells)
                .where(eq(gridCells.gridId, id))
                .all()
                .flatMap((c) => {
                    const row = Math.floor(c.position / g.cols);
                    const col = c.position % g.cols;
                    return row < rows && col < cols ? [{ ...c, position: row * cols + col }] : [];
                });
            db.delete(gridCells).where(eq(gridCells.gridId, id)).run();
            if (kept.length) db.insert(gridCells).values(kept).run();
        }
        const updated = db
            .update(grids)
            .set({
                title: patch.title ?? g.title,
                description: patch.description ?? g.description,
                cols,
                rows,
                updatedAt: Date.now()
            })
            .where(eq(grids.id, id))
            .returning()
            .get();
        return toDto(db, updated);
    });
}

export function deleteGrid(db: Db, userId: number, id: number) {
    requireGrid(db, userId, id);
    db.transaction((tx) => {
        tx.delete(grids).where(eq(grids.id, id)).run();
        forgetSubject(tx as unknown as Db, userId, ['grid'], id);
    });
}

/**
 * Sets a cell's label and/or game. Placing a game caches it from IGDB if we have never seen it
 * (the only IGDB call, and it is one per placement a person made); an empty cell with no label
 * is simply not stored.
 */
export async function setGridCell(
    db: Db,
    igdb: IgdbClient | undefined,
    userId: number,
    id: number,
    position: number,
    input: SetGridCellInput
): Promise<GridDto> {
    const g = requireGrid(db, userId, id);
    if (!Number.isInteger(position) || position < 0 || position >= g.cols * g.rows)
        throw new HttpError(404, 'No such cell');
    if (input.igdbId) await ensureGame(db, igdb, input.igdbId);
    const current = db
        .select()
        .from(gridCells)
        .where(and(eq(gridCells.gridId, id), eq(gridCells.position, position)))
        .get();
    const label = input.label ?? current?.label ?? '';
    const gameId = input.igdbId === undefined ? (current?.gameId ?? null) : input.igdbId;
    if (!label && gameId === null) {
        db.delete(gridCells)
            .where(and(eq(gridCells.gridId, id), eq(gridCells.position, position)))
            .run();
    } else {
        db.insert(gridCells)
            .values({ gridId: id, position, label, gameId })
            .onConflictDoUpdate({
                target: [gridCells.gridId, gridCells.position],
                set: { label, gameId }
            })
            .run();
    }
    touch(db, id);
    return getGrid(db, userId, id);
}

/** Swaps two cells' contents (label and game), for rearranging by drag or buttons. */
export function swapGridCells(db: Db, userId: number, id: number, a: number, b: number): GridDto {
    return db.transaction((tx) => {
        const db = tx as unknown as Db;
        const g = requireGrid(db, userId, id);
        const max = g.cols * g.rows;
        if ([a, b].some((p) => p < 0 || p >= max)) throw new HttpError(404, 'No such cell');
        if (a === b) return toDto(db, g);
        const cells = db.select().from(gridCells).where(eq(gridCells.gridId, id)).all();
        const at = (p: number) => cells.find((c) => c.position === p);
        const ca = at(a);
        const cb = at(b);
        db.delete(gridCells)
            .where(and(eq(gridCells.gridId, id), inArray(gridCells.position, [a, b])))
            .run();
        const moved = [
            ...(cb ? [{ ...cb, position: a }] : []),
            ...(ca ? [{ ...ca, position: b }] : [])
        ];
        if (moved.length) db.insert(gridCells).values(moved).run();
        touch(db, id);
        return toDto(db, requireGrid(db, userId, id));
    });
}
