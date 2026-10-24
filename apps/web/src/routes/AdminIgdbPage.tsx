import { ArrowLeft, CircleAlert, CircleCheck, Gamepad2, Zap } from 'lucide-react';
import { Link } from 'react-router';
import type { IgdbPingDto, IgdbStatusDto } from '@gamequeue/shared';
import { useAdminIgdb, usePingIgdb } from '../api/admin';
import { ApiRequestError } from '../api/client';
import { DayChart, DayChartSkeleton } from '../components/DayChart';
import { DatabaseSkeleton } from '../components/PageSkeletons';
import { timeAgo, usePageTitle } from '../lib';

const when = (ms: number | null) => (ms === null ? 'Never' : timeAgo(ms));
const exact = (ms: number | null) => (ms === null ? undefined : new Date(ms).toLocaleString());

function Banner({ tone, title, text }: { tone: 'good' | 'bad'; title: string; text: string }) {
    const Icon = tone === 'good' ? CircleCheck : CircleAlert;
    return (
        <div className={`backup__banner backup__banner--${tone}`}>
            <Icon aria-hidden="true" />
            <div role={tone === 'bad' ? 'alert' : 'status'}>
                <strong>{title}</strong>
                <p>{text}</p>
            </div>
        </div>
    );
}

function Ping() {
    const ping = usePingIgdb();
    const result: IgdbPingDto | undefined = ping.data;
    return (
        <section className="panel" aria-labelledby="ping-h">
            <h2 id="ping-h">
                <Zap aria-hidden="true" /> Test connection
            </h2>
            <p className="muted">
                Sends one small request to IGDB, getting a new access token first if needed. It
                counts as one request against the totals above.
            </p>
            <div className="admin-actions">
                <button className="btn" onClick={() => ping.mutate()} disabled={ping.isPending}>
                    {ping.isPending ? 'Testing…' : 'Test connection'}
                </button>
            </div>
            {result?.ok && (
                <Banner
                    tone="good"
                    title="IGDB answered"
                    text={`Round trip took ${result.ms} ms.`}
                />
            )}
            {result && !result.ok && (
                <Banner
                    tone="bad"
                    title="IGDB did not answer"
                    text={result.error ?? 'Unknown error'}
                />
            )}
            {ping.isError && (
                <p className="form-error" role="alert">
                    {ping.error instanceof ApiRequestError
                        ? ping.error.message
                        : "Couldn't run the test."}
                </p>
            )}
        </section>
    );
}

function Status({ d }: { d: IgdbStatusDto }) {
    if (!d.configured)
        return (
            <Banner
                tone="bad"
                title="IGDB is not set up"
                text="IGDB_CLIENT_ID and IGDB_CLIENT_SECRET are not set, so search and adding games are disabled. See DEPLOYMENT.md."
            />
        );
    const { requests24h: r } = d;
    const rate = r.total > 0 ? Math.round((r.failed / r.total) * 100) : 0;
    const stats = [
        {
            label: 'Access token',
            value: d.token.valid ? 'Valid' : 'None yet',
            title: d.token.expiresAt ? `Expires ${exact(d.token.expiresAt)}` : undefined
        },
        { label: 'Requests, last 24h', value: String(r.total) },
        { label: 'Failed', value: r.total > 0 ? `${r.failed} (${rate}%)` : '0' },
        { label: 'Last success', value: when(d.lastSuccessAt), title: exact(d.lastSuccessAt) },
        {
            label: 'Release dates last checked',
            value: when(d.lastReleaseCheckAt),
            title: exact(d.lastReleaseCheckAt)
        }
    ];
    return (
        <div className="stack">
            {d.lastError ? (
                <Banner
                    tone="bad"
                    title={`Last error ${timeAgo(d.lastError.at)}`}
                    text={d.lastError.message}
                />
            ) : (
                <Banner
                    tone="good"
                    title="No errors"
                    text="IGDB has not failed since the server started."
                />
            )}
            <dl className="admin-stats">
                {stats.map((s) => (
                    <div key={s.label}>
                        <dd title={s.title}>{s.value}</dd>
                        <dt>{s.label}</dt>
                    </div>
                ))}
            </dl>
            <p className="muted">
                The figures above live in memory and start again when the server restarts (counting
                since {new Date(d.since).toLocaleString()}). Each retry counts as its own request.
                The access token is fetched on first use and renewed an hour before it expires, so
                "None yet" after a restart is normal.
            </p>
        </div>
    );
}

/** `/admin/igdb`: whether the app can talk to IGDB, and a test button. */
export function AdminIgdbPage() {
    usePageTitle('IGDB | Admin');
    const q = useAdminIgdb();
    return (
        <section>
            <Link to="/admin" className="back-link">
                <ArrowLeft aria-hidden="true" /> Admin
            </Link>
            <div className="page-head">
                <div>
                    <h1>
                        <Gamepad2 aria-hidden="true" />
                        IGDB
                    </h1>
                    <p className="muted">
                        Health of the live connection to the game database. Searches and game pages
                        are answered from the <Link to="/admin/mirror">local mirror</Link> when one
                        exists, so these figures count only the requests that still reach IGDB.
                    </p>
                </div>
            </div>
            <div className="stack">
                <section className="panel" aria-labelledby="igdb-status-h">
                    <h2 id="igdb-status-h">Status</h2>
                    {q.isPending ? (
                        <DatabaseSkeleton label="Loading IGDB status" />
                    ) : q.isError ? (
                        <p className="form-error" role="alert">
                            Couldn't load the IGDB status.
                        </p>
                    ) : (
                        <Status d={q.data} />
                    )}
                </section>
                {(q.isPending || q.data?.configured) && (
                    <section className="panel" aria-labelledby="igdb-history-h">
                        <h2 id="igdb-history-h">Requests, last 30 days</h2>
                        {q.data ? (
                            <>
                                <DayChart
                                    days={q.data.history}
                                    series={[
                                        { key: 'ok', label: 'Succeeded' },
                                        { key: 'rateLimited', label: 'Rate limited (429)' },
                                        { key: 'failed', label: 'Other failures' }
                                    ]}
                                    label="IGDB requests per day"
                                />
                                <p className="muted">
                                    Counted per UTC day and kept for 90 days, so it survives
                                    restarts. Every retry is its own request. IGDB allows 4 requests
                                    a second.
                                </p>
                            </>
                        ) : (
                            <DayChartSkeleton label="Loading request history" />
                        )}
                    </section>
                )}
                {q.data?.configured && <Ping />}
            </div>
        </section>
    );
}
