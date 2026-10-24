import { z } from 'zod';
import type { GameDto } from './collection.js';

export const GRID_MIN_SIZE = 1;
export const GRID_MAX_SIZE = 5;
export const DEFAULT_GRID_COLS = 5;
export const DEFAULT_GRID_ROWS = 4;
export const MAX_GRID_TITLE = 80;
export const MAX_GRID_DESCRIPTION = 300;
export const MAX_CELL_LABEL = 60;
/** Per user; a guard against runaway creation, not a product limit */
export const MAX_GRIDS = 50;

/** Starting labels offered when a grid is created (row by row), and as suggestions in the editor. */
export const GRID_LABEL_PROMPTS = [
    'All-time favorite',
    'Best soundtrack',
    'Best story',
    'Most underrated',
    'Most overrated',
    'Guilty pleasure',
    'Hardest game',
    'Best co-op',
    'Childhood favorite',
    'Best graphics',
    'Most replayed',
    'Biggest surprise',
    'Biggest disappointment',
    'Best boss fight',
    'Most emotional',
    'Best soundtrack on a handheld',
    'Game I recommend most',
    'Best indie',
    'Best remake',
    'Best sequel',
    'Best multiplayer',
    'Wish I could play again for the first time',
    'Most atmospheric',
    'Best gameplay',
    'Currently playing'
] as const;

export interface GridCellDto {
    /** Row-major index: `row * cols + col` */
    position: number;
    label: string;
    game: GameDto | null;
}

/** A grid with every cell, empty ones included (`cols * rows` of them, in order). */
export interface GridDto {
    id: number;
    title: string;
    description: string;
    cols: number;
    rows: number;
    cells: GridCellDto[];
    createdAt: number;
    updatedAt: number;
}

/** What anyone may see: a grid and whose it is. Grids hold no private data. */
export interface PublicGridDto extends GridDto {
    username: string;
}

/** A grid as a tile on the grids page and the public profile. */
export interface GridSummaryDto {
    id: number;
    title: string;
    cols: number;
    rows: number;
    /** Cells with a game */
    filled: number;
    /** Cover image ids of the first few filled cells that have one */
    covers: string[];
}

const size = z.number().int().min(GRID_MIN_SIZE).max(GRID_MAX_SIZE);
const title = z.string().trim().min(1).max(MAX_GRID_TITLE);
const description = z.string().trim().max(MAX_GRID_DESCRIPTION);

export const createGridSchema = z.object({
    title,
    description: description.optional(),
    cols: size.default(DEFAULT_GRID_COLS),
    rows: size.default(DEFAULT_GRID_ROWS),
    /** Start with the suggested labels in the cells */
    prompts: z.boolean().default(false)
});
export type CreateGridInput = z.infer<typeof createGridSchema>;

/** Shrinking drops the cells that fall outside; growing adds empty ones. */
export const patchGridSchema = z
    .object({ title, description, cols: size, rows: size })
    .partial()
    .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type PatchGridInput = z.infer<typeof patchGridSchema>;

/** `igdbId: null` empties the game but keeps the label. */
export const setGridCellSchema = z
    .object({
        label: z.string().trim().max(MAX_CELL_LABEL),
        igdbId: z.number().int().positive().nullable()
    })
    .partial()
    .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type SetGridCellInput = z.infer<typeof setGridCellSchema>;

export const swapGridCellsSchema = z.object({
    a: z.number().int().min(0),
    b: z.number().int().min(0)
});
