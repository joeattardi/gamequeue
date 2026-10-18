import { z } from 'zod';
import { ENTRY_STATUSES, ratingSchema, tagsSchema } from './collection.js';
import { isoDateSchema } from './playthroughs.js';
import { MAX_SLOTS } from './slots.js';

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
    coverImageId: z.string().max(100).nullable(),
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
        rating: rating.nullable()
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

export const exportEntrySchema = z
    .object({
        igdbId: id,
        game: exportGameSchema,
        status: z.enum(ENTRY_STATUSES),
        rating: rating.nullable(),
        notes: z.string().max(10_000),
        ttbOverrideMinutes: z.number().int().min(1).max(60_000).nullable(),
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
        wishlist: z.array(exportWishlistItemSchema).max(50_000).default([])
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
export type ExportEntry = z.infer<typeof exportEntrySchema>;
export type ExportWishlistItem = z.infer<typeof exportWishlistItemSchema>;

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
    slots: { created: number; filled: number };
    /** Things worth knowing, e.g. values of yours that were kept over the file's */
    notes: string[];
    /** Notes beyond the first 50 */
    moreNotes: number;
}
