import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
    FIRST_PAGE,
    defaultSmartDir,
    describeRules,
    entryQuerySchema,
    evaluateSmartList,
    smartRulesSchema,
    SMART_SORTS,
    type EntryDto,
    type SmartListDetailDto,
    type SmartListInput,
    type SmartListPreviewInput,
    type PageQuery,
    type SmartListSummaryDto,
    type SmartRule,
    type SmartSort
} from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { platforms, smartLists } from '../db/schema.js';
import { HttpError } from '../errors.js';
import { listEntries } from './entries.js';

type Row = typeof smartLists.$inferSelect;

/** How many covers a smart list tile shows. */
const TILE_COVERS = 4;

function requireRow(db: Db, userId: number, id: number): Row {
    const row = db
        .select()
        .from(smartLists)
        .where(and(eq(smartLists.id, id), eq(smartLists.userId, userId)))
        .get();
    if (!row) throw new HttpError(404, 'Smart list not found');
    return row;
}

/** Rules are validated on the way in, so a stored row that no longer parses is a bug worth a 500. */
const rulesOf = (row: Row): SmartRule[] => smartRulesSchema.parse(JSON.parse(row.rules));
const sortOf = (row: Row): SmartSort =>
    (SMART_SORTS as readonly string[]).includes(row.sort) ? (row.sort as SmartSort) : 'title';

/** Platform names for the rules in words; one query per call, not per rule. */
export function platformNamer(db: Db, rules: SmartRule[]) {
    const ids = [...new Set(rules.flatMap((r) => (r.field === 'platform' ? r.anyOf : [])))];
    const names = new Map(
        ids.length
            ? db
                  .select({ id: platforms.id, name: platforms.name })
                  .from(platforms)
                  .where(inArray(platforms.id, ids))
                  .all()
                  .map((p) => [p.id, p.name] as const)
            : []
    );
    return (id: number) => names.get(id) ?? `platform ${id}`;
}

function matching(row: Row, all: EntryDto[], now: number): EntryDto[] {
    return evaluateSmartList(all, rulesOf(row), sortOf(row), row.dir, now);
}

const allEntries = (db: Db, userId: number) => listEntries(db, userId, entryQuerySchema.parse({}));

/** Every smart list with its games, computed from one load of the collection. */
export function listSmartListDetails(
    db: Db,
    userId: number,
    now = Date.now(),
    page?: PageQuery
): SmartListDetailDto[] {
    const rows = db
        .select()
        .from(smartLists)
        .where(eq(smartLists.userId, userId))
        .orderBy(asc(sql`lower(${smartLists.name})`), asc(smartLists.id))
        .all();
    if (rows.length === 0) return [];
    const all = allEntries(db, userId);
    return rows.map((row) => toDetail(db, row, all, now, page));
}

export function listSmartLists(db: Db, userId: number, now = Date.now()): SmartListSummaryDto[] {
    return listSmartListDetails(db, userId, now).map((l) => ({
        id: l.id,
        name: l.name,
        count: l.total,
        covers: l.entries
            .flatMap((e) => (e.game.coverImageId ? [e.game.coverImageId] : []))
            .slice(0, TILE_COVERS),
        description: l.description
    }));
}

function toDetail(
    db: Db,
    row: Row,
    all: EntryDto[],
    now: number,
    page?: PageQuery
): SmartListDetailDto {
    const rules = rulesOf(row);
    const entries = matching(row, all, now);
    return {
        id: row.id,
        name: row.name,
        rules,
        sort: sortOf(row),
        dir: row.dir,
        description: describeRules(rules, platformNamer(db, rules)),
        entries: page ? entries.slice(page.offset, page.offset + page.limit) : entries,
        total: entries.length
    };
}

/** One page of the games matching right now (all of them when `page` is omitted). */
export function getSmartList(
    db: Db,
    userId: number,
    id: number,
    page?: PageQuery,
    now = Date.now()
): SmartListDetailDto {
    return toDetail(db, requireRow(db, userId, id), allEntries(db, userId), now, page);
}

/** The editor's live preview: what these rules would match, without saving anything. */
export function previewSmartList(
    db: Db,
    userId: number,
    input: SmartListPreviewInput,
    page: PageQuery,
    now = Date.now()
): { entries: EntryDto[]; total: number } {
    const matches = evaluateSmartList(
        allEntries(db, userId),
        input.rules,
        input.sort,
        input.dir ?? defaultSmartDir(input.sort),
        now
    );
    return { entries: matches.slice(page.offset, page.offset + page.limit), total: matches.length };
}

export function createSmartList(db: Db, userId: number, input: SmartListInput) {
    const row = db
        .insert(smartLists)
        .values({
            userId,
            name: input.name,
            rules: JSON.stringify(input.rules),
            sort: input.sort,
            dir: input.dir ?? defaultSmartDir(input.sort)
        })
        .returning()
        .get();
    return getSmartList(db, userId, row.id, FIRST_PAGE);
}

/** Replaces name, rules and sort wholesale (the editor always sends all of them). */
export function updateSmartList(db: Db, userId: number, id: number, input: SmartListInput) {
    requireRow(db, userId, id);
    db.update(smartLists)
        .set({
            name: input.name,
            rules: JSON.stringify(input.rules),
            sort: input.sort,
            dir: input.dir ?? defaultSmartDir(input.sort)
        })
        .where(eq(smartLists.id, id))
        .run();
    return getSmartList(db, userId, id, FIRST_PAGE);
}

export function deleteSmartList(db: Db, userId: number, id: number) {
    requireRow(db, userId, id);
    db.delete(smartLists).where(eq(smartLists.id, id)).run();
}

/** The definitions only, for export (their games are computed, so there is nothing else to carry). */
export function listSmartListRows(db: Db, userId: number) {
    return db
        .select()
        .from(smartLists)
        .where(eq(smartLists.userId, userId))
        .orderBy(asc(smartLists.id))
        .all()
        .map((row) => ({ name: row.name, rules: rulesOf(row), sort: sortOf(row), dir: row.dir }));
}
