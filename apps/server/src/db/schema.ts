import { sql } from 'drizzle-orm';
import { ACTIVITY_TYPES, USER_ROLES, type ReleasePrecision } from '@gamequeue/shared';
import {
    blob,
    index,
    integer,
    primaryKey,
    sqliteTable,
    text,
    uniqueIndex
} from 'drizzle-orm/sqlite-core';

const now = sql`(unixepoch() * 1000)`;

export const users = sqliteTable('users', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // Stored lowercase (usernameSchema), so the plain unique index is case-insensitive
    username: text('username').notNull().unique(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    // Permission level: 'gamer' is the standard user, 'admin' also gets the admin area
    role: text('role', { enum: USER_ROLES }).notNull().default('gamer'),
    // Optional real name; only exposed on the public profile when show_real_name is on
    firstName: text('first_name'),
    lastName: text('last_name'),
    showRealName: integer('show_real_name', { mode: 'boolean' }).notNull().default(false),
    // One-line tagline shown under the name on the public profile; null = none
    bio: text('bio'),
    // Gaming account names, public on the profile once set
    steamId: text('steam_id'),
    xboxGamertag: text('xbox_gamertag'),
    psnId: text('psn_id'),
    discordName: text('discord_name'),
    // Opt-in: when off (the default) the public profile pages are served with noindex
    searchIndexable: integer('search_indexable', { mode: 'boolean' }).notNull().default(false),
    // Whether the activity feed shows on the public profile (events are recorded either way)
    showActivity: integer('show_activity', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull().default(now)
});

/** Instance-wide settings an admin can change at runtime; absent key = use the environment default. */
export const settings = sqliteTable('settings', {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
    updatedAt: integer('updated_at').notNull().default(now)
});

/** Errors the server hit, for the admin page (see services/error-log.ts); pruned by age and count. */
export const errorEvents = sqliteTable(
    'error_events',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        at: integer('at').notNull(),
        kind: text('kind').notNull(),
        message: text('message').notNull(),
        status: integer('status'),
        route: text('route'),
        stack: text('stack'),
        context: text('context')
    },
    (t) => [index('error_events_at_idx').on(t.at), index('error_events_kind_idx').on(t.kind)]
);

/** IGDB requests per UTC day (see services/igdb-history.ts); kept so trends outlive a restart. */
export const igdbDaily = sqliteTable('igdb_daily', {
    day: text('day').primaryKey(),
    ok: integer('ok').notNull().default(0),
    rateLimited: integer('rate_limited').notNull().default(0),
    failed: integer('failed').notNull().default(0)
});

/** One row per server process start (see services/server-runs.ts). */
export const serverRuns = sqliteTable(
    'server_runs',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        startedAt: integer('started_at').notNull(),
        version: text('version').notNull(),
        /** Updated about once a minute while running, so a hard kill still has an end time */
        lastSeenAt: integer('last_seen_at').notNull(),
        endedAt: integer('ended_at'),
        ended: text('ended', { enum: ['clean', 'crash', 'unclean'] })
    },
    (t) => [index('server_runs_started_idx').on(t.startedAt)]
);

/** Uploaded avatar image (already cropped and re-encoded by the client); kept out of `users` so user lookups never load the blob. */
export const avatars = sqliteTable('avatars', {
    userId: integer('user_id')
        .primaryKey()
        .references(() => users.id, { onDelete: 'cascade' }),
    contentType: text('content_type').notNull(),
    data: blob('data', { mode: 'buffer' }).notNull(),
    updatedAt: integer('updated_at').notNull()
});

export const sessions = sqliteTable(
    'sessions',
    {
        // sha256(token) as hex; the raw token only ever lives in the cookie
        id: text('id').primaryKey(),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        expiresAt: integer('expires_at').notNull(),
        createdAt: integer('created_at').notNull().default(now)
    },
    (t) => [index('sessions_user_idx').on(t.userId)]
);

