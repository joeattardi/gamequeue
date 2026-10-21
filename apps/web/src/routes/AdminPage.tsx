import {
    backupHealth,
    type BackupHealth,
    type BackupReportDto,
    type BackupStatusDto
} from '@gamequeue/shared';
import {
    ArrowRight,
    CircleAlert,
    CircleCheck,
    Database,
    DatabaseBackup,
    ShieldCheck,
    TriangleAlert,
    Users
} from 'lucide-react';
import { Link } from 'react-router';
import { useAdminBackup, useAdminDatabase, useAdminUsers } from '../api/admin';
import { BackupSkeleton, UserStatsSkeleton } from '../components/PageSkeletons';
import { formatBytes, timeAgo, usePageTitle } from '../lib';

const when = (ms: number) => ({
    ago: timeAgo(ms),
    exact: new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
});

const HEALTH: Record<
    BackupHealth,
    { tone: 'good' | 'warn' | 'bad'; title: string; text: (b: BackupStatusDto | null) => string }
> = {
    healthy: {
        tone: 'good',
        title: 'Backups are working',
        text: (b) => `The last backup finished ${when(b!.lastSuccessAt!).ago}.`
    },
    'no-offsite': {
        tone: 'warn',
        title: 'No off-site copy',
        text: () =>
            "Backups are only kept on this machine. Set up the rclone remote named 'offsite' (see DEPLOYMENT.md)."
    },
    stale: {
        tone: 'bad',
        title: 'Backups are overdue',
        text: (b) =>
            b?.lastSuccessAt
                ? `The last successful backup was ${when(b.lastSuccessAt).ago}. The nightly job should run every day.`
                : 'No backup has succeeded yet.'
    },
    failed: {
        tone: 'bad',
        title: 'The last backup failed',
        text: (b) => b?.error ?? 'The backup script reported an error.'
    },
    never: {
        tone: 'bad',
        title: 'No backup recorded',
        text: () =>
            'The backup script has not reported in. Check the cron job and ~/gamequeue/backup.log on the Pi.'
    }
};

const ICON = { good: CircleCheck, warn: TriangleAlert, bad: CircleAlert };

const OFFSITE = {
    uploaded: 'Uploaded',
    'not-configured': 'Not configured',
    failed: 'Upload failed'
} as const;

function BackupStatus({ report }: { report: BackupReportDto }) {
    const { backup } = report;
    const health = report.unreadable ? undefined : HEALTH[backupHealth(backup, Date.now())];
    const tone = health?.tone ?? 'bad';
    const Icon = ICON[tone];
    return (
        <div className="backup">
            <div className={`backup__banner backup__banner--${tone}`}>
                <Icon aria-hidden="true" />
                <div role={tone === 'bad' ? 'alert' : 'status'}>
                    <strong>{health?.title ?? 'Backup status unreadable'}</strong>
                    <p>
                        {health?.text(backup) ??
                            'backup-status.json exists but could not be read. Run scripts/backup.sh once to rewrite it.'}
                    </p>
                </div>
            </div>
            {backup && (
                <dl className="backup__facts">
                    <div>
                        <dt>Last run</dt>
                        <dd title={when(backup.lastRunAt).exact}>{when(backup.lastRunAt).ago}</dd>
                    </div>
                    <div>
                        <dt>Last success</dt>
                        <dd title={backup.lastSuccessAt ? when(backup.lastSuccessAt).exact : ''}>
                            {backup.lastSuccessAt ? when(backup.lastSuccessAt).ago : 'Never'}
                        </dd>
                    </div>
                    <div>
                        <dt>Off-site copy</dt>
                        <dd>{OFFSITE[backup.offsite]}</dd>
                    </div>
                    <div>
                        <dt>Latest snapshot</dt>
                        <dd>
                            {backup.file
                                ? `${backup.file}${backup.sizeBytes != null ? ` (${formatBytes(backup.sizeBytes)})` : ''}`
                                : '—'}
                        </dd>
                    </div>
                </dl>
            )}
        </div>
    );
}

function DatabaseTile() {
    const db = useAdminDatabase();
    const d = db.data;
    const stats = d && [
        { label: 'Database size', value: formatBytes(d.storage.fileBytes + d.storage.walBytes) },
        { label: 'Cached games', value: d.cache.games.toLocaleString() },
        { label: 'Tables', value: d.tables.length.toLocaleString() }
    ];
    return (
        <section className="panel admin-tile" aria-labelledby="db-heading">
            <h2 id="db-heading">
                <Database aria-hidden="true" /> Database
            </h2>
            {db.isPending ? (
                <UserStatsSkeleton />
            ) : db.isError ? (
                <p className="form-error" role="alert">
                    Couldn't load the database stats.
                </p>
            ) : (
                <dl className="admin-stats">
                    {stats!.map((s) => (
                        <div key={s.label}>
                            <dd>{s.value}</dd>
                            <dt>{s.label}</dt>
                        </div>
                    ))}
                </dl>
            )}
            <Link className="admin-tile__link" to="/admin/database">
                Database details <ArrowRight aria-hidden="true" />
            </Link>
        </section>
    );
}

function UsersTile() {
    const users = useAdminUsers();
    const list = users.data;
    const monthAgo = Date.now() - 30 * 24 * 3600 * 1000;
    const stats = list && [
        { label: 'Users', value: list.length },
        { label: 'Admins', value: list.filter((u) => u.role === 'admin').length },
        { label: 'Joined in 30 days', value: list.filter((u) => u.createdAt >= monthAgo).length },
        { label: 'Games', value: list.reduce((n, u) => n + u.gameCount, 0) }
    ];
    return (
        <section className="panel admin-tile" aria-labelledby="users-heading">
            <h2 id="users-heading">
                <Users aria-hidden="true" /> Users
            </h2>
            {users.isPending ? (
                <UserStatsSkeleton />
            ) : users.isError ? (
                <p className="form-error" role="alert">
                    Couldn't load the users.
                </p>
            ) : (
                <dl className="admin-stats">
                    {stats!.map((s) => (
                        <div key={s.label}>
                            <dd>{s.value}</dd>
                            <dt>{s.label}</dt>
                        </div>
                    ))}
                </dl>
            )}
            <Link className="admin-tile__link" to="/admin/users">
                Manage users <ArrowRight aria-hidden="true" />
            </Link>
        </section>
    );
}

/** Admin area; only routed (and linked) for users with the admin role. */
export function AdminPage() {
    usePageTitle('Admin');
    const backup = useAdminBackup();
    return (
        <section>
            <div className="page-head">
                <div>
                    <h1>
                        <ShieldCheck aria-hidden="true" />
                        Admin
                    </h1>
                    <p className="muted">Tools for running this GameQueue instance.</p>
                </div>
            </div>
            <div className="admin-tiles">
                <UsersTile />
                <DatabaseTile />
            </div>
            <section className="panel" aria-labelledby="backup-heading">
                <h2 id="backup-heading">
                    <DatabaseBackup aria-hidden="true" /> Backups
                </h2>
                {backup.isPending ? (
                    <BackupSkeleton />
                ) : backup.isError ? (
                    <p className="form-error" role="alert">
                        Couldn't load the backup status.
                    </p>
                ) : (
                    <BackupStatus report={backup.data} />
                )}
            </section>
        </section>
    );
}
