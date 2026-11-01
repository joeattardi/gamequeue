import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import {
    AI_BUDGET_WARN_AT,
    AI_FEATURES,
    DEFAULT_AI_BUDGET_USD,
    type AdminAiDto,
    type AiFeature
} from '@gamequeue/shared';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { aiUsage, users } from '../db/schema.js';
import { read, write } from './settings.js';

/**
 * US dollars per million tokens (input, output), from Anthropic's published prices. The cost
 * shown in the app is an estimate: it ignores prompt-caching discounts and fallback repricing,
 * and prices change, so the Anthropic Console's billing is the real figure. An unknown model is
 * charged at the most expensive known rate, so the budget errs on the safe side.
 */
export const PRICES_PER_MTOK: Record<string, { input: number; output: number }> = {
    'claude-fable-5-1': { input: 10, output: 50 },
    'claude-opus-5-5': { input: 4, output: 20 },
    'claude-opus-5': { input: 5, output: 25 },
    'claude-sonnet-5-5': { input: 2, output: 10 },
    'claude-sonnet-5': { input: 2, output: 10 },
    'claude-haiku-5-5': { input: 0.1, output: 0.5 }
};
const FALLBACK_PRICE = { input: 10, output: 50 };

/** Estimated cost in millionths of a dollar: tokens × $/Mtok is exactly micro-dollars. */
export function costMicros(model: string, inputTokens: number, outputTokens: number): number {
    const p = PRICES_PER_MTOK[model] ?? FALLBACK_PRICE;
    return Math.round(inputTokens * p.input + outputTokens * p.output);
}

const BUDGET_KEY = 'ai_budget_usd';

function aiBudgetUsd(db: Db): number {
    const saved = Number(read(db, BUDGET_KEY) ?? NaN);
    return Number.isFinite(saved) && saved >= 0 ? saved : DEFAULT_AI_BUDGET_USD;
}
export const setAiBudgetUsd = (db: Db, usd: number) => write(db, BUDGET_KEY, String(usd));

/** Start and end (ms) of the calendar month in UTC that holds `now`, and its `YYYY-MM` name. */
function monthRange(now = Date.now()) {
    const d = new Date(now);
    const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    return { start, end, month: new Date(start).toISOString().slice(0, 7) };
}

function monthSpendMicros(db: Db, now = Date.now()): number {
    const { start, end } = monthRange(now);
    return (
        db
            .select({ n: sql<number>`coalesce(sum(${aiUsage.costMicros}), 0)` })
            .from(aiUsage)
            .where(and(gte(aiUsage.createdAt, start), lt(aiUsage.createdAt, end)))
            .get()?.n ?? 0
    );
}

export const budgetSpent = (db: Db, now = Date.now()) =>
    monthSpendMicros(db, now) >= aiBudgetUsd(db) * 1_000_000;

export function recordUsage(
    db: Db,
    row: {
        userId: number;
        feature: AiFeature;
        model: string;
        inputTokens: number;
        outputTokens: number;
    }
) {
    db.insert(aiUsage)
        .values({ ...row, costMicros: costMicros(row.model, row.inputTokens, row.outputTokens) })
        .run();
}

const usd = (micros: number) => micros / 1_000_000;

export function adminAi(db: Db, config: Config, configured: boolean, now = Date.now()): AdminAiDto {
    const { start, end, month } = monthRange(now);
    const inMonth = and(gte(aiUsage.createdAt, start), lt(aiUsage.createdAt, end));
    const spent = monthSpendMicros(db, now);
    const budget = aiBudgetUsd(db);
    const byFeature = new Map(
        db
            .select({
                feature: aiUsage.feature,
                calls: sql<number>`count(*)`,
                micros: sql<number>`coalesce(sum(${aiUsage.costMicros}), 0)`
            })
            .from(aiUsage)
            .where(inMonth)
            .groupBy(aiUsage.feature)
            .all()
            .map((r) => [r.feature, r])
    );
    const recent = db
        .select({ u: aiUsage, username: users.username })
        .from(aiUsage)
        .leftJoin(users, eq(users.id, aiUsage.userId))
        .orderBy(desc(aiUsage.createdAt), desc(aiUsage.id))
        .limit(20)
        .all();
    return {
        configured,
        model: config.aiModel,
        budgetUsd: budget,
        spentUsd: usd(spent),
        warning: spent >= budget * 1_000_000 * AI_BUDGET_WARN_AT,
        exhausted: spent >= budget * 1_000_000,
        month,
        byFeature: AI_FEATURES.map((feature) => ({
            feature,
            calls: byFeature.get(feature)?.calls ?? 0,
            costUsd: usd(byFeature.get(feature)?.micros ?? 0)
        })),
        recent: recent.map(({ u, username }) => ({
            at: u.createdAt,
            username,
            feature: u.feature,
            model: u.model,
            inputTokens: u.inputTokens,
            outputTokens: u.outputTokens,
            costUsd: usd(u.costMicros)
        }))
    };
}
