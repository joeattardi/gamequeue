import { and, desc, eq, lt, notInArray, type SQL } from 'drizzle-orm';
import {
    AI_CHAT_RETENTION_DAYS,
    AI_CHATS_PER_GAME,
    AI_CHATS_PER_USER,
    aiMessageSchema,
    type AiChatDto,
    type AiChatSummaryDto,
    type AiMessage,
    type AiRecentChatDto
} from '@gamequeue/shared';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { aiChats, entries, games } from '../db/schema.js';
import { HttpError } from '../errors.js';

const TITLE_CHARS = 80;
const DAY_MS = 86_400_000;
const storedMessages = z.array(aiMessageSchema);

/** A stored chat's messages; a row that somehow fails to parse reads as empty rather than breaking the page. */
function parse(json: string): AiMessage[] {
    try {
        return storedMessages.parse(JSON.parse(json));
    } catch {
        return [];
    }
}

const title = (question: string) => {
    const oneLine = question.replace(/\s+/g, ' ').trim();
    return oneLine.length > TITLE_CHARS ? `${oneLine.slice(0, TITLE_CHARS - 1)}…` : oneLine;
};

function toSummary(row: typeof aiChats.$inferSelect, messages: AiMessage[]): AiChatSummaryDto {
    return {
        id: row.id,
        entryId: row.entryId,
        title: row.title,
        messageCount: messages.length,
        createdAt: row.createdAt,
        usedAt: row.usedAt
    };
}

/** Another user's chat is a 404, the same as one that does not exist. */
function requireChat(db: Db, userId: number, id: number) {
    const row = db
        .select()
        .from(aiChats)
        .where(and(eq(aiChats.id, id), eq(aiChats.userId, userId)))
        .get();
    if (!row) throw new HttpError(404, 'Chat not found');
    return row;
}

/** The user's saved chats about one game, most recently used first. */
export function listChats(db: Db, userId: number, entryId: number): AiChatSummaryDto[] {
    return db
        .select()
        .from(aiChats)
        .where(and(eq(aiChats.userId, userId), eq(aiChats.entryId, entryId)))
        .orderBy(desc(aiChats.usedAt), desc(aiChats.id))
        .all()
        .map((r) => toSummary(r, parse(r.messages)));
}

const RECENT_CHATS = 30;

/** The user's most recently used chats across all games, with each game, for the Ask AI page. */
export function recentChats(db: Db, userId: number): AiRecentChatDto[] {
    return db
        .select({ c: aiChats, g: games })
        .from(aiChats)
        .innerJoin(entries, eq(entries.id, aiChats.entryId))
        .innerJoin(games, eq(games.id, entries.gameId))
        .where(eq(aiChats.userId, userId))
        .orderBy(desc(aiChats.usedAt), desc(aiChats.id))
        .limit(RECENT_CHATS)
        .all()
        .map(({ c, g }) => ({
            ...toSummary(c, parse(c.messages)),
            game: { id: g.id, name: g.name, coverImageId: g.coverImageId }
        }));
}

/** Opens a saved chat; opening counts as using it, so it isn't cleared while still read. */
export function openChat(db: Db, userId: number, id: number, now = Date.now()): AiChatDto {
    const row = requireChat(db, userId, id);
    db.update(aiChats).set({ usedAt: now }).where(eq(aiChats.id, id)).run();
    const messages = parse(row.messages);
    return { ...toSummary({ ...row, usedAt: now }, messages), messages };
}

/** The history a new turn continues: the saved chat's messages, checked to belong to this user and game. */
export function chatHistory(db: Db, userId: number, entryId: number, chatId?: number): AiMessage[] {
    if (chatId === undefined) return [];
    const row = requireChat(db, userId, chatId);
    if (row.entryId !== entryId) throw new HttpError(400, 'That chat is about another game');
    return parse(row.messages);
}

export function deleteChat(db: Db, userId: number, id: number) {
    requireChat(db, userId, id);
    db.delete(aiChats).where(eq(aiChats.id, id)).run();
}

/** Keeps at most `keep` of these chats (most recently used first), deleting the rest. */
function trim(db: Db, where: SQL, keep: number) {
    const kept = db
        .select({ id: aiChats.id })
        .from(aiChats)
        .where(where)
        .orderBy(desc(aiChats.usedAt), desc(aiChats.id))
        .limit(keep)
        .all()
        .map((r) => r.id);
    if (kept.length < keep) return;
    db.delete(aiChats)
        .where(and(where, notInArray(aiChats.id, kept)))
        .run();
}

/**
 * Saves a finished turn: appends the question and the answer to the chat, or starts a new chat with
 * them. A new chat may push out the oldest one for the game (5 kept) or for the user (50 kept).
 * Only called once the answer is complete, so a failed or cut-off turn leaves nothing behind.
 */
export function saveTurn(
    db: Db,
    userId: number,
    entryId: number,
    chatId: number | undefined,
    history: AiMessage[],
    question: string,
    answer: string,
    now = Date.now()
): number {
    const messages: AiMessage[] = [
        ...history,
        { role: 'user', content: question },
        { role: 'assistant', content: answer }
    ];
    return db.transaction((tx) => {
        const t = tx as unknown as Db;
        if (chatId !== undefined) {
            t.update(aiChats)
                .set({ messages: JSON.stringify(messages), usedAt: now })
                .where(and(eq(aiChats.id, chatId), eq(aiChats.userId, userId)))
                .run();
            return chatId;
        }
        const id = t
            .insert(aiChats)
            .values({
                userId,
                entryId,
                title: title(question),
                messages: JSON.stringify(messages),
                createdAt: now,
                usedAt: now
            })
            .returning({ id: aiChats.id })
            .get().id;
        trim(t, and(eq(aiChats.userId, userId), eq(aiChats.entryId, entryId))!, AI_CHATS_PER_GAME);
        trim(t, eq(aiChats.userId, userId), AI_CHATS_PER_USER);
        return id;
    });
}

/** The daily clean-up: chats nobody has opened or added to for 90 days. Returns how many went. */
export function pruneChats(db: Db, now = Date.now()): number {
    return db
        .delete(aiChats)
        .where(lt(aiChats.usedAt, now - AI_CHAT_RETENTION_DAYS * DAY_MS))
        .run().changes;
}
