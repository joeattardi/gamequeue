import type { ImportReport } from '@gamequeue/shared';
import { useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useImport } from '../api/data';
import { Database } from 'lucide-react';
import { usePageTitle } from '../lib';

interface Problem {
    path: string;
    message: string;
}

export function DataPage() {
    usePageTitle('Your data');
    const imp = useImport();
    const input = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<{ name: string; data: unknown }>();
    const [preview, setPreview] = useState<ImportReport>();
    const [done, setDone] = useState<ImportReport>();
    const [error, setError] = useState<string>();
    const [problems, setProblems] = useState<Problem[]>([]);

    function reset() {
        setFile(undefined);
        setPreview(undefined);
        setDone(undefined);
        setError(undefined);
        setProblems([]);
        if (input.current) input.current.value = '';
    }

    function fail(e: unknown) {
        setProblems([]);
        if (e instanceof ApiRequestError) {
            setError(e.message);
            if (Array.isArray(e.details)) setProblems(e.details as Problem[]);
        } else setError('Something went wrong. Try again.');
    }

    async function onPick(e: ChangeEvent<HTMLInputElement>) {
        const picked = e.target.files?.[0];
        reset();
        if (!picked) return;
        let data: unknown;
        try {
            data = JSON.parse(await picked.text());
        } catch {
            setError("That file isn't valid JSON.");
            return;
        }
        setFile({ name: picked.name, data });
        imp.mutate({ file: data, commit: false }, { onSuccess: setPreview, onError: fail });
    }

    function confirm() {
        if (!file) return;
        setError(undefined);
        imp.mutate(
            { file: file.data, commit: true },
            {
                onSuccess: (report) => {
                    setDone(report);
                    setPreview(undefined);
                    setFile(undefined);
                },
                onError: fail
            }
        );
    }

    return (
        <section>
            <div className="page-head">
                <div>
                    <h1>
                        <Database aria-hidden="true" />
                        Your data
                    </h1>
                    <p className="muted">Back up everything, or bring it back later.</p>
                </div>
            </div>

            <div className="stack">
                <section aria-labelledby="export-h" className="panel">
                    <h2 id="export-h">Export</h2>
                    <p>
                        One JSON file with your collection, playthroughs, slots, lists, queue,
                        wishlist and tags, plus the game details needed to restore it without IGDB.
                    </p>
                    <div>
                        <a className="btn btn--primary" href="/api/data/export" download>
                            Download export
                        </a>
                    </div>
                </section>

                <section aria-labelledby="import-h" className="panel">
                    <h2 id="import-h">Import</h2>
                    <p>
                        Importing <strong>merges</strong> a file into what you have. Nothing of
                        yours is deleted or overwritten: your ratings and notes win, gaps are filled
                        in, and games, platforms, tags and playthroughs you don't have yet are
                        added. Importing the same file twice changes nothing. You'll see a preview
                        first.
                    </p>
                    <label className="field">
                        <span>Export file (.json)</span>
                        <input
                            ref={input}
                            type="file"
                            accept="application/json,.json"
                            onChange={onPick}
                            disabled={imp.isPending}
                        />
                    </label>
                    {imp.isPending && (
                        <p className="muted" role="status">
                            {file ? 'Working…' : 'Reading file…'}
                        </p>
                    )}

                    {error && (
                        <div className="form-error-block" role="alert">
                            <p className="form-error">{error}</p>
                            {problems.length > 0 && (
                                <>
                                    <ul className="problems">
                                        {problems.map((p, i) => (
                                            <li key={i}>
                                                <code>{p.path || '(file)'}</code> {p.message}
                                            </li>
                                        ))}
                                    </ul>
                                    {problems.length >= 50 && (
                                        <p className="muted">
                                            Only the first 50 problems are shown.
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {preview && file && (
                        <div className="stack" aria-live="polite">
                            <h3>Preview of {file.name}</h3>
                            <ReportSummary report={preview} />
                            <div className="row">
                                <button
                                    className="btn btn--primary"
                                    onClick={confirm}
                                    disabled={imp.isPending}
                                >
                                    Import
                                </button>
                                <button className="btn" onClick={reset} disabled={imp.isPending}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {done && (
                        <div className="stack" role="status">
                            <h3>Import complete</h3>
                            <ReportSummary report={done} />
                            <div className="row">
                                <Link className="btn btn--primary" to="/collection">
                                    View collection
                                </Link>
                                <button className="btn" onClick={reset}>
                                    Import another file
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </section>
    );
}

function ReportSummary({ report }: { report: ImportReport }) {
    const { games, playthroughs, lists, queue, wishlist, slots } = report;
    const verb = report.dryRun ? 'Will add' : 'Added';
    const nothing =
        games.added +
            games.updated +
            playthroughs.added +
            lists.created +
            lists.itemsAdded +
            queue.added +
            wishlist.added +
            slots.created +
            slots.filled ===
        0;
    return (
        <div className="stack">
            {nothing && (
                <p>
                    <strong>Nothing new in this file.</strong> Everything in it is already in your
                    collection.
                </p>
            )}
            <dl className="report">
                <Stat label={`${verb} games`} value={games.added} />
                <Stat label={report.dryRun ? 'Will update' : 'Updated'} value={games.updated} />
                <Stat label="Already up to date" value={games.unchanged} />
                <Stat label={`${verb} playthroughs`} value={playthroughs.added} />
                <Stat label="Playthroughs you already had" value={playthroughs.duplicates} />
                <Stat label={`${verb} lists`} value={lists.created} />
                <Stat label={`${verb} list entries`} value={lists.itemsAdded} />
                <Stat label={`${verb} to queue`} value={queue.added} />
                <Stat label={`${verb} to wishlist`} value={wishlist.added} />
                <Stat label={`${verb} slots`} value={slots.created} />
                <Stat label="Slots filled" value={slots.filled} />
            </dl>
            {report.notes.length > 0 && (
                <div>
                    <h4>Worth knowing</h4>
                    <ul className="problems">
                        {report.notes.map((n, i) => (
                            <li key={i}>{n}</li>
                        ))}
                    </ul>
                    {report.moreNotes > 0 && <p className="muted">…and {report.moreNotes} more.</p>}
                </div>
            )}
        </div>
    );
}

function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div className={value === 0 ? 'stat stat--zero' : 'stat'}>
            <dd>{value}</dd>
            <dt>{label}</dt>
        </div>
    );
}
