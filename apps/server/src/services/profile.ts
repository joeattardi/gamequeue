import { and, count, eq } from 'drizzle-orm';
import {
    ENTRY_STATUSES,
    FINISHED_UNKNOWN_YEAR,
    entryQuerySchema,
    fullName,
    toPublicEntry,
    type EntryDto,
    type EntryStatus,
    type ProfileDto,
    type ProfileGamesDto,
    type ProfileView,
    type ProfileWishlistDto,
    type PublicEntryDto
} from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { entries, listItems, lists, playthroughs, users, wishlistItems } from '../db/schema.js';
import { HttpError } from '../errors.js';
import { avatarVersion } from './avatars.js';
import { socialLinksOf } from './users.js';
import { listEntries } from './entries.js';
import { getList, listLists } from './lists.js';
import { getRecap } from './recap.js';
import { getStats } from './stats.js';
import { listSlots } from './slots.js';
import { listSmartListDetails } from './smart-lists.js';
import { findWishlist, wishlistItemsOf } from './wishlist.js';

const toPublic = toPublicEntry;

function requireUser(db: Db, username: string) {
    const user = db.select().from(users).where(eq(users.username, username)).get();
    if (!user) throw new HttpError(404, 'Not found');
    return user;
}

/** Read-only: must not create anything (so no `getQueue`/`ensureQueue`). The queue has its own page. */
export function getProfile(db: Db, username: string): ProfileDto {
    const user = requireUser(db, username);

    const byStatus = Object.fromEntries(ENTRY_STATUSES.map((s) => [s, 0])) as Record<
        EntryStatus,
        number
    >;
    const statuses = db
        .select({ status: entries.status })
        .from(entries)
        .where(eq(entries.userId, user.id))
        .all();
    for (const { status } of statuses) byStatus[status]++;

    const queued =
        db
            .select({ n: count() })
            .from(listItems)
            .innerJoin(lists, eq(lists.id, listItems.listId))
            .where(and(eq(lists.userId, user.id), eq(lists.kind, 'queue')))
            .get()?.n ?? 0;

    const wl = findWishlist(db, user.id);
    const wishlisted = wl
        ? (db
              .select({ n: count() })
              .from(wishlistItems)
              .where(eq(wishlistItems.wishlistId, wl.id))
              .get()?.n ?? 0)
        : 0;

    return {
        username: user.username,
        avatarUpdatedAt: avatarVersion(db, user.id),
        realName: user.showRealName ? fullName(user) : null,
        socialLinks: socialLinksOf(user),
        joinedAt: user.createdAt,
        slots: listSlots(db, user.id).map((s) => ({
            name: s.name,
            entry: s.entry ? toPublic(s.entry) : null
        })),
        summary: { total: statuses.length, queued, wishlisted, byStatus },
        lists: listLists(db, user.id).map((l) => ({
            id: l.id,
            name: l.name,
            entries: getList(db, user.id, l.id).entries.map(toPublic)
        })),
        smartLists: listSmartListDetails(db, user.id).map((l) => ({
            id: l.id,
            name: l.name,
            description: l.description,
            entries: l.entries.map(toPublic)
        }))
    };
}

/** Read-only and public: the year in review, no notes (see `RecapDto`). */
export function getProfileRecap(db: Db, username: string, year?: number) {
    return getRecap(db, requireUser(db, username).id, year);
}

/** Read-only and public: counts and games without notes (see `StatsDto`). */
export function getProfileStats(db: Db, username: string) {
    return getStats(db, requireUser(db, username).id);
}

/** Read-only like the rest: a user who never wishlisted anything has no wishlist row, which reads as empty. Notes stay private. */
export function getProfileWishlist(db: Db, username: string): ProfileWishlistDto {
    const user = requireUser(db, username);
    const wl = findWishlist(db, user.id);
    return {
        username: user.username,
        items: (wl ? wishlistItemsOf(db, wl.id) : []).map((i) => ({
            igdbId: i.igdbId,
            game: i.game,
            platform: i.platform
        }))
    };
}