export const slots = sqliteTable(
    'slots',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        position: integer('position').notNull(),
        // The game occupying this slot. One row per slot means a slot holds at most one game.
        // Deleting an entry just empties its slot.
        entryId: integer('entry_id').references(() => entries.id, { onDelete: 'set null' })
    },
    (t) => [
        uniqueIndex('slots_user_position_idx').on(t.userId, t.position),
        // ...and a game can't sit in two slots at once
        uniqueIndex('slots_user_entry_idx')
            .on(t.userId, t.entryId)
            .where(sql`${t.entryId} IS NOT NULL`)
    ]
);

// ---------------------------------------------------------------------------
// Shared game metadata cache (no user_id). Ids are IGDB ids.
// ---------------------------------------------------------------------------

export const platforms = sqliteTable('platforms', {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    abbreviation: text('abbreviation')
});

export const genres = sqliteTable('genres', {
    id: integer('id').primaryKey(),
    name: text('name').notNull()
});

export const themes = sqliteTable('themes', {
    id: integer('id').primaryKey(),
    name: text('name').notNull()
});

export const games = sqliteTable('games', {
    id: integer('id').primaryKey(), // IGDB game id
    name: text('name').notNull(),
    slug: text('slug'),
    summary: text('summary'),
    releaseDate: text('release_date'), // YYYY-MM-DD
    releasePrecision: text('release_precision').$type<ReleasePrecision>(), // null = unknown
    releaseCheckedAt: integer('release_checked_at'), // last time IGDB was asked for the date
    seriesCheckedAt: integer('series_checked_at'), // null = never asked IGDB which series it is in
    coverImageId: text('cover_image_id'),
    screenshots: text('screenshots'), // JSON array of IGDB image ids; null = never asked IGDB
    igdbRating: integer('igdb_rating'), // 0-100
    igdbRatingCount: integer('igdb_rating_count'),
    gameType: text('game_type'),
    ttbHastilySeconds: integer('ttb_hastily_s'),
    ttbNormallySeconds: integer('ttb_normally_s'),
    ttbCompletelySeconds: integer('ttb_completely_s'),
    ttbCount: integer('ttb_count'),
    fetchedAt: integer('fetched_at').notNull()
});

/**
 * Cached IsThereAnyDeal prices, one row per game for the server's configured country. Shared like
 * `games`. `itadId` is null when ITAD doesn't know the game (matched by title, so it can miss);
 * the amounts are null when no shop sells it.
 */
export const gamePrices = sqliteTable('game_prices', {
    gameId: integer('game_id')
        .primaryKey()
        .references(() => games.id, { onDelete: 'cascade' }),
    itadId: text('itad_id'),
    currency: text('currency'),
    amount: integer('amount'), // minor units
    regular: integer('regular'),
    cut: integer('cut'),
    shop: text('shop'),
    url: text('url'),
    historyLow: integer('history_low'),
    country: text('country').notNull(), // prices are for this country's shops and currency
    checkedAt: integer('checked_at').notNull()
});

/** IGDB series ("collections"). Shared cache, like games. */
export const series = sqliteTable('series', {
    id: integer('id').primaryKey(), // IGDB collection id
    name: text('name').notNull(),
    membersFetchedAt: integer('members_fetched_at') // null = member list never fetched
});

export const gameSeries = sqliteTable(
    'game_series',
    {
        gameId: integer('game_id')
            .notNull()
            .references(() => games.id, { onDelete: 'cascade' }),
        seriesId: integer('series_id')
            .notNull()
            .references(() => series.id, { onDelete: 'cascade' })
    },
    (t) => [
        primaryKey({ columns: [t.gameId, t.seriesId] }),
        index('game_series_series').on(t.seriesId)
    ]
);

