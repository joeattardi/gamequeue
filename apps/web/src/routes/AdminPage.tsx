import {
    backupHealth,
    type BackupHealth,
    type BackupReportDto,
    type BackupStatusDto
} from '@gamequeue/shared';
import { CircleAlert, CircleCheck, DatabaseBackup, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useAdminBackup } from '../api/admin';
import { BackupSkeleton } from '../components/PageSkeletons';
import { timeAgo, usePageTitle } from '../lib';

const formatBytes = (n: number) =>
    n < 1024
        ? `${n} B`
        : n < 1024 * 1024
          ? `${(n / 1024).toFixed(1)} KB`
          : `${(n / 1024 / 1024).toFixed(1)} MB`;

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
