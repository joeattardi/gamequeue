import { z } from 'zod';

/** What an AI call was for; the admin page splits the month's spend by these. */
export const AI_FEATURES = ['helper', 'summary'] as const;
export type AiFeature = (typeof AI_FEATURES)[number];
export const AI_FEATURE_LABELS: Record<AiFeature, string> = {
    helper: 'Game helper',
    summary: 'Summarize to notes'
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

/** A conversation as the client sends it each turn: it starts and ends with the user, and turns alternate. */
export const aiConversationSchema = z
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
    });

export const aiChatSchema = z.object({
    entryId: z.number().int().positive(),
    /** Send the user's notes on this game along with the game data and journal */
    includeNotes: z.boolean().default(true),
    messages: aiConversationSchema.refine((m) => m[m.length - 1]?.role === 'user', {
        message: 'The last message must be yours'
    })
});
export type AiChatInput = z.infer<typeof aiChatSchema>;

/** Summarize asks for the main points of a conversation that already has an answer in it. */
export const aiSummarizeSchema = z.object({
    entryId: z.number().int().positive(),
    includeNotes: z.boolean().default(true),
    messages: aiConversationSchema.refine((m) => m.length >= 2, {
        message: 'There is nothing to summarize yet'
    })
});
export type AiSummarizeInput = z.infer<typeof aiSummarizeSchema>;

export interface AiStatusDto {
    /** The AI controls show only when this is true */
    available: boolean;
    /** Why not, when not: no key on the server, not switched on for this account, or the budget is spent */
    reason: 'not_configured' | 'not_enabled' | 'budget_spent' | null;
}

export interface AiReplyDto {
    reply: string;
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
