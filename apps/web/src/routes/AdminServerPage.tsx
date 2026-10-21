import { ArrowLeft, Server, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import type { ServerInfoDto } from '@gamequeue/shared';
import { useAdminServer } from '../api/admin';
import { DatabaseSkeleton } from '../components/PageSkeletons';
import { diskIsLow, formatBytes, formatDuration, usePageTitle } from '../lib';

const yesNo = (v: boolean) => (v ? 'Yes' : 'No');

function Facts({ rows }: { rows: [string, string][] }) {
    return (
        <dl className="backup__facts">
            {rows.map(([k, v]) => (
                <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                </div>
            ))}
        </dl>
    );
}

function Info({ d }: { d: ServerInfoDto }) {
    const disk = d.disk;
    const low = disk && diskIsLow(disk);
    const usedPct = disk
        ? Math.round(((disk.totalBytes - disk.freeBytes) / disk.totalBytes) * 100)
        : 0;
    return (
        <div className="stack">
            <section className="panel" aria-labelledby="disk-h">
                <h2 id="disk-h">Disk space</h2>
                {disk ? (
                    <>
                        {low && (
                            <div className="backup__banner backup__banner--bad" role="alert">
                                <TriangleAlert aria-hidden="true" />
                                <div>
                                    <strong>Disk space is running low</strong>
                                    <p>
                                        Under 1 GB or 10% is free. A full disk stops the database
                                        from writing and backups from running.
                                    </p>
                                </div>
                            </div>
                        )}
                        <div
                            className="meter"
                            role="img"
                            aria-label={`${usedPct}% of the disk is used`}
                        >
                            <span
                                className={`meter__fill${low ? ' meter__fill--bad' : ''}`}
                                style={{ width: `${usedPct}%` }}
                            />
                        </div>
                        <Facts
                            rows={[
                                ['Free', formatBytes(disk.freeBytes)],
                                [
                                    'Used',
                                    `${formatBytes(disk.totalBytes - disk.freeBytes)} (${usedPct}%)`
                                ],
                                ['Total', formatBytes(disk.totalBytes)]
                            ]}
                        />
                        <p className="muted">
                            For the volume that holds the database ({d.config.databasePath}). In
                            Docker that is the mounted data volume, so it shows the host's disk.
                        </p>
                    </>
                ) : (
                    <p className="muted">This platform can't report free disk space.</p>
                )}
            </section>
            <section className="panel" aria-labelledby="proc-h">
                <h2 id="proc-h">Process</h2>
                <Facts
                    rows={[
                        ['Uptime', formatDuration(d.uptimeSeconds)],
                        ['Started', new Date(d.startedAt).toLocaleString()],
                        ['Node.js', d.nodeVersion],
                        ['Platform', `${d.platform} ${d.arch}`],
                        ['Memory (RSS)', formatBytes(d.memory.rssBytes)],
                        ['Heap used', formatBytes(d.memory.heapUsedBytes)]
                    ]}
                />
            </section>
            <section className="panel" aria-labelledby="conf-h">
                <h2 id="conf-h">Configuration</h2>
                <p className="muted">
                    Read from the environment when the server started. Secrets are never shown.
                </p>
                <Facts
                    rows={[
                        ['Environment', d.nodeEnv],
                        ['Port', String(d.config.port)],
                        ['Database path', d.config.databasePath],
                        ['Secure cookies', yesNo(d.config.secureCookies)],
                        ['Trust proxy headers', yesNo(d.config.trustProxy)],
                        ['IGDB credentials set', yesNo(d.config.igdbConfigured)],
                        ['Allowed origins', d.config.allowedOrigins.join(', ') || '—']
                    ]}
                />
            </section>
        </div>
    );
}

/** `/admin/server`: the running process, its configuration and free disk space. */
export function AdminServerPage() {
    usePageTitle('Server | Admin');
    const q = useAdminServer();
    return (
        <section>
            <Link to="/admin" className="back-link">
                <ArrowLeft aria-hidden="true" /> Admin
            </Link>
            <div className="page-head">
                <div>
                    <h1>
                        <Server aria-hidden="true" />
                        Server
                    </h1>
                    <p className="muted">The running process, its configuration and disk space.</p>
                </div>
            </div>
            {q.isPending ? (
                <DatabaseSkeleton label="Loading server information" />
            ) : q.isError ? (
                <p className="form-error" role="alert">
                    Couldn't load the server information.
                </p>
            ) : (
                <Info d={q.data} />
            )}
        </section>
    );
}
