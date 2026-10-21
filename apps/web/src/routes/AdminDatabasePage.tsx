import { useState } from 'react';
import { ArrowLeft, Database, Wrench } from 'lucide-react';
import { Link } from 'react-router';
import type { DatabaseStatsDto } from '@gamequeue/shared';
import { useAdminDatabase, usePurgeSessions, usePurgeUnusedGames, useVacuum } from '../api/admin';
import { useConfirm } from '../components/Confirm';
import { DatabaseSkeleton } from '../components/PageSkeletons';
import { formatBytes, timeAgo, usePageTitle } from '../lib';

const n = (v: number) => v.toLocaleString();
const when = (ms: number | null) => (ms === null ? '—' : timeAgo(ms));

function Group({
    id,
    title,
    note,
    stats
}: {
    id: string;
    title: string;
    note?: string;
    stats: { label: string; value: string; title?: string }[];
}) {
    return (
        <section className="panel" aria-labelledby={id}>
            <h2 id={id}>{title}</h2>
            {note && <p className="muted">{note}</p>}
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

function Action({
    title,
    text,
    button,
    disabled,
    pending,
    run
}: {
    title: string;
    text: string;
    button: string;
    disabled?: boolean;
    pending: boolean;
    run: () => Promise<string | undefined>;
}) {
    const [message, setMessage] = useState<{ ok: boolean; text: string }>();
    return (
        <li className="maint">
            <div className="maint__text">
                <strong>{title}</strong>
                <p className="muted">{text}</p>
                <p role="status" className={message?.ok === false ? 'form-error' : 'muted'}>
                    {message?.text}
                </p>
            </div>
            <button
                className="btn"
                disabled={disabled || pending}
                onClick={async () => {
                    setMessage(undefined);
                    try {
                        const done = await run();
                        if (done) setMessage({ ok: true, text: done });
                    } catch {
                        setMessage({ ok: false, text: 'That failed. Nothing was changed.' });
                    }
                }}
            >
                {pending ? 'Working…' : button}
            </button>
        </li>
    );
}

function Maintenance({ d }: { d: DatabaseStatsDto }) {
    const confirm = useConfirm();
    const purgeGames = usePurgeUnusedGames();
    const purgeSessions = usePurgeSessions();
    const vacuum = useVacuum();
    const unusedGames = d.cache.games - d.cache.gamesInUse;
    const free = d.storage.freePages * d.storage.pageSize;
    return (
        <section className="panel" aria-labelledby="maint-h">
            <h2 id="maint-h">
                <Wrench aria-hidden="true" /> Housekeeping
            </h2>
            <ul className="maint-list">
                <Action
                    title="Remove unused cached games"
                    text={`${n(unusedGames)} cached ${unusedGames === 1 ? 'game is' : 'games are'} in nobody's collection or wishlist, and ${n(d.cache.unusedSeries)} ${d.cache.unusedSeries === 1 ? 'series has' : 'series have'} no cached game. Nothing a user can see changes; a game is fetched from IGDB again if someone adds it later.`}
                    button="Remove"
                    disabled={unusedGames === 0 && d.cache.unusedSeries === 0}
                    pending={purgeGames.isPending}
                    run={async () => {
                        if (
                            !(await confirm({
                                title: 'Remove unused cached games?',
                                message: `This deletes ${n(unusedGames)} cached ${unusedGames === 1 ? 'game' : 'games'} and ${n(d.cache.unusedSeries)} unused ${d.cache.unusedSeries === 1 ? 'series' : 'series'}. Adding one again later costs an IGDB request.`,
                                confirmLabel: 'Remove',
                                tone: 'danger'
                            }))
                        )
                            return undefined;
                        const r = await purgeGames.mutateAsync();
                        return `Removed ${n(r.deletedGames)} games and ${n(r.deletedSeries)} series.`;
                    }}
                />
                <Action
                    title="Remove expired sessions"
                    text={`${n(d.content.expiredSessions)} expired ${d.content.expiredSessions === 1 ? 'session is' : 'sessions are'} waiting to be removed. The server also does this every few hours.`}
                    button="Remove"
                    disabled={d.content.expiredSessions === 0}
                    pending={purgeSessions.isPending}
                    run={async () => {
                        const r = await purgeSessions.mutateAsync();
                        return `Removed ${n(r.deleted)} sessions.`;
                    }}
                />
                <Action
                    title="Compact the database file"
                    text={`Rewrites the file without its ${formatBytes(free)} of empty space and empties the write-ahead log. Writes wait while it runs, usually a few seconds, and it needs enough free disk for a temporary copy of the database.`}
                    button="Compact"
                    pending={vacuum.isPending}
                    run={async () => {
                        if (
                            !(await confirm({
                                title: 'Compact the database?',
                                message:
                                    'The app pauses writes for a few seconds. Make sure there is free disk space for a copy of the database.',
                                confirmLabel: 'Compact'
                            }))
                        )
                            return undefined;
                        const r = await vacuum.mutateAsync();
                        return `Went from ${formatBytes(r.beforeBytes)} to ${formatBytes(r.afterBytes)}.`;
                    }}
                />
            </ul>
        </section>
    );
}

function Stats({ d }: { d: DatabaseStatsDto }) {
    const { storage, cache, content } = d;
    const freeBytes = storage.freePages * storage.pageSize;
    const maxBytes = Math.max(1, ...d.tables.map((t) => t.bytes));
    return (
        <div className="stack">
            <Group
                id="storage-h"
                title="Storage"
                note={`SQLite ${d.sqliteVersion}. The log file holds recent writes until SQLite merges them into the database file.`}
                stats={[
                    { label: 'Database file', value: formatBytes(storage.fileBytes) },
                    { label: 'Write-ahead log', value: formatBytes(storage.walBytes) },
                    {
                        label: 'Unused space in file',
                        value: formatBytes(freeBytes),
                        title: `${n(storage.freePages)} of ${n(storage.pageCount)} pages of ${formatBytes(storage.pageSize)} are empty and get reused before the file grows`
                    }
                ]}
            />
            <Group
                id="cache-h"
                title="IGDB cache"
                note="Game metadata copied from IGDB the first time anyone adds a game. It is shared by all users and never re-fetched, apart from release dates."
                stats={[
                    { label: 'Cached games', value: n(cache.games) },
                    { label: 'In a collection or wishlist', value: n(cache.gamesInUse) },
                    { label: 'Not used by anyone', value: n(cache.games - cache.gamesInUse) },
                    { label: 'Series', value: n(cache.series) },
                    { label: 'Series members', value: n(cache.seriesMembers) },
                    { label: 'Platforms', value: n(cache.platforms) },
                    { label: 'Genres', value: n(cache.genres) },
                    { label: 'Themes', value: n(cache.themes) },
                    { label: 'Oldest fetch', value: when(cache.oldestFetchedAt) },
                    { label: 'Newest fetch', value: when(cache.newestFetchedAt) }
                ]}
            />
            <Group
                id="content-h"
                title="Stored by users"
                stats={[
                    { label: 'Users', value: n(content.users) },
                    { label: 'Collection entries', value: n(content.entries) },
                    { label: 'Playthroughs', value: n(content.playthroughs) },
                    { label: 'Lists', value: n(content.lists) },
                    { label: 'Smart lists', value: n(content.smartLists) },
                    { label: 'Wishlist items', value: n(content.wishlistItems) },
                    { label: 'Tags', value: n(content.tags) },
                    {
                        label: 'Uploaded avatars',
                        value: `${n(content.avatars)} (${formatBytes(content.avatarBytes)})`
                    },
                    {
                        label: 'Sessions',
                        value: n(content.sessions),
                        title: `${n(content.expiredSessions)} expired, waiting to be purged`
                    }
                ]}
            />
            <Maintenance d={d} />
            <section className="panel" aria-labelledby="tables-h">
                <h2 id="tables-h">Tables</h2>
                <p className="muted">Size includes each table's indexes. Largest first.</p>
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th scope="col">Table</th>
                            <th scope="col" className="num">
                                Rows
                            </th>
                            <th scope="col" className="num">
                                Size
                            </th>
                            <th scope="col">
                                <span className="sr-only">Share of the largest table</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {d.tables.map((t) => (
                            <tr key={t.name}>
                                <th scope="row">{t.name}</th>
                                <td className="num">{n(t.rows)}</td>
                                <td className="num">{formatBytes(t.bytes)}</td>
                                <td aria-hidden="true">
                                    <span
                                        className="admin-table__bar"
                                        style={{ width: `${(t.bytes / maxBytes) * 100}%` }}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        </div>
    );
}

/** `/admin/database`: what the database holds and how much space it uses. */
export function AdminDatabasePage() {
    usePageTitle('Database | Admin');
    const db = useAdminDatabase();
    return (
        <section>
            <Link to="/admin" className="back-link">
                <ArrowLeft aria-hidden="true" /> Admin
            </Link>
            <div className="page-head">
                <div>
                    <h1>
                        <Database aria-hidden="true" />
                        Database
                    </h1>
                    <p className="muted">Size, IGDB cache and what is stored.</p>
                </div>
            </div>
            {db.isPending ? (
                <DatabaseSkeleton />
            ) : db.isError ? (
                <p className="form-error" role="alert">
                    Couldn't load the database stats.
                </p>
            ) : (
                <Stats d={db.data} />
            )}
        </section>
    );
}
