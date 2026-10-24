/** Bumped when the layout of `igdb.db` changes; the reader refuses a file with another version. */
export const MIRROR_SCHEMA_VERSION = 2;

/** Screenshots kept per game (the game page is a gallery, not a catalogue). */
export const MAX_MIRROR_SCREENSHOTS = 6;

/**
 * The mirror: a read-only copy of the parts of IGDB the app uses, rebuilt from IGDB's daily data
 * dumps into its own file (never the user database). Shapes follow `GameRecord`, so the lookup in
 * front of it can answer what the live client answers.
 *
 * Every game is kept, editions and add-ons included, because a user may already own one and the
 * game page looks games up by id. `searchable` marks the ones search and similar-games may show
 * (no edition, no add-on type) and only those are in the full-text index.
 */
export const MIRROR_DDL = `
CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE platforms (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    abbreviation TEXT
);
CREATE TABLE genres (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);
CREATE TABLE themes (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);
CREATE TABLE series (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE games (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT,
    summary TEXT,
    release_date TEXT,
    release_precision TEXT,
    cover_image_id TEXT,
    screenshots TEXT,
    igdb_rating INTEGER,
    igdb_rating_count INTEGER,
    game_type_id INTEGER,
    game_type TEXT,
    is_edition INTEGER NOT NULL,
    searchable INTEGER NOT NULL,
    ttb_hastily_s INTEGER,
    ttb_normally_s INTEGER,
    ttb_completely_s INTEGER,
    ttb_count INTEGER,
    similar_games TEXT
);

CREATE TABLE game_platforms (
    game_id INTEGER NOT NULL,
    platform_id INTEGER NOT NULL,
    PRIMARY KEY (game_id, platform_id)
) WITHOUT ROWID;
CREATE TABLE game_genres (
    game_id INTEGER NOT NULL,
    genre_id INTEGER NOT NULL,
    PRIMARY KEY (game_id, genre_id)
) WITHOUT ROWID;
CREATE TABLE game_themes (
    game_id INTEGER NOT NULL,
    theme_id INTEGER NOT NULL,
    PRIMARY KEY (game_id, theme_id)
) WITHOUT ROWID;
CREATE TABLE game_series (
    game_id INTEGER NOT NULL,
    series_id INTEGER NOT NULL,
    PRIMARY KEY (game_id, series_id)
) WITHOUT ROWID;
CREATE INDEX game_series_by_series ON game_series (series_id);
`;

/**
 * Created after the games are loaded so the index is built in one pass. Contentless (the names are
 * read from `games`, which the app joins on the rowid anyway). Both columns hold the text with
 * apostrophes removed ("Baldur's" -> "Baldurs"); search normalizes the query the same way.
 * `alt` is the game's alternative names ("FF7", "TotK", translated titles), joined by spaces.
 */
export const MIRROR_FTS_DDL = `
CREATE VIRTUAL TABLE games_fts USING fts5(
    name,
    alt,
    content = '',
    tokenize = 'unicode61 remove_diacritics 2',
    prefix = '2 3 4'
);
INSERT INTO games_fts (rowid, name, alt)
SELECT g.id,
       replace(replace(g.name, '''', ''), '’', ''),
       coalesce(replace(replace(a.names, '''', ''), '’', ''), '')
FROM games g
LEFT JOIN (SELECT game, group_concat(name, ' ') names FROM stg.alt_names GROUP BY game) a ON a.game = g.id
WHERE g.searchable = 1;
`;

/** Scratch tables for the dumps that only feed columns of `games`; deleted with the staging file. */
export const STAGING_DDL = `
CREATE TABLE stg.covers (id INTEGER PRIMARY KEY, image_id TEXT NOT NULL);
CREATE TABLE stg.screenshots (id INTEGER PRIMARY KEY, image_id TEXT NOT NULL);
CREATE TABLE stg.ttb (
    game_id INTEGER PRIMARY KEY,
    hastily INTEGER,
    normally INTEGER,
    completely INTEGER,
    count INTEGER
);
CREATE TABLE stg.release_dates (game INTEGER NOT NULL, date TEXT NOT NULL, format INTEGER);
CREATE TABLE stg.alt_names (game INTEGER NOT NULL, name TEXT NOT NULL);
`;
export const STAGING_INDEX_DDL = `
CREATE INDEX stg.release_dates_game ON release_dates (game, date);
CREATE INDEX stg.alt_names_game ON alt_names (game);
`;
