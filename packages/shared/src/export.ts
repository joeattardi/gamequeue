import { z } from 'zod';
import {
    ENTRY_STATUSES,
    MAX_NOTE_LENGTH,
    MAX_NOTES_PER_GAME,
    ratingSchema,
    tagsSchema
} from './collection.js';
import { IGDB_IMAGE_ID } from './igdb-images.js';
import { isoDateSchema, playtimeSchema } from './playthroughs.js';
import { releasePrecisionSchema } from './release.js';
import { MAX_SLOTS } from './slots.js';
import { listDescription } from './lists.js';
import { SMART_SORTS, smartRulesSchema } from './smart-lists.js';
import {
    GRID_MAX_SIZE,
    GRID_MIN_SIZE,
    MAX_CELL_LABEL,
    MAX_GRIDS,
    MAX_GRID_DESCRIPTION,
    MAX_GRID_TITLE
} from './grids.js';
import {
    MAX_TIERS,
    MAX_TIER_ITEMS,
    MAX_TIER_LISTS,
    MAX_TIER_LIST_DESCRIPTION,
    MAX_TIER_LIST_TITLE,
    MAX_TIER_NAME,
    TIER_COLOR_KEYS
} from './tiers.js';

export const EXPORT_FORMAT = 'gamequeue-export';
export const EXPORT_VERSION = 1;

const id = z.number().int().positive();
const rating = ratingSchema;

const platformRef = z.object({
    id,
    name: z.string().min(1).max(200),
    abbreviation: z.string().max(50).nullable()
});
const namedRef = z.object({ id, name: z.string().min(1).max(200) });
const seconds = z.number().int().min(0).nullable();

/** Snapshot of the shared metadata cache, so an import never needs IGDB. */
export const exportGameSchema = z.object({
    name: z.string().min(1).max(500),
    slug: z.string().max(500).nullable(),
    summary: z.string().max(20_000).nullable(),
    releaseDate: isoDateSchema.nullable(),
    // Optional so files from before it existed are still valid v1
    releasePrecision: releasePrecisionSchema.nullable().optional(),
    coverImageId: z.string().regex(IGDB_IMAGE_ID, 'Not an IGDB image id').nullable(),
    igdbRating: z.number().int().min(0).max(100).nullable(),
    igdbRatingCount: z.number().int().min(0).nullable(),
    gameType: z.string().max(100).nullable(),
    platforms: z.array(platformRef).max(200),
    genres: z.array(namedRef).max(50),
    themes: z.array(namedRef).max(50),
    ttb: z
        .object({
            hastilySeconds: seconds,
            normallySeconds: seconds,
            completelySeconds: seconds,
            count: z.number().int().min(0)
        })
        .nullable()
});

export const exportPlaythroughSchema = z
    .object({
        platform: platformRef.nullable(),
        startedOn: isoDateSchema.nullable(),
        endedOn: isoDateSchema.nullable(),
        /** null = still in progress */
        outcome: z.enum(['finished', 'abandoned']).nullable(),
        rating: rating.nullable(),
        /** Optional so files from before play time still read as v1 */
        playtimeMinutes: playtimeSchema.nullable().optional()
    })
    .superRefine((p, ctx) => {
        if (p.startedOn && p.endedOn && p.endedOn < p.startedOn) {
            ctx.addIssue({ code: 'custom', path: ['endedOn'], message: 'Ends before it starts' });
        }
        if (p.outcome === null && p.endedOn !== null) {
            ctx.addIssue({
                code: 'custom',
                path: ['endedOn'],
                message: 'An in-progress playthrough has no end date'
            });
        }
    });

export const exportNoteSchema = z.object({
    body: z.string().min(1).max(MAX_NOTE_LENGTH),
    public: z.boolean(),
    createdAt: z.number().int().min(0)
});

