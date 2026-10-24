import { and, count, eq } from 'drizzle-orm';
import {
    ENTRY_STATUSES,
    FINISHED_UNKNOWN_YEAR,
    entryQuerySchema,
    fullName,
    toPublicEntry,
    type EntryDto,
    type ActivityPageDto,
    type EntryStatus,
    type PageQuery,
    type ProfileDto,
    type ProfileGameDto,
    type ProfileGamesDto,
    type ProfileListPageDto,
    type ProfileView,
    type ProfileWishlistDto,
    type PublicEntryDto
} from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import {
    entries,
    listItems,
    lists,
    playthroughs,
    users,
    wishlistItems,
    wishlists
} from '../db/schema.js';
import { HttpError } from '../errors.js';
import { pageActivity } from './activity.js';
import { avatarVersion } from './avatars.js';
import { socialLinksOf } from './users.js';
import { hydrate, listEntries, pageEntries } from './entries.js';
import { loadGames } from './games.js';
import { listGrids } from './grids.js';
import { listTierLists } from './tier-lists.js';
import { getList, listLists } from './lists.js';
import { getRecap } from './recap.js';
import { getStats } from './stats.js';
import { listSlots } from './slots.js';
import { getSmartList, listSmartLists } from './smart-lists.js';
import { findWishlist, wishlistItemsOf } from './wishlist.js';

const toPublic = toPublicEntry;

/** Raw events sent with the profile; the web client groups them and shows the first few groups. */
const PROFILE_ACTIVITY_PREVIEW = 30;
/** Games in each highlight row (recently finished, favorites). */
const HIGHLIGHT_ROW = 12;

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
        .select({ status: entries.status, favorite: entries.favorite })
        .from(entries)
        .where(eq(entries.userId, user.id))
        .all();
    for (const { status } of statuses) byStatus[status]++;
    const favorites = statuses.filter((s) => s.favorite).length;

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
        bio: user.bio,
        socialLinks: socialLinksOf(user),
        joinedAt: user.createdAt,
        slots: listSlots(db, user.id).map((s) => ({
            name: s.name,
            entry: s.entry ? toPublic(s.entry) : null
        })),
        summary: { total: statuses.length, queued, wishlisted, favorites, byStatus },
        lists: listLists(db, user.id).map((l) => ({
            id: l.id,
            name: l.name,
            total: l.count,
            covers: l.covers
        })),
        smartLists: listSmartLists(db, user.id).map((l) => ({
            id: l.id,
            name: l.name,
            total: l.count,
            covers: l.covers
        })),
        grids: listGrids(db, user.id),
        tierLists: listTierLists(db, user.id),
        recentlyFinished: getFinishedGames(db, user, { limit: 200, offset: 0 })
            .entries.filter((e) => e.lastFinishedOn !== null)
            .slice(0, HIGHLIGHT_ROW),
        favoriteGames: pageEntries(
            db,
            user.id,
            entryQuerySchema.parse({ favorite: 'true', sort: 'rating' }),
            { limit: HIGHLIGHT_ROW, offset: 0 }
        ).entries.map(toPublic),
        activity: user.showActivity
            ? pageActivity(db, user.id, { limit: PROFILE_ACTIVITY_PREVIEW, offset: 0 })
            : null
    };
}

/** One of a user's lists, a page at a time (the profile itself only shows tiles). */
export function getProfileList(
    db: Db,
    username: string,
    listId: number,
    page: PageQuery
): ProfileListPageDto {
    const user = requireUser(db, username);
    const list = db
        .select({ id: lists.id, name: lists.name, description: lists.description })
        .from(lists)
        .where(and(eq(lists.id, listId), eq(lists.userId, user.id), eq(lists.kind, 'list')))
        .get();
    if (!list) throw new HttpError(404, 'Not found');
    const { entries, total } = getList(db, user.id, list.id, page);
    return {
        name: list.name,
        description: list.description,
        entries: entries.map(toPublic),
        total
    };
}

