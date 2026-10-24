import type { EntryDto, NoteDto } from '@gamequeue/shared';
import { MAX_NOTE_LENGTH } from '@gamequeue/shared';
import { Globe, Lock, Pencil, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ApiRequestError } from '../api/client';
import { useNoteMutations } from '../api/collection';
import { useConfirm } from './Confirm';

const when = (ms: number) => new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' });

/** The owner's notes on a game: add, edit, delete, and choose which ones the profile shows. */
export function NotesPanel({ entry }: { entry: EntryDto }) {
    const m = useNoteMutations(entry.id);
    const [draft, setDraft] = useState('');
    const [isPublic, setIsPublic] = useState(false);
    const [error, setError] = useState<string>();
    const onError = (e: unknown) =>
        setError(e instanceof ApiRequestError ? e.message : "Couldn't save.");

    function add(e: FormEvent) {
        e.preventDefault();
        if (!draft.trim()) return;
        setError(undefined);
        m.add.mutate(
            { body: draft, public: isPublic },
            {
                onSuccess: () => setDraft(''),
                onError
            }
        );
    }

    return (
        <section aria-labelledby="notes-h" className="panel stack">
            <h2 id="notes-h">Notes</h2>
            <form className="stack" onSubmit={add}>
                <label className="field">
                    <span>Add a note</span>
                    <textarea
                        rows={3}
                        maxLength={MAX_NOTE_LENGTH}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                    />
                </label>
                <div className="note-form__actions">
                    <label className="check">
                        <input
                            type="checkbox"
                            checked={isPublic}
                            onChange={(e) => setIsPublic(e.target.checked)}
                        />
                        Show on my public profile
                    </label>
                    <button
                        type="submit"
                        className="btn btn--primary"
                        disabled={m.add.isPending || !draft.trim()}
                    >
                        Add note
                    </button>
                </div>
            </form>
            <p className="form-error" role="alert">
                {error}
            </p>
            {entry.notes.length === 0 ? (
                <p className="muted">No notes yet. Notes are private unless you share them.</p>
            ) : (
                <ul className="notes">
                    {entry.notes.map((n) => (
                        <NoteItem key={n.id} note={n} entryId={entry.id} onError={onError} />
                    ))}
                </ul>
            )}
        </section>
    );
}

function NoteItem({
    note,
    entryId,
    onError
}: {
    note: NoteDto;
    entryId: number;
    onError: (e: unknown) => void;
}) {
    const m = useNoteMutations(entryId);
    const confirm = useConfirm();
    const [editing, setEditing] = useState(false);
    const [body, setBody] = useState(note.body);

    function save(e: FormEvent) {
        e.preventDefault();
        if (!body.trim()) return;
        if (body.trim() === note.body) return setEditing(false);
        m.patch.mutate({ id: note.id, body }, { onSuccess: () => setEditing(false), onError });
    }

    async function remove() {
        if (
            await confirm({
                title: 'Delete this note?',
                message: "This can't be undone.",
                confirmLabel: 'Delete',
                tone: 'danger'
            })
        )
            m.remove.mutate(note.id, { onError });
    }

    return (
        <li className="note">
            <div className="note__meta">
                <span className="muted">{when(note.createdAt)}</span>
                <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    aria-pressed={note.public}
                    title={
                        note.public
                            ? 'Shown on your public profile. Click to make it private'
                            : 'Only you can see this. Click to show it on your public profile'
                    }
                    disabled={m.patch.isPending}
                    onClick={() =>
                        m.patch.mutate({ id: note.id, public: !note.public }, { onError })
                    }
                >
                    {note.public ? <Globe aria-hidden="true" /> : <Lock aria-hidden="true" />}
                    {note.public ? 'Public' : 'Private'}
                </button>
                {!editing && (
                    <>
                        <button
                            type="button"
                            className="btn btn--ghost btn--small"
                            aria-label="Edit note"
                            title="Edit"
                            onClick={() => {
                                setBody(note.body);
                                setEditing(true);
                            }}
                        >
                            <Pencil aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            className="btn btn--ghost btn--small"
                            aria-label="Delete note"
                            title="Delete"
                            onClick={remove}
                        >
                            <Trash2 aria-hidden="true" />
                        </button>
                    </>
                )}
            </div>
            {editing ? (
                <form className="stack" onSubmit={save}>
                    <textarea
                        rows={4}
                        aria-label="Note"
                        maxLength={MAX_NOTE_LENGTH}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        data-autofocus
                        autoFocus
                    />
                    <div className="note-form__actions">
                        <button
                            type="submit"
                            className="btn btn--primary"
                            disabled={m.patch.isPending}
                        >
                            Save
                        </button>
                        <button type="button" className="btn" onClick={() => setEditing(false)}>
                            Cancel
                        </button>
                    </div>
                </form>
            ) : (
                <p className="note__body">{note.body}</p>
            )}
        </li>
    );
}

/** Public: the notes an owner chose to share, on their profile's game page. */
export function PublicNotes({
    username,
    notes
}: {
    username: string;
    notes: { id: number; body: string; createdAt: number }[];
}) {
    if (notes.length === 0) return null;
    return (
        <section aria-labelledby="pg-notes-h" className="panel stack">
            <h2 id="pg-notes-h">{username}'s notes</h2>
            <ul className="notes">
                {notes.map((n) => (
                    <li key={n.id} className="note">
                        <div className="note__meta">
                            <span className="muted">{when(n.createdAt)}</span>
                        </div>
                        <p className="note__body">{n.body}</p>
                    </li>
                ))}
            </ul>
        </section>
    );
}