/** The games of a series as IGDB lists them, cached for the series page. Not necessarily in `games`. */
export const seriesMembers = sqliteTable(
    'series_members',
    {
        seriesId: integer('series_id')
            .notNull()
            .references(() => series.id, { onDelete: 'cascade' }),
        gameId: integer('game_id').notNull(), // IGDB game id
        name: text('name').notNull(),
        coverImageId: text('cover_image_id'),
        releaseDate: text('release_date'),
        releasePrecision: text('release_precision').$type<ReleasePrecision>()
    },
    (t) => [primaryKey({ columns: [t.seriesId, t.gameId] })]
);

export const gamePlatforms = sqliteTable(
    'game_platforms',
    {
        gameId: integer('game_id')
            .notNull()
            .references(() => games.id, { onDelete: 'cascade' }),
        platformId: integer('platform_id')
            .notNull()
            .references(() => platforms.id)
    },
    (t) => [primaryKey({ columns: [t.gameId, t.platformId] })]
);

export const gameGenres = sqliteTable(
    'game_genres',
    {
        gameId: integer('game_id')
            .notNull()
            .references(() => games.id, { onDelete: 'cascade' }),
        genreId: integer('genre_id')
            .notNull()
            .references(() => genres.id)
    },
    (t) => [
        primaryKey({ columns: [t.gameId, t.genreId] }),
        index('game_genres_genre_idx').on(t.genreId)
    ]
);

export const gameThemes = sqliteTable(
    'game_themes',
    {
        gameId: integer('game_id')
            .notNull()
            .references(() => games.id, { onDelete: 'cascade' }),
        themeId: integer('theme_id')
            .notNull()
            .references(() => themes.id)
    },
    (t) => [primaryKey({ columns: [t.gameId, t.themeId] })]
);

// ---------------------------------------------------------------------------
// Per-user collection
// ---------------------------------------------------------------------------

export const entries = sqliteTable(
    'entries',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        gameId: integer('game_id')
            .notNull()
            .references(() => games.id),
        status: text('status', { enum: ['unplayed', 'playing', 'paused', 'finished', 'abandoned'] })
            .notNull()
            .default('unplayed'),
        rating: integer('rating'), // 1-5 stars
        favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
        notes: text('notes').notNull().default(''),
        addedAt: integer('added_at').notNull().default(now),
        updatedAt: integer('updated_at').notNull().default(now)
    },
    (t) => [
        uniqueIndex('entries_user_game_idx').on(t.userId, t.gameId),
        index('entries_user_status_idx').on(t.userId, t.status)
    ]
);

export const entryPlatforms = sqliteTable(
    'entry_platforms',
    {
        entryId: integer('entry_id')
            .notNull()
            .references(() => entries.id, { onDelete: 'cascade' }),
        platformId: integer('platform_id')
            .notNull()
            .references(() => platforms.id)
    },
    (t) => [primaryKey({ columns: [t.entryId, t.platformId] })]
);

export const tags = sqliteTable(
    'tags',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        name: text('name').notNull()
    },
    (t) => [uniqueIndex('tags_user_name_idx').on(t.userId, sql`lower(${t.name})`)]
);

export const entryTags = sqliteTable(
    'entry_tags',
    {
        entryId: integer('entry_id')
            .notNull()
            .references(() => entries.id, { onDelete: 'cascade' }),
        tagId: integer('tag_id')
            .notNull()
            .references(() => tags.id, { onDelete: 'cascade' })
    },
    (t) => [primaryKey({ columns: [t.entryId, t.tagId] }), index('entry_tags_tag_idx').on(t.tagId)]
);

