import { ArrowLeft, Database } from 'lucide-react';
import { Link } from 'react-router';
import type { DatabaseStatsDto } from '@gamequeue/shared';
import { useAdminDatabase } from '../api/admin';
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