export const exportEntrySchema = z
    .object({
        igdbId: id,
        game: exportGameSchema,
        status: z.enum(ENTRY_STATUSES),
        rating: rating.nullable(),
        /** Optional so files from before favorites still read as v1 */
        favorite: z.boolean().optional(),
        /** Files from before multiple notes: one text, read as a private note */
        notes: z.string().max(10_000).optional(),
        /** Optional so older files still read as v1 */
        noteItems: z.array(exportNoteSchema).max(MAX_NOTES_PER_GAME).optional(),
        addedAt: z.number().int().min(0),
        /** Platforms the user owns the game on */
        platforms: z.array(platformRef).min(1, 'Own it on at least one platform').max(30),
        tags: tagsSchema,
        playthroughs: z.array(exportPlaythroughSchema).max(500)
    })
    .superRefine((e, ctx) => {
        if (e.playthroughs.filter((p) => p.outcome === null).length > 1) {
            ctx.addIssue({
                code: 'custom',
                path: ['playthroughs'],
                message: 'Only one playthrough can be in progress'
            });
        }
    });

/** A wishlisted game carries its own metadata snapshot: it isn't in `games`, so nothing else has it. */
export const exportWishlistItemSchema = z.object({
    igdbId: id,
    game: exportGameSchema,
    /** The platform the user means to buy it on */
    platform: platformRef.nullable(),
    note: z.string().max(1000),
    addedAt: z.number().int().min(0)
});

/** A game placed in a grid cell or a tier. Carries its own snapshot: it may be in nothing else of the file. */
export const exportPlacedGameSchema = z.object({ igdbId: id, game: exportGameSchema });

/** Only non-empty cells are listed. */
export const exportGridSchema = z
    .object({
        title: z.string().trim().min(1).max(MAX_GRID_TITLE),
        description: z.string().max(MAX_GRID_DESCRIPTION).default(''),
        cols: z.number().int().min(GRID_MIN_SIZE).max(GRID_MAX_SIZE),
        rows: z.number().int().min(GRID_MIN_SIZE).max(GRID_MAX_SIZE),
        cells: z
            .array(
                z.object({
                    /** Row-major: `row * cols + col` */
                    position: z.number().int().min(0),
                    label: z.string().trim().max(MAX_CELL_LABEL).default(''),
                    game: exportPlacedGameSchema.nullable()
                })
            )
            .max(GRID_MAX_SIZE * GRID_MAX_SIZE)
    })
    .superRefine((g, ctx) => {
        const seen = new Set<number>();
        g.cells.forEach((c, i) => {
            if (c.position >= g.cols * g.rows)
                ctx.addIssue({
                    code: 'custom',
                    path: ['cells', i, 'position'],
                    message: `Cell ${c.position} is outside a ${g.cols} by ${g.rows} grid`
                });
            if (seen.has(c.position))
                ctx.addIssue({
                    code: 'custom',
                    path: ['cells', i, 'position'],
                    message: `Cell ${c.position} appears twice`
                });
            seen.add(c.position);
        });
    });

export const exportTierListSchema = z
    .object({
        title: z.string().trim().min(1).max(MAX_TIER_LIST_TITLE),
        description: z.string().max(MAX_TIER_LIST_DESCRIPTION).default(''),
        /** Top to bottom */
        tiers: z
            .array(
                z.object({
                    name: z.string().trim().min(1).max(MAX_TIER_NAME),
                    color: z.enum(TIER_COLOR_KEYS),
                    /** In order, left to right */
                    games: z.array(exportPlacedGameSchema).max(MAX_TIER_ITEMS)
                })
            )
            .max(MAX_TIERS),
        unranked: z.array(exportPlacedGameSchema).max(MAX_TIER_ITEMS)
    })
    .superRefine((t, ctx) => {
        const all = [...t.tiers.flatMap((x) => x.games), ...t.unranked];
        if (all.length > MAX_TIER_ITEMS)
            ctx.addIssue({
                code: 'custom',
                path: ['tiers'],
                message: `A tier list holds up to ${MAX_TIER_ITEMS} games`
            });
        const seen = new Set<number>();
        for (const g of all) {
            if (seen.has(g.igdbId))
                ctx.addIssue({
                    code: 'custom',
                    path: ['tiers'],
                    message: `Game ${g.igdbId} is in the tier list twice`
                });
            seen.add(g.igdbId);
        }
    });

