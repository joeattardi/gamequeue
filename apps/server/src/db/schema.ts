import { sql } from 'drizzle-orm';
import {
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
    createdAt: integer('created_at').notNull().default(now)
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
    coverImageId: text('cover_image_id'),
    igdbRating: integer('igdb_rating'), // 0-100
    igdbRatingCount: integer('igdb_rating_count'),
    gameType: text('game_type'),
    ttbHastilySeconds: integer('ttb_hastily_s'),
    ttbNormallySeconds: integer('ttb_normally_s'),
    ttbCompletelySeconds: integer('ttb_completely_s'),
    ttbCount: integer('ttb_count'),
    fetchedAt: integer('fetched_at').notNull()
});

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
        notes: text('notes').notNull().default(''),
        ttbOverrideMinutes: integer('ttb_override_minutes'),
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
        rating: integer('rating') // 1-5 stars
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
