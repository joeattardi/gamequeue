import { ArrowLeft, CircleAlert, CircleCheck, DatabaseZap, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import {
    MIRROR_LOOKUP_METHODS,
    mirrorHealth,
    type MirrorHealth,
    type MirrorLookupsDto,
    type MirrorStatusDto
} from '@gamequeue/shared';
import { useAdminMirror } from '../api/admin';
import { DatabaseSkeleton, UserStatsSkeleton } from '../components/PageSkeletons';
import { formatBytes, timeAgo, usePageTitle } from '../lib';

const when = (ms: number | null | undefined) => (ms == null ? 'Never' : timeAgo(ms));
const exact = (ms: number | null | undefined) =>
    ms == null ? undefined : new Date(ms).toLocaleString();

type Tone = 'good' | 'warn' | 'bad';

const HEALTH: Record<
    MirrorHealth,
    { tone: Tone; title: string; text: (s: MirrorStatusDto) => string }
> = {
    healthy: {
        tone: 'good',
        title: 'The mirror is up to date',
        text: (s) =>
            `Last checked ${when(s.run?.lastSuccessAt)}. Search and game lookups are answered locally.`
    },
    stale: {
        tone: 'warn',
        title: 'The daily update is overdue',
        text: (s) =>
            s.run
                ? `The last successful run was ${when(s.run.lastSuccessAt)}. Check the cron job and ~/gamequeue/mirror.log on the Pi.`
                : 'The update job has never reported in, though a mirror file exists. Check the cron job and ~/gamequeue/mirror.log on the Pi.'
    },
    failed: {
        tone: 'bad',
        title: 'The last update failed',
        text: (s) =>
            `${(s.run?.error ?? 'The job reported an error').replace(/\.?$/, '.')} ${
                s.mirror
                    ? 'The previous mirror is still in use.'
                    : 'Until one is built, IGDB is queried live.'
            }`
    },
    never: {
        tone: 'warn',
        title: 'No mirror has been built yet',
        text: () =>
            'Search and game lookups use live IGDB. Run scripts/mirror.sh once on the Pi to build one (see DEPLOYMENT.md).'
    },
    missing: {
        tone: 'bad',
        title: 'The mirror file is missing',
        text: () =>
            'The last run succeeded, but the mirror file cannot be read now (deleted, or an older format). Run scripts/mirror.sh --force to rebuild it. IGDB is queried live meanwhile.'
    }
};

function Banner({ tone, title, text }: { tone: Tone; title: string; text: string }) {
    const Icon = tone === 'good' ? CircleCheck : tone === 'warn' ? TriangleAlert : CircleAlert;
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

function Status({ s }: { s: MirrorStatusDto }) {
    const health = HEALTH[mirrorHealth(s, Date.now())];
    const { mirror, run } = s;
    const synced = mirror?.dump && s.syncedDump === mirror.dump;
    const stats = [
        { label: 'Games', value: mirror ? mirror.games.toLocaleString() : '-' },
        {
            label: 'Searchable',
            value: mirror ? mirror.searchable.toLocaleString() : '-',
            title: 'Games search can show: no editions or add-ons. The rest are kept for lookups by id.'
        },
        { label: 'File size', value: mirror ? formatBytes(mirror.sizeBytes) : '-' },
        {
            label: 'Built',
            value: when(mirror?.builtAt),
            title: exact(mirror?.builtAt)
        },
        {
            label: "IGDB's dump from",
            value: when(mirror?.dumpAt),
            title: exact(mirror?.dumpAt)
        },
        {
            label: 'Last run',
            value: when(run?.lastRunAt),
            title: exact(run?.lastRunAt)
        },
        {
            label: 'Last success',
            value: when(run?.lastSuccessAt),
            title: exact(run?.lastSuccessAt)
        },
        {
            label: 'Last run took',
            value:
                run?.seconds != null
                    ? `${run.seconds} s${run.attempts > 1 ? ` (${run.attempts} tries)` : ''}`
                    : '-',
            title:
                run && run.attempts > 1
                    ? 'A download failed and the build was started again, up to three times.'
                    : undefined
        },
        {
            label: 'Cached games refreshed',
            value: !mirror ? '-' : synced ? 'Yes' : 'Pending',
            title: synced
                ? 'Every game in the shared cache has the data of the current dump.'
                : 'The server refreshes its cached games within 10 minutes of a new dump.'
        }
    ];
    return (
        <div className="stack">
            <Banner tone={health.tone} title={health.title} text={health.text(s)} />
            {s.runUnreadable && (
                <p className="form-error" role="alert">
                    mirror-status.json exists but could not be read. Run scripts/mirror.sh once to
                    rewrite it.
                </p>
            )}
            <dl className="backup__facts">
                {stats.map((x) => (
                    <div key={x.label}>
                        <dt>{x.label}</dt>
                        <dd title={x.title}>{x.value}</dd>
                    </div>
                ))}
            </dl>
            {run && run.result && (
                <p className="muted">
                    The last run {run.result === 'built' ? 'built a new mirror' : 'found IGDB'}
                    {run.result === 'built'
                        ? ''
                        : "'s dump unchanged and left the mirror as it was"}
                    .
                </p>
            )}
        </div>
    );
}

function Lookups({ l }: { l: MirrorLookupsDto }) {
    const total = l.local + l.live;
    const share = total > 0 ? `${Math.round((l.local / total) * 100)}%` : '-';
    return (
        <div className="stack">
            <dl className="admin-stats">
                <div>
                    <dd>{l.local.toLocaleString()}</dd>
                    <dt>Answered by the mirror</dt>
                </div>
                <div>
                    <dd>{l.live.toLocaleString()}</dd>
                    <dt>Sent to live IGDB</dt>
                </div>
                <div>
                    <dd>{share}</dd>
                    <dt>Answered locally</dt>
                </div>
            </dl>
            {total > 0 && (
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th scope="col">Lookup</th>
                            <th scope="col">Mirror</th>
                            <th scope="col">Live IGDB</th>
                        </tr>
                    </thead>
                    <tbody>
                        {l.methods.map((m) => (
                            <tr key={m.method}>
                                <th scope="row">{MIRROR_LOOKUP_METHODS[m.method]}</th>
                                <td>{m.local.toLocaleString()}</td>
                                <td>{m.live.toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            <p className="muted">
                {total === 0 ? 'No lookups yet since the server started. ' : ''}
                Counted since {new Date(l.since).toLocaleString()}; a restart starts them again. A
                lookup counts as sent to live IGDB when the mirror couldn't answer all of it: a game
                newer than the last dump, a search with no local match (a typo, say), or no mirror
                built yet.
            </p>
        </div>
    );
}

/** `/admin/mirror`: the local copy of IGDB's data and the daily job that rebuilds it. */
export function AdminMirrorPage() {
    usePageTitle('IGDB mirror | Admin');
    const q = useAdminMirror();
    return (
        <section>
            <Link to="/admin" className="back-link">
                <ArrowLeft aria-hidden="true" /> Admin
            </Link>
            <div className="page-head">
                <div>
                    <h1>
                        <DatabaseZap aria-hidden="true" />
                        IGDB mirror
                    </h1>
                    <p className="muted">
                        A local copy of IGDB's data, rebuilt from its daily data dump.
                    </p>
                </div>
            </div>
            <div className="stack">
                <section className="panel" aria-labelledby="mirror-status-h">
                    <h2 id="mirror-status-h">Status</h2>
                    {q.isPending ? (
                        <DatabaseSkeleton label="Loading mirror status" />
                    ) : q.isError ? (
                        <p className="form-error" role="alert">
                            Couldn't load the mirror status.
                        </p>
                    ) : (
                        <Status s={q.data} />
                    )}
                </section>
                {(q.isPending || q.data?.lookups) && (
                    <section className="panel" aria-labelledby="mirror-lookups-h">
                        <h2 id="mirror-lookups-h">Lookups</h2>
                        {q.data?.lookups ? <Lookups l={q.data.lookups} /> : <UserStatsSkeleton />}
                    </section>
                )}
                <section className="panel" aria-labelledby="mirror-how-h">
                    <h2 id="mirror-how-h">How it works</h2>
                    <p className="muted">
                        A cron job on the server runs <code>scripts/mirror.sh</code> once a day,
                        shortly after IGDB publishes its dump (around 06:00 UTC). It downloads the
                        data, builds a new copy, checks it, and only then replaces the old one, so a
                        failed run changes nothing. The server notices the new file within seconds
                        and refreshes its cached games within ten minutes. Searches, game pages,
                        series and similar games are answered from the copy; live IGDB is asked only
                        for what the copy lacks. To update right now, run{' '}
                        <code>~/gamequeue/scripts/mirror.sh</code> on the Pi (add{' '}
                        <code>--force</code> to rebuild even if the dump is unchanged).
                    </p>
                </section>
            </div>
        </section>
    );
}