/**
 * Read-only: a user who never queued anything has no queue row yet, which reads as empty.
 * Only the queue is ordered by the user; everything else is sorted by title.
 */
export function getProfileGames(
    db: Db,
    username: string,
    view: ProfileView,
    year?: string
): ProfileGamesDto {
    const user = requireUser(db, username);
    if (view === 'finished') return getFinishedGames(db, user, year);
    let list: EntryDto[];
    if (view === 'queue') {
        const queue = db
            .select({ id: lists.id })
            .from(lists)
            .where(and(eq(lists.userId, user.id), eq(lists.kind, 'queue')))
            .get();
        list = queue ? getList(db, user.id, queue.id).entries : [];
    } else if (view === 'collection') {
        list = listEntries(db, user.id, entryQuerySchema.parse({}));
    } else {
        list = listEntries(
            db,
            user.id,
            entryQuerySchema.parse(view === 'backlog' ? { view } : { status: view })
        );
    }
    return { username: user.username, view, entries: list.map(toPublic) };
}

/**
 * Finished games, by playthrough: a game finished in 2023 and 2026 is on both year pages (once
 * each), even if it has been restarted since. The all-time page lists games whose status is
 * finished, newest finish first and unknown dates last; a year page is oldest finish first.
 */
function getFinishedGames(
    db: Db,
    user: { id: number; username: string },
    year?: string
): ProfileGamesDto {
    const finishes = db
        .select({
            id: playthroughs.id,
            entryId: playthroughs.entryId,
            endedOn: playthroughs.endedOn
        })
        .from(playthroughs)
        .where(and(eq(playthroughs.userId, user.id), eq(playthroughs.outcome, 'finished')))
        .all();
    const yearOf = (endedOn: string | null) => endedOn?.slice(0, 4) ?? FINISHED_UNKNOWN_YEAR;

    const gamesPerYear = new Map<string, Set<number>>();
    for (const f of finishes) {
        const y = yearOf(f.endedOn);
        gamesPerYear.set(y, (gamesPerYear.get(y) ?? new Set()).add(f.entryId));
    }
    const years = [...gamesPerYear]
        .map(([y, ids]) => ({ year: y, count: ids.size }))
        .sort((a, b) =>
            a.year === FINISHED_UNKNOWN_YEAR
                ? 1
                : b.year === FINISHED_UNKNOWN_YEAR
                  ? -1
                  : b.year.localeCompare(a.year)
        );

    const all = listEntries(db, user.id, entryQuerySchema.parse({}));
    if (year === undefined) {
        const finished = all
            .filter((e) => e.status === 'finished')
            .sort(
                (a, b) =>
                    (b.lastFinishedOn ?? '').localeCompare(a.lastFinishedOn ?? '') ||
                    a.game.name.localeCompare(b.game.name)
            );
        return {
            username: user.username,
            view: 'finished',
            entries: finished.map(toPublic),
            years
        };
    }

    // The last finish within the year decides a game's place; ties keep the order they were logged.
    const lastFinish = new Map<number, { endedOn: string; id: number }>();
    for (const f of finishes) {
        if (yearOf(f.endedOn) !== year) continue;
        const prev = lastFinish.get(f.entryId);
        const next = { endedOn: f.endedOn ?? '', id: f.id };
        if (
            !prev ||
            next.endedOn > prev.endedOn ||
            (next.endedOn === prev.endedOn && next.id > prev.id)
        )
            lastFinish.set(f.entryId, next);
    }
    const inYear = all
        .filter((e) => lastFinish.has(e.id))
        .sort((a, b) => {
            const x = lastFinish.get(a.id)!;
            const y = lastFinish.get(b.id)!;
            return x.endedOn.localeCompare(y.endedOn) || x.id - y.id;
        });
    return {
        username: user.username,
        view: 'finished',
        year,
        entries: inYear.map(toPublic),
        years
    };
}
