import { ArrowLeft, Bug, CircleCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { useState } from 'react';
import {
    ERROR_GROUPS,
    ERROR_HISTORY_DAYS,
    ERROR_KINDS,
    type ErrorEventDto,
    type ErrorGroup,
    type ErrorKind
} from '@gamequeue/shared';
import { useAdminErrors, useClearAdminErrors } from '../api/admin';
import { useConfirm } from '../components/Confirm';
import { DayChart, DayChartSkeleton } from '../components/DayChart';
import { ErrorListSkeleton } from '../components/PageSkeletons';
import { timeAgo, usePageTitle } from '../lib';

const PAGE = 50;

function Item({ e }: { e: ErrorEventDto }) {
    let context: string | null = null;
    if (e.context) {
        try {
            context = JSON.stringify(JSON.parse(e.context), null, 2);
        } catch {
            context = e.context;
        }
    }
    const hasMore = !!(e.stack || context);
    return (
        <li className="error-item">
            <div className="error-item__head">
                <span className="error-item__kind">{ERROR_KINDS[e.kind]}</span>
                {e.status !== null && <span className="error-item__status">{e.status}</span>}
                <time
                    className="muted"
                    dateTime={new Date(e.at).toISOString()}
                    title={new Date(e.at).toLocaleString()}
                >
                    {timeAgo(e.at)}
                </time>
            </div>
            <p className="error-item__message">{e.message}</p>
            {e.route && <p className="muted error-item__route">{e.route}</p>}
            {hasMore && (
                <details>
                    <summary>Details</summary>
                    {context && <pre className="error-item__pre">{context}</pre>}
                    {e.stack && <pre className="error-item__pre">{e.stack}</pre>}
                </details>
            )}
        </li>
    );
}

/** `/admin/errors`: what the server recorded going wrong, newest first, filterable by kind. */
export function AdminErrorsPage() {
    usePageTitle('Errors | Admin');
    const confirm = useConfirm();
    const [params, setParams] = useSearchParams();
    const raw = params.get('kind');
    const kind = raw && raw in ERROR_KINDS ? (raw as ErrorKind) : undefined;
    const [limit, setLimit] = useState(PAGE);
    const q = useAdminErrors(kind, limit);
    const clear = useClearAdminErrors();
    const d = q.data;

    const pick = (next: string) => {
        setLimit(PAGE);
        setParams(next ? { kind: next } : {}, { replace: true });
    };

    return (
        <section>
            <Link to="/admin" className="back-link">
                <ArrowLeft aria-hidden="true" /> Admin
            </Link>
            <div className="page-head">
                <div>
                    <h1>
                        <Bug aria-hidden="true" />
                        Errors
                    </h1>
                    <p className="muted">
                        Failures the server recorded: IGDB rate limits and errors, unhandled request
                        errors, background jobs and crashes.
                    </p>
                </div>
            </div>
            <div className="stack">
                <section className="panel" aria-labelledby="errors-summary-h">
                    <h2 id="errors-summary-h">Summary</h2>
                    {q.isPending ? (
                        <ErrorListSkeleton count={2} />
                    ) : q.isError ? (
                        <p className="form-error" role="alert">
                            Couldn't load the errors.
                        </p>
                    ) : d!.kinds.length === 0 ? (
                        <div className="backup__banner backup__banner--good">
                            <CircleCheck aria-hidden="true" />
                            <div role="status">
                                <strong>No errors recorded</strong>
                                <p>Nothing has failed in the last {d!.retentionDays} days.</p>
                            </div>
                        </div>
                    ) : (
                        <table className="error-summary">
                            <thead>
                                <tr>
                                    <th scope="col">Kind</th>
                                    <th scope="col">Last 24h</th>
                                    <th scope="col">Last {d!.retentionDays} days</th>
                                </tr>
                            </thead>
                            <tbody>
                                {d!.kinds.map((k) => (
                                    <tr key={k.kind}>
                                        <th scope="row">
                                            <Link
                                                to={`?kind=${k.kind}`}
                                                replace
                                                onClick={() => setLimit(PAGE)}
                                            >
                                                {ERROR_KINDS[k.kind]}
                                            </Link>
                                        </th>
                                        <td>{k.last24h}</td>
                                        <td>{k.total}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </section>

                {(q.isPending || (d && d.kinds.length > 0)) && (
                    <section className="panel" aria-labelledby="errors-history-h">
                        <h2 id="errors-history-h">Last {ERROR_HISTORY_DAYS} days</h2>
                        {d ? (
                            <DayChart
                                days={d.history}
                                series={(Object.keys(ERROR_GROUPS) as ErrorGroup[]).map((g) => ({
                                    key: g,
                                    label: ERROR_GROUPS[g].label
                                }))}
                                marker={{ label: 'Server started', count: (day) => day.starts }}
                                label="Errors per day"
                            />
                        ) : (
                            <DayChartSkeleton label="Loading error history" />
                        )}
                    </section>
                )}

                {d && d.kinds.length > 0 && (
                    <section className="panel" aria-labelledby="errors-list-h">
                        <h2 id="errors-list-h">Log</h2>
                        <div className="admin-actions">
                            <label className="field">
                                <span>Kind</span>
                                <select value={kind ?? ''} onChange={(e) => pick(e.target.value)}>
                                    <option value="">All kinds</option>
                                    {d.kinds.map((k) => (
                                        <option key={k.kind} value={k.kind}>
                                            {ERROR_KINDS[k.kind]}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <button
                                className="btn btn--danger"
                                disabled={clear.isPending}
                                onClick={async () => {
                                    const ok = await confirm({
                                        title: kind
                                            ? `Clear ${ERROR_KINDS[kind]}?`
                                            : 'Clear the log?',
                                        message: `This deletes ${d.total.toLocaleString()} recorded ${
                                            d.total === 1 ? 'error' : 'errors'
                                        }. It can't be undone.`,
                                        confirmLabel: 'Clear',
                                        tone: 'danger'
                                    });
                                    if (ok) clear.mutate(kind);
                                }}
                            >
                                {kind ? 'Clear this kind' : 'Clear all'}
                            </button>
                        </div>
                        {clear.isError && (
                            <p className="form-error" role="alert">
                                Couldn't clear the log.
                            </p>
                        )}
                        <ul className="error-list">
                            {d.events.map((e) => (
                                <Item key={e.id} e={e} />
                            ))}
                        </ul>
                        {d.events.length < d.total && (
                            <button
                                className="btn"
                                disabled={q.isFetching}
                                onClick={() => setLimit(limit + PAGE)}
                            >
                                {q.isFetching ? 'Loading…' : 'Load more'}
                            </button>
                        )}
                        <p className="muted">
                            Showing {d.events.length} of {d.total.toLocaleString()}. Events are kept
                            for {d.retentionDays} days. Each IGDB retry is its own entry.
                        </p>
                    </section>
                )}
            </div>
        </section>
    );
}
