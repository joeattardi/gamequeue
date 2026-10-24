import { ArrowLeft, CircleAlert, Activity, ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import { trafficTotals, type TrafficDto } from '@gamequeue/shared';
import { useAdminTraffic } from '../api/admin';
import { ApiRequestError } from '../api/client';
import { DayChart, DayChartSkeleton } from '../components/DayChart';
import { DatabaseSkeleton } from '../components/PageSkeletons';
import { formatBytes, timeAgo, usePageTitle } from '../lib';

const n = (v: number) => v.toLocaleString();
const dayLabel = (day: string) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC'
    });

function Period({
    title,
    days,
    count
}: {
    title: string;
    days: TrafficDto['days'];
    count: number;
}) {
    const t = trafficTotals(days, count);
    const stats = [
        { label: 'Requests', value: n(t.requests) },
        { label: 'Page views', value: n(t.pageViews) },
        { label: 'Data served', value: formatBytes(t.bytes) },
        {
            label: 'Served from cache',
            value: t.cachedPercent === null ? '—' : `${t.cachedPercent}%`
        },
        {
            label: 'Visitors per day',
            value: n(t.avgVisitors),
            title: 'Average of each day’s unique visitors'
        }
    ];
    return (
        <section className="panel" aria-label={title}>
            <h2>{title}</h2>
            <dl className="admin-stats">
                {stats.map((s) => (
                    <div key={s.label}>
                        <dd title={s.title}>{s.value}</dd>
                        <dt>{s.label}</dt>
                    </div>
                ))}
            </dl>
        </section>
    );
}

function Traffic({ d }: { d: TrafficDto }) {
    return (
        <div className="stack">
            <Period title="Last 7 days" days={d.days} count={7} />
            <Period title={`Last ${d.days.length} days`} days={d.days} count={d.days.length} />

            <section className="panel" aria-labelledby="traffic-chart-h">
                <h2 id="traffic-chart-h">Requests per day</h2>
                <DayChart
                    days={d.days}
                    series={[
                        { key: 'cached', label: 'Served from cache' },
                        { key: 'uncached', label: 'Reached the server' }
                    ]}
                    label="Requests per day"
                />
            </section>

            <section className="panel" aria-labelledby="traffic-days-h">
                <h2 id="traffic-days-h">Recent days</h2>
                <div className="table-scroll">
                    <table className="admin-table admin-table--plain">
                        <thead>
                            <tr>
                                <th scope="col">Day</th>
                                <th scope="col" className="num">
                                    Requests
                                </th>
                                <th scope="col" className="num">
                                    Page views
                                </th>
                                <th scope="col" className="num">
                                    Visitors
                                </th>
                                <th scope="col" className="num">
                                    Data served
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...d.days]
                                .reverse()
                                .slice(0, 14)
                                .map((day) => (
                                    <tr key={day.day}>
                                        <th scope="row">{dayLabel(day.day)}</th>
                                        <td className="num">{n(day.requests)}</td>
                                        <td className="num">{n(day.pageViews)}</td>
                                        <td className="num">{n(day.uniques)}</td>
                                        <td className="num">{formatBytes(day.bytes)}</td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <p className="muted">
                From Cloudflare’s edge, so it counts everything that reaches the site, crawlers and
                bots included. Days are UTC and today is partial. Visitors are unique IP addresses
                per day, which is why they are averaged rather than added up
                {d.fetchedAt ? `. Updated ${timeAgo(d.fetchedAt)}` : ''}. Game covers load from IGDB
                directly and don’t appear here.{' '}
                <a href="https://dash.cloudflare.com" target="_blank" rel="noreferrer">
                    Open Cloudflare <ExternalLink aria-hidden="true" />
                </a>
            </p>
        </div>
    );
}

/** Traffic and data transfer from Cloudflare's analytics (admin only). */
export function AdminTrafficPage() {
    usePageTitle('Traffic');
    const q = useAdminTraffic();
    const d = q.data;
    return (
        <section>
            <Link to="/admin" className="back-link">
                <ArrowLeft aria-hidden="true" /> Admin
            </Link>
            <div className="page-head">
                <div>
                    <h1>
                        <Activity aria-hidden="true" />
                        Traffic
                    </h1>
                    <p className="muted">
                        How much the site is visited and how much data it serves.
                    </p>
                </div>
            </div>
            {q.isPending && (
                <div className="stack">
                    <DatabaseSkeleton label="Loading traffic" />
                    <DayChartSkeleton label="Loading the traffic chart" />
                </div>
            )}
            {q.isError && (
                <div className="backup__banner backup__banner--bad">
                    <CircleAlert aria-hidden="true" />
                    <div role="alert">
                        <strong>Couldn’t load traffic</strong>
                        <p>
                            {q.error instanceof ApiRequestError
                                ? q.error.message
                                : 'The request failed.'}
                        </p>
                    </div>
                </div>
            )}
            {d && !d.enabled && (
                <div className="backup__banner backup__banner--warn">
                    <CircleAlert aria-hidden="true" />
                    <div role="status">
                        <strong>Traffic isn’t set up</strong>
                        <p>
                            Set CLOUDFLARE_API_TOKEN (a token with Analytics: Read on the site) and
                            CLOUDFLARE_ZONE_ID (on the site’s Overview page in Cloudflare) in .env,
                            then run docker compose up -d. See DEPLOYMENT.md.
                        </p>
                    </div>
                </div>
            )}
            {d?.enabled && <Traffic d={d} />}
        </section>
    );
}
