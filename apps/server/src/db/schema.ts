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
        position: integer('position').notNull()
        // entry_id (+ partial unique index) is added in M3 once entries exist
    },
    (t) => [uniqueIndex('slots_user_position_idx').on(t.userId, t.position)]
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
        rating: integer('rating'), // 1-10
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