export function getProfileSmartList(
    db: Db,
    username: string,
    smartListId: number,
    page: PageQuery
): ProfileListPageDto {
    const user = requireUser(db, username);
    const { name, description, ruleText, entries, total } = getSmartList(
        db,
        user.id,
        smartListId,
        page
    );
    return { name, description, ruleText, entries: entries.map(toPublic), total };
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
export function getProfileWishlist(db: Db, username: string, page: PageQuery): ProfileWishlistDto {
    const user = requireUser(db, username);
    const wl = findWishlist(db, user.id);
    const { items, total } = wl ? wishlistItemsOf(db, wl.id, page) : { items: [], total: 0 };
    return {
        username: user.username,
        total,
        items: items.map((i) => ({ igdbId: i.igdbId, game: i.game, platform: i.platform }))
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
    page: PageQuery,
    year?: string
): ProfileGamesDto {
    const user = requireUser(db, username);
    if (view === 'finished') return getFinishedGames(db, user, page, year);
    let result: { entries: EntryDto[]; total: number };
    if (view === 'queue') {
        const queue = db
            .select({ id: lists.id })
            .from(lists)
            .where(and(eq(lists.userId, user.id), eq(lists.kind, 'queue')))
            .get();
        result = queue ? getList(db, user.id, queue.id, page) : { entries: [], total: 0 };
    } else {
        result = pageEntries(
            db,
            user.id,
            entryQuerySchema.parse(
                view === 'collection'
                    ? {}
                    : view === 'favorites'
                      ? { favorite: 'true' }
                      : view === 'backlog'
                        ? { view }
                        : { status: view }
            ),
            page
        );
    }
    return {
        username: user.username,
        view,
        entries: result.entries.map(toPublic),
        total: result.total
    };
}

/**
 * Finished games, by playthrough: a game finished in 2023 and 2026 is on both year pages (once
 * each), even if it has been restarted since. The all-time page lists games whose status is
 * finished, newest finish first and unknown dates last; a year page is oldest finish first.
 */
function getFinishedGames(
    db: Db,
    user: { id: number; username: string },
    page: PageQuery,
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
            entries: finished.slice(page.offset, page.offset + page.limit).map(toPublic),
            total: finished.length,
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
        entries: inYear.slice(page.offset, page.offset + page.limit).map(toPublic),
        total: inYear.length,
        years
    };
}

/** The activity feed, newest first. A hidden feed is an empty one, same as having done nothing. */
export function getProfileActivity(db: Db, username: string, page: PageQuery): ActivityPageDto {
    const user = requireUser(db, username);
    if (!user.showActivity) return { username: user.username, events: [], total: 0 };
    return { username: user.username, ...pageActivity(db, user.id, page) };
}

/**
 * A game as seen from someone's profile. Answers from the shared cache only: an anonymous request
 * must never make us call IGDB, so a game nobody has cached is a 404.
 */
export function getProfileGame(db: Db, username: string, igdbId: number): ProfileGameDto {
    const user = requireUser(db, username);
    const game = loadGames(db, [igdbId]).get(igdbId);
    if (!game) throw new HttpError(404, 'Not found');
    const owned = db
        .select({ id: entries.id })
        .from(entries)
        .where(and(eq(entries.userId, user.id), eq(entries.gameId, igdbId)))
        .get();
    const wished = db
        .select({ gameId: wishlistItems.gameId })
        .from(wishlistItems)
        .innerJoin(wishlists, eq(wishlists.id, wishlistItems.wishlistId))
        .where(and(eq(wishlists.userId, user.id), eq(wishlistItems.gameId, igdbId)))
        .get();
    const entry = owned ? hydrate(db, user.id, [owned.id])[0] : undefined;
    return {
        username: user.username,
        game,
        entry: entry ? toPublic(entry) : null,
        wishlisted: wished !== undefined
    };
}