export const playthroughs = sqliteTable(
    'playthroughs',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        entryId: integer('entry_id')
            .notNull()
            .references(() => entries.id, { onDelete: 'cascade' }),
        platformId: integer('platform_id').references(() => platforms.id),
        // ISO dates (YYYY-MM-DD). Null = unknown, e.g. a game finished long ago.
        startedOn: text('started_on'),
        endedOn: text('ended_on'),
        // null while the playthrough is still open
        outcome: text('outcome', { enum: ['finished', 'abandoned'] }),
        rating: integer('rating'), // 1-5 stars
        // Total time played, entered by the user (usually when finishing); null = not recorded
        playtimeMinutes: integer('playtime_minutes')
    },
    (t) => [
        index('playthroughs_entry_idx').on(t.entryId),
        index('playthroughs_user_ended_idx').on(t.userId, t.endedOn),
        // At most one open playthrough per entry
        uniqueIndex('playthroughs_one_open_idx')
            .on(t.entryId)
            .where(sql`${t.outcome} IS NULL`)
    ]
);

export const lists = sqliteTable(
    'lists',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        description: text('description').notNull().default(''),
        // 'queue' is the user's one "up next" list; it's created on first use
        kind: text('kind', { enum: ['list', 'queue'] })
            .notNull()
            .default('list'),
        createdAt: integer('created_at').notNull().default(now)
    },
    (t) => [
        index('lists_user_idx').on(t.userId),
        uniqueIndex('lists_one_queue_idx')
            .on(t.userId)
            .where(sql`${t.kind} = 'queue'`)
    ]
);

// ---------------------------------------------------------------------------
// Wishlist: games the user wants but doesn't own. Separate from entries on purpose, so nothing
// about the collection (backlog, stats, pick, slots) has to know about unowned games.
// ---------------------------------------------------------------------------

// A user's first wishlist (lowest id) is "the" wishlist today; `ensureWishlist` creates it lazily.
// There is deliberately no unique index per user, so more wishlists are a UI/API change only.
export const wishlists = sqliteTable(
    'wishlists',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        createdAt: integer('created_at').notNull().default(now)
    },
    (t) => [index('wishlists_user_idx').on(t.userId)]
);

export const wishlistItems = sqliteTable(
    'wishlist_items',
    {
        wishlistId: integer('wishlist_id')
            .notNull()
            .references(() => wishlists.id, { onDelete: 'cascade' }),
        gameId: integer('game_id')
            .notNull()
            .references(() => games.id),
        // 0-based order within the wishlist; rewritten wholesale on reorder
        position: integer('position').notNull(),
        // The platform the user intends to buy it on
        platformId: integer('platform_id').references(() => platforms.id, {
            onDelete: 'set null'
        }),
        note: text('note').notNull().default(''),
        addedAt: integer('added_at').notNull().default(now)
    },
    (t) => [
        primaryKey({ columns: [t.wishlistId, t.gameId] }),
        index('wishlist_items_game_idx').on(t.gameId)
    ]
);

// ---------------------------------------------------------------------------
// Grids: a shareable cols x rows board of games, each cell with a label ("Best soundtrack").
// Public by design (the grid itself holds nothing private). Only non-empty cells are stored.
// ---------------------------------------------------------------------------

export const grids = sqliteTable(
    'grids',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        title: text('title').notNull(),
        description: text('description').notNull().default(''),
        cols: integer('cols').notNull(),
        rows: integer('rows').notNull(),
        createdAt: integer('created_at').notNull().default(now),
        updatedAt: integer('updated_at').notNull().default(now)
    },
    (t) => [index('grids_user_idx').on(t.userId)]
);

export const gridCells = sqliteTable(
    'grid_cells',
    {
        gridId: integer('grid_id')
            .notNull()
            .references(() => grids.id, { onDelete: 'cascade' }),
        // Row-major: row * cols + col
        position: integer('position').notNull(),
        label: text('label').notNull().default(''),
        // Points at the shared cache; `ensureGame` runs when a game is placed
        gameId: integer('game_id').references(() => games.id)
    },
    (t) => [
        primaryKey({ columns: [t.gridId, t.position] }),
        index('grid_cells_game_idx').on(t.gameId)
    ]
);

// ---------------------------------------------------------------------------
// Tier lists: games ranked into named, coloured tiers (S, A, B...), like tiermaker. Public by design.
// A game is in a tier list at most once: in one tier, or `tier_id` null = the unranked pool.
// ---------------------------------------------------------------------------

