import {
    backupHealth,
    type BackupHealth,
    type BackupReportDto,
    type BackupStatusDto
} from '@gamequeue/shared';
import {
    CircleAlert,
    CircleCheck,
    Database,
    DatabaseBackup,
    Gamepad2,
    Server,
    ShieldCheck,
    SlidersHorizontal,
    TriangleAlert,
    Users
} from 'lucide-react';
import {
    useAdminBackup,
    useAdminDatabase,
    useAdminIgdb,
    useAdminServer,
    useAdminSettings,
    useAdminUsers,
    useUpdateAdminSettings
} from '../api/admin';
import { AdminTile } from '../components/AdminTile';
import { BackupSkeleton, CheckSkeletons } from '../components/PageSkeletons';
import { diskIsLow, formatBytes, formatDuration, timeAgo, usePageTitle } from '../lib';

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

const state = (q: { isPending: boolean; isError: boolean }) =>
    q.isPending ? 'pending' : q.isError ? 'error' : 'ready';

function DatabaseTile() {
    const q = useAdminDatabase();
    const d = q.data;
    return (
        <AdminTile
            id="db-heading"
            icon={<Database aria-hidden="true" />}
            title="Database"
            state={state(q)}
            stats={
                d
                    ? [
                          {
                              label: 'Database size',
                              value: formatBytes(d.storage.fileBytes + d.storage.walBytes)
                          },
                          { label: 'Cached games', value: d.cache.games.toLocaleString() },
                          { label: 'Tables', value: d.tables.length }
                      ]
                    : []
            }
            to="/admin/database"
            linkLabel="Details and cleanup"
        />
    );
}

function UsersTile() {
    const q = useAdminUsers();
    const list = q.data ?? [];
    const monthAgo = Date.now() - 30 * 24 * 3600 * 1000;
    return (
        <AdminTile
            id="users-heading"
            icon={<Users aria-hidden="true" />}
            title="Users"
            state={state(q)}
            stats={[
                { label: 'Users', value: list.length },
                { label: 'Admins', value: list.filter((u) => u.role === 'admin').length },
                {
                    label: 'Joined in 30 days',
                    value: list.filter((u) => u.createdAt >= monthAgo).length
                },
                { label: 'Games', value: list.reduce((n, u) => n + u.gameCount, 0) }
            ]}
            to="/admin/users"
            linkLabel="Manage users"
        />
    );
}

function IgdbTile() {
    const q = useAdminIgdb();
    const d = q.data;
    const failing = d && d.requests24h.failed > 0;
    return (
        <AdminTile
            id="igdb-heading"
            icon={<Gamepad2 aria-hidden="true" />}
            title="IGDB"
            state={state(q)}
            stats={
                d
                    ? !d.configured
                        ? [{ label: 'Status', value: 'Not set up' }]
                        : [
                              {
                                  label: 'Access token',
                                  value: d.token.valid ? 'Valid' : 'None yet',
                                  title: d.token.expiresAt
                                      ? `Expires ${new Date(d.token.expiresAt).toLocaleString()}`
                                      : undefined
                              },
                              { label: 'Requests, 24h', value: d.requests24h.total },
                              { label: 'Failed', value: d.requests24h.failed }
                          ]
                    : []
            }
            to="/admin/igdb"
            linkLabel="IGDB health"
        >
            {failing && d.lastError && (
                <p className="muted">
                    Last error {timeAgo(d.lastError.at)}: {d.lastError.message}
                </p>
            )}
        </AdminTile>
    );
}

function ServerTile() {
    const q = useAdminServer();
    const d = q.data;
    const low = d?.disk && diskIsLow(d.disk);
    return (
        <AdminTile
            id="server-heading"
            icon={<Server aria-hidden="true" />}
            title="Server"
            state={state(q)}
            stats={
                d
                    ? [
                          { label: 'Uptime', value: formatDuration(d.uptimeSeconds) },
                          {
                              label: 'Disk free',
                              value: d.disk ? formatBytes(d.disk.freeBytes) : 'Unknown',
                              title: d.disk
                                  ? `of ${formatBytes(d.disk.totalBytes)} on the database volume`
                                  : undefined
                          },
                          { label: 'Memory', value: formatBytes(d.memory.rssBytes) }
                      ]
                    : []
            }
            to="/admin/server"
            linkLabel="Server details"
        >
            {low && (
                <p className="admin-warn" role="status">
                    <TriangleAlert aria-hidden="true" /> Disk space is running low.
                </p>
            )}
        </AdminTile>
    );
}

function SettingsTile() {
    const q = useAdminSettings();
    const update = useUpdateAdminSettings();
    const s = q.data;
    return (
        <section className="panel admin-tile" aria-labelledby="settings-heading">
            <h2 id="settings-heading">
                <SlidersHorizontal aria-hidden="true" /> Settings
            </h2>
            {q.isPending ? (
                <CheckSkeletons count={1} label="Loading settings" />
            ) : q.isError ? (
                <p className="form-error" role="alert">
                    Couldn't load the settings.
                </p>
            ) : (
                <>
                    <label className="check">
                        <input
                            type="checkbox"
                            checked={s!.signupsEnabled}
                            disabled={update.isPending}
                            onChange={(e) => update.mutate({ signupsEnabled: e.target.checked })}
                        />
                        Allow new signups
                    </label>
                    <p className="muted" role="status">
                        {update.isError
                            ? "Couldn't save that."
                            : s!.signupsOverridden
                              ? `Overrides SIGNUPS_ENABLED=${s!.signupsDefault} from the environment. Takes effect immediately.`
                              : `Currently from SIGNUPS_ENABLED in the environment. Changing this takes effect immediately and overrides it.`}
                    </p>
                    <p className="muted">
                        Admins can always create users from the Users page, whatever this says.
                    </p>
                </>
            )}
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
                <IgdbTile />
                <ServerTile />
                <SettingsTile />
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
