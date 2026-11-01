import { AI_FEATURE_LABELS, type AdminAiDto } from '@gamequeue/shared';
import { ArrowLeft, Bot, TriangleAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAdminAi, useSetAiBudget } from '../api/ai';
import { ApiRequestError } from '../api/client';
import { DatabaseSkeleton } from '../components/PageSkeletons';
import { StorageMeter } from '../components/StorageMeter';
import { timeAgo, usePageTitle } from '../lib';

/** Dollars; amounts under a dollar get a third decimal, so a few cents of spend don't all read $0.01 */
export const money = (usd: number, digits = usd > 0 && usd < 1 ? 3 : 2) =>
    usd.toLocaleString(undefined, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });

/** The warning at 80% of the budget and the stop at 100%; shared with the dashboard tile. */
export function AiBudgetNotice({ data }: { data: AdminAiDto }) {
    if (data.exhausted)
        return (
            <p className="form-error" role="status">
                <TriangleAlert aria-hidden="true" /> The budget is spent: AI calls are refused until
                next month or until you raise it.
            </p>
        );
    if (data.warning)
        return (
            <p className="form-error" role="status">
                <TriangleAlert aria-hidden="true" /> Over 80% of this month's budget is spent.
            </p>
        );
    return null;
}

/** AI spend this month against the budget, split by feature, the last 20 calls, and the budget control. */
export function AdminAiPage() {
    usePageTitle('Admin · AI');
    const q = useAdminAi();
    const set = useSetAiBudget();
    const [budget, setBudget] = useState<string>();
    const [message, setMessage] = useState<{ ok: boolean; text: string }>();
    const d = q.data;

    function save(e: FormEvent) {
        e.preventDefault();
        const value = Number(budget ?? d?.budgetUsd);
        if (!Number.isFinite(value) || value < 0)
            return setMessage({ ok: false, text: 'Enter an amount in dollars, 0 or more.' });
        set.mutate(value, {
            onSuccess: () => {
                setBudget(undefined);
                setMessage({ ok: true, text: 'Budget saved. It applies to the next AI call.' });
            },
            onError: (err) =>
                setMessage({
                    ok: false,
                    text: err instanceof ApiRequestError ? err.message : 'Could not save.'
                })
        });
    }

    return (
        <section className="stack">
            <div className="page-head">
                <div>
                    <Link className="back-link" to="/admin">
                        <ArrowLeft aria-hidden="true" /> Admin
                    </Link>
                    <h1>
                        <Bot aria-hidden="true" /> AI
                    </h1>
                    <p className="muted">
                        The game helper and its summaries. Costs are estimates from the token counts
                        and Anthropic's list prices; the Anthropic Console has the real bill.
                    </p>
                </div>
            </div>
            {q.isPending ? (
                <DatabaseSkeleton label="Loading AI usage" />
            ) : q.isError || !d ? (
                <p role="alert">Couldn't load this.</p>
            ) : (
                <>
                    {!d.configured && (
                        <p className="panel muted">
                            AI is off: set <code>ANTHROPIC_API_KEY</code> on the server (and
                            optionally <code>AI_MODEL</code>), then switch it on for users on their
                            admin page.
                        </p>
                    )}
                    <section className="panel stack" aria-labelledby="ai-spend-h">
                        <h2 id="ai-spend-h">This month ({d.month}, UTC)</h2>
                        <StorageMeter
                            used={d.spentUsd}
                            cap={d.budgetUsd}
                            label="AI budget used"
                            format={(n) => money(n)}
                        />
                        <AiBudgetNotice data={d} />
                        <dl className="admin-stats">
                            <div>
                                <dd>{money(d.spentUsd)}</dd>
                                <dt>Spent</dt>
                            </div>
                            <div>
                                <dd>{money(d.budgetUsd)}</dd>
                                <dt>Budget</dt>
                            </div>
                            {d.byFeature.map((f) => (
                                <div key={f.feature}>
                                    <dd>{money(f.costUsd)}</dd>
                                    <dt>
                                        {AI_FEATURE_LABELS[f.feature]} ({f.calls}{' '}
                                        {f.calls === 1 ? 'call' : 'calls'})
                                    </dt>
                                </div>
                            ))}
                        </dl>
                        <p className="muted">Model: {d.model}</p>
                    </section>

                    <form className="panel stack" onSubmit={save} aria-labelledby="ai-budget-h">
                        <h2 id="ai-budget-h">Monthly budget</h2>
                        <label className="field">
                            <span>Budget (US dollars per calendar month)</span>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                value={budget ?? String(d.budgetUsd)}
                                onChange={(e) => setBudget(e.target.value)}
                            />
                        </label>
                        <div>
                            <button
                                className="btn btn--primary"
                                type="submit"
                                disabled={set.isPending}
                            >
                                Save budget
                            </button>
                        </div>
                        <p
                            className={message?.ok ? 'muted' : 'form-error'}
                            role="status"
                            aria-live="polite"
                        >
                            {message?.text}
                        </p>
                    </form>

                    <section className="panel stack" aria-labelledby="ai-recent-h">
                        <h2 id="ai-recent-h">Last 20 calls</h2>
                        {d.recent.length === 0 ? (
                            <p className="muted">No AI calls yet.</p>
                        ) : (
                            <div className="table-scroll">
                                <table className="admin-table admin-table--plain">
                                    <thead>
                                        <tr>
                                            <th scope="col">When</th>
                                            <th scope="col">User</th>
                                            <th scope="col">Feature</th>
                                            <th scope="col">Tokens in / out</th>
                                            <th scope="col">Cost</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {d.recent.map((r, i) => (
                                            <tr key={i}>
                                                <td title={new Date(r.at).toLocaleString()}>
                                                    {timeAgo(r.at)}
                                                </td>
                                                <td>{r.username ?? '(deleted)'}</td>
                                                <td>{AI_FEATURE_LABELS[r.feature]}</td>
                                                <td>
                                                    {r.inputTokens.toLocaleString()} /{' '}
                                                    {r.outputTokens.toLocaleString()}
                                                </td>
                                                <td>{money(r.costUsd, 4)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <p className="muted">
                            Only counts are kept; the conversations themselves are never stored.
                        </p>
                    </section>
                </>
            )}
        </section>
    );
}