export const tierLists = sqliteTable(
    'tier_lists',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        title: text('title').notNull(),
        description: text('description').notNull().default(''),
        createdAt: integer('created_at').notNull().default(now),
        updatedAt: integer('updated_at').notNull().default(now)
    },
    (t) => [index('tier_lists_user_idx').on(t.userId)]
);

export const tiers = sqliteTable(
    'tiers',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        tierListId: integer('tier_list_id')
            .notNull()
            .references(() => tierLists.id, { onDelete: 'cascade' }),
        // 0-based, top to bottom; rewritten wholesale on reorder
        position: integer('position').notNull(),
        name: text('name').notNull(),
        // A key of TIER_COLORS
        color: text('color').notNull().default('gray')
    },
    (t) => [index('tiers_list_idx').on(t.tierListId)]
);

export const tierItems = sqliteTable(
    'tier_items',
    {
        tierListId: integer('tier_list_id')
            .notNull()
            .references(() => tierLists.id, { onDelete: 'cascade' }),
        gameId: integer('game_id')
            .notNull()
            .references(() => games.id),
        // Null = unranked. Deleting a tier returns its games to the pool
        tierId: integer('tier_id').references(() => tiers.id, { onDelete: 'set null' }),
        // 0-based within its tier (or the pool); rewritten when items move
        position: integer('position').notNull()
    },
    (t) => [
        primaryKey({ columns: [t.tierListId, t.gameId] }),
        index('tier_items_game_idx').on(t.gameId),
        index('tier_items_tier_idx').on(t.tierId)
    ]
);

// Games the user told Discover not to suggest again. Keyed by IGDB id with no games FK: a suggestion
// is usually a game we have never cached.
export const dismissedGames = sqliteTable(
    'dismissed_games',
    {
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        gameId: integer('game_id').notNull(),
        dismissedAt: integer('dismissed_at').notNull().default(now)
    },
    (t) => [primaryKey({ columns: [t.userId, t.gameId] })]
);

// A saved set of rules; its games are computed from the collection each time (see shared
// smart-lists.ts), so there are no items. `rules` is validated JSON.
export const smartLists = sqliteTable(
    'smart_lists',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        description: text('description').notNull().default(''),
        rules: text('rules').notNull(),
        sort: text('sort').notNull().default('title'),
        dir: text('dir', { enum: ['asc', 'desc'] })
            .notNull()
            .default('asc'),
        createdAt: integer('created_at').notNull().default(now)
    },
    (t) => [index('smart_lists_user_idx').on(t.userId)]
);

export const listItems = sqliteTable(
    'list_items',
    {
        listId: integer('list_id')
            .notNull()
            .references(() => lists.id, { onDelete: 'cascade' }),
        entryId: integer('entry_id')
            .notNull()
            .references(() => entries.id, { onDelete: 'cascade' }),
        // 0-based order within the list; rewritten wholesale on reorder
        position: integer('position').notNull()
    },
    (t) => [
        primaryKey({ columns: [t.listId, t.entryId] }),
        index('list_items_entry_idx').on(t.entryId)
    ]
);

// ---------------------------------------------------------------------------
// Activity feed: what the user did and when, shown on the public profile
// ---------------------------------------------------------------------------

export const activityEvents = sqliteTable(
    'activity_events',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        type: text('type', { enum: ACTIVITY_TYPES }).notNull(),
        at: integer('at').notNull().default(now),
        // IGDB game id; the shared cache is never pruned, so no cascade is needed
        gameId: integer('game_id').references(() => games.id),
        // Grid / tier list / list id (so deleting one can take its events along) or a slot name
        subjectId: integer('subject_id'),
        subjectName: text('subject_name'),
        detail: integer('detail')
    },
    (t) => [index('activity_user_at_idx').on(t.userId, t.at)]
);
