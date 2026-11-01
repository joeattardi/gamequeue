import { useState, type FormEvent } from 'react';
import { ArrowLeft, Images } from 'lucide-react';
import { Link } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useScreenshotStorage, useSetScreenshotCap } from '../api/journal';
import { DatabaseSkeleton } from '../components/PageSkeletons';
import { StorageMeter } from '../components/StorageMeter';
import { formatBytes, usePageTitle } from '../lib';

const GIB = 1024 ** 3;

/** Screenshot storage: how much of the limit is used, the free disk, and a control for the limit. */
export function AdminScreenshotsPage() {
    usePageTitle('Admin · Screenshots');
    const q = useScreenshotStorage();
    const set = useSetScreenshotCap();
    const [gib, setGib] = useState<string>();
    const [message, setMessage] = useState<{ ok: boolean; text: string }>();
    const d = q.data;

    function save(e: FormEvent) {
        e.preventDefault();
        const value = Number(gib ?? (d ? d.capBytes / GIB : NaN));
        if (!Number.isFinite(value) || value < 0)
            return setMessage({ ok: false, text: 'Enter a size in GB, 0 or more.' });
        set.mutate(Math.round(value * GIB), {
            onSuccess: () => {
                setGib(undefined);
                setMessage({ ok: true, text: 'Limit saved. It applies to the next upload.' });
            },
            onError: (err) =>
                setMessage({
                    ok: false,
                    text: err instanceof ApiRequestError ? err.message : 'Could not save.'
                })
        });
    }

    return (
        <section className="stack">
            <div className="page-head">
                <div>
                    <Link className="back-link" to="/admin">
                        <ArrowLeft aria-hidden="true" /> Admin
                    </Link>
                    <h1>
                        <Images aria-hidden="true" /> Screenshots
                    </h1>
                    <p className="muted">
                        Pictures in playthrough journals. Uploads are refused once the limit is
                        reached.
                    </p>
                </div>
            </div>
            {q.isPending ? (
                <DatabaseSkeleton label="Loading screenshot storage" />
            ) : q.isError || !d ? (
                <p role="alert">Couldn't load this.</p>
            ) : (
                <>
                    <section className="panel stack" aria-labelledby="shots-use-h">
                        <h2 id="shots-use-h">Space used</h2>
                        <StorageMeter used={d.usedBytes} cap={d.capBytes} />
                        <dl className="admin-stats">
                            <div>
                                <dd>{formatBytes(d.usedBytes)}</dd>
                                <dt>Used</dt>
                            </div>
                            <div>
                                <dd>{formatBytes(d.capBytes)}</dd>
                                <dt>Limit</dt>
                            </div>
                            <div>
                                <dd>{d.files.toLocaleString()}</dd>
                                <dt>Files</dt>
                            </div>
                            <div>
                                <dd>
                                    {d.freeDiskBytes === null ? '—' : formatBytes(d.freeDiskBytes)}
                                </dd>
                                <dt>Disk free</dt>
                            </div>
                        </dl>
                        {d.freeDiskBytes !== null && d.capBytes - d.usedBytes > d.freeDiskBytes && (
                            <p className="form-error" role="status">
                                The limit leaves more room than the disk has free, so the disk fills
                                up first.
                            </p>
                        )}
                    </section>
                    <form className="panel stack" onSubmit={save} aria-labelledby="shots-cap-h">
                        <h2 id="shots-cap-h">Limit</h2>
                        <label className="field">
                            <span>Storage limit (GB)</span>
                            <input
                                type="number"
                                min="0"
                                step="any"
                                inputMode="decimal"
                                value={gib ?? String(Math.round((d.capBytes / GIB) * 100) / 100)}
                                onChange={(e) => setGib(e.target.value)}
                            />
                        </label>
                        <div>
                            <button
                                className="btn btn--primary"
                                type="submit"
                                disabled={set.isPending}
                            >
                                Save limit
                            </button>
                        </div>
                        <p
                            className={message?.ok ? 'muted' : 'form-error'}
                            role="status"
                            aria-live="polite"
                        >
                            {message?.text}
                        </p>
                    </form>
                </>
            )}
        </section>
    );
}
