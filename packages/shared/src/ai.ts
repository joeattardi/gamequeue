import { z } from 'zod';
import type { EntryDto } from './collection.js';

/** What an AI call was for; the admin page splits the month's spend by these. */
export const AI_FEATURES = ['helper', 'summary', 'pick'] as const;
export type AiFeature = (typeof AI_FEATURES)[number];
export const AI_FEATURE_LABELS: Record<AiFeature, string> = {
    helper: 'Game helper',
    summary: 'Summarize to notes',
    pick: 'Help me pick'
};

/** Caps on what the client may send each turn; the server enforces them. */
export const AI_MAX_MESSAGES = 20;
export const AI_MAX_MESSAGE_CHARS = 4000;
export const AI_MAX_TOTAL_CHARS = 24_000;

/** Used until an admin sets a budget */
export const DEFAULT_AI_BUDGET_USD = 5;
/** The Admin card warns from this share of the budget */
export const AI_BUDGET_WARN_AT = 0.8;

export const aiMessageSchema = z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(AI_MAX_MESSAGE_CHARS)
});
export type AiMessage = z.infer<typeof aiMessageSchema>;

/**
 * One helper turn. The server keeps the conversation (`ai_chats`): the client sends only the new
 * question and which saved chat it continues (none starts a new one).
 */
export const aiChatSchema = z.object({
    entryId: z.number().int().positive(),
    chatId: z.number().int().positive().optional(),
    /** Send the user's notes on this game along with the game data and journal */
    includeNotes: z.boolean().default(true),
    message: z.string().trim().min(1).max(AI_MAX_MESSAGE_CHARS)
});
export type AiChatInput = z.infer<typeof aiChatSchema>;

/** Summarize asks for the main points of a saved chat that already has an answer in it. */
export const aiSummarizeSchema = z.object({
    chatId: z.number().int().positive(),
    includeNotes: z.boolean().default(true)
});
export type AiSummarizeInput = z.infer<typeof aiSummarizeSchema>;

/** How many saved chats are kept per game and per user, and for how long after their last use */
export const AI_CHATS_PER_GAME = 5;
export const AI_CHATS_PER_USER = 50;
export const AI_CHAT_RETENTION_DAYS = 90;

export interface AiChatSummaryDto {
    id: number;
    entryId: number;
    /** The first question, shortened */
    title: string;
    messageCount: number;
    createdAt: number;
    /** Last time it was opened or added to */
    usedAt: number;
}

export interface AiChatDto extends AiChatSummaryDto {
    messages: AiMessage[];
}

/** A pick-my-next-game conversation, sent whole each turn (it isn't saved): starts and ends with the user, turns alternate. */
export const aiPickChatSchema = z.object({
    messages: z
        .array(aiMessageSchema)
        .min(1)
        .max(
            AI_MAX_MESSAGES,
            `A conversation holds at most ${AI_MAX_MESSAGES} messages; start a new one`
        )
        .refine((m) => m.reduce((n, x) => n + x.content.length, 0) <= AI_MAX_TOTAL_CHARS, {
            message: 'This conversation is too long; start a new one'
        })
        .refine((m) => m.every((x, i) => x.role === (i % 2 === 0 ? 'user' : 'assistant')), {
            message: 'Turns must alternate, starting with you'
        })
        .refine((m) => m[m.length - 1]?.role === 'user', {
            message: 'The last message must be yours'
        })
});
export type AiPickChatInput = z.infer<typeof aiPickChatSchema>;

/** One game the picker suggests: always a game from the user's own queue or backlog. */
export interface AiSuggestionDto {
    entry: EntryDto;
    reason: string;
}

export interface AiPickReplyDto {
    message: string;
    suggestions: AiSuggestionDto[];
}

/** A saved game chat on the Ask AI page, with the game it is about. */
export interface AiRecentChatDto extends AiChatSummaryDto {
    game: { id: number; name: string; coverImageId: string | null };
}

export interface AiStatusDto {
    /** The AI controls show only when this is true */
    available: boolean;
    /** Why not, when not: no key on the server, not switched on for this account, or the budget is spent */
    reason: 'not_configured' | 'not_enabled' | 'budget_spent' | null;
}

export interface AiReplyDto {
    reply: string;
    /** The saved chat the turn went into (new when the request had no `chatId`) */
    chatId: number;
}
export interface AiDraftDto {
    draft: string;
}

export interface AdminAiDto {
    configured: boolean;
    model: string;
    budgetUsd: number;
    /** Estimated spend in the current calendar month (UTC) */
    spentUsd: number;
    warning: boolean;
    exhausted: boolean;
    month: string;
    byFeature: { feature: AiFeature; calls: number; costUsd: number }[];
    recent: {
        at: number;
        username: string | null;
        feature: AiFeature;
        model: string;
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
    }[];
}

export const setAiBudgetSchema = z.object({ budgetUsd: z.number().min(0).max(10_000) });