export const exportFileSchema = z
    .object({
        format: z.literal(EXPORT_FORMAT),
        version: z.literal(EXPORT_VERSION),
        exportedAt: z.string().max(40),
        games: z.array(exportEntrySchema).max(50_000),
        slots: z
            .array(
                z.object({
                    name: z.string().trim().min(1).max(40),
                    position: z.number().int().min(0),
                    /** IGDB id of the game in the slot, if any */
                    igdbId: id.nullable()
                })
            )
            .max(MAX_SLOTS),
        lists: z
            .array(
                z.object({
                    name: z.string().trim().min(1).max(60),
                    /** Added after v1 shipped: optional, an older file has none */
                    description: listDescription.default(''),
                    /** IGDB ids in list order */
                    games: z.array(id)
                })
            )
            .max(500),
        /**
         * IGDB ids in queue order. Added after v1 shipped: files without it are still valid v1,
         * and an older reader just ignores it.
         */
        queue: z.array(id).max(50_000).default([]),
        /**
         * The wishlist, in order. Also added after v1 shipped, so optional in the same way as `queue`.
         * Only the first (today: only) wishlist is exported.
         */
        wishlist: z.array(exportWishlistItemSchema).max(50_000).default([]),
        /**
         * Smart lists (rules only: their games are computed). Also added after v1 shipped, so
         * optional in the same way. Platform rules refer to IGDB platform ids.
         */
        smartLists: z
            .array(
                z.object({
                    name: z.string().trim().min(1).max(60),
                    description: listDescription.default(''),
                    rules: smartRulesSchema,
                    sort: z.enum(SMART_SORTS),
                    dir: z.enum(['asc', 'desc'])
                })
            )
            .max(500)
            .default([]),
        /** Grids and tier lists: also added after v1 shipped, so optional in the same way. */
        grids: z.array(exportGridSchema).max(MAX_GRIDS).default([]),
        tierLists: z.array(exportTierListSchema).max(MAX_TIER_LISTS).default([])
    })
    .superRefine((f, ctx) => {
        const ids = new Set<number>();
        f.games.forEach((g, i) => {
            if (ids.has(g.igdbId)) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['games', i, 'igdbId'],
                    message: `Game ${g.igdbId} appears twice`
                });
            }
            ids.add(g.igdbId);
        });
        f.slots.forEach((s, i) => {
            if (s.igdbId !== null && !ids.has(s.igdbId)) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['slots', i, 'igdbId'],
                    message: `Game ${s.igdbId} isn't in the file`
                });
            }
        });
        f.queue.forEach((g, i) => {
            if (!ids.has(g)) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['queue', i],
                    message: `Game ${g} isn't in the file`
                });
            }
        });
        const wished = new Set<number>();
        f.wishlist.forEach((w, i) => {
            if (wished.has(w.igdbId)) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['wishlist', i, 'igdbId'],
                    message: `Game ${w.igdbId} appears twice`
                });
            }
            wished.add(w.igdbId);
        });
        f.lists.forEach((l, i) =>
            l.games.forEach((g, j) => {
                if (!ids.has(g)) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['lists', i, 'games', j],
                        message: `Game ${g} isn't in the file`
                    });
                }
            })
        );
    });

export type ExportFile = z.infer<typeof exportFileSchema>;
export type ExportGame = z.infer<typeof exportGameSchema>;
export type ExportEntry = z.infer<typeof exportEntrySchema>;
export type ExportWishlistItem = z.infer<typeof exportWishlistItemSchema>;
export type ExportGrid = z.infer<typeof exportGridSchema>;
export type ExportTierList = z.infer<typeof exportTierListSchema>;

export interface ImportReport {
    /** True when nothing was written: this is a preview of what importing would do */
    dryRun: boolean;
    games: { added: number; updated: number; unchanged: number };
    playthroughs: { added: number; duplicates: number; skipped: number };
    lists: { created: number; itemsAdded: number };
    /** Games added to the end of the queue */
    queue: { added: number };
    /** Games added to the end of the wishlist */
    wishlist: { added: number };
    smartLists: { created: number };
    /** Ones you already have by title are kept as they are and counted as skipped */
    grids: { created: number; skipped: number };
    tierLists: { created: number; skipped: number };
    slots: { created: number; filled: number };
    /** Things worth knowing, e.g. values of yours that were kept over the file's */
    notes: string[];
    /** Notes beyond the first 50 */
    moreNotes: number;
}
