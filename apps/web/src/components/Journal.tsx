import {
    IMAGE_UPLOAD_TYPES,
    MAX_IMAGES_PER_POST,
    MAX_POST_BODY,
    MAX_UPLOAD_BYTES,
    VISIBILITIES,
    type PlaythroughDto,
    type PostDto,
    type Visibility
} from '@gamequeue/shared';
import { Camera, Clock, Copy, ExternalLink, Eye, EyeOff, NotebookPen, Pencil } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ApiRequestError } from '../api/client';
import { usePostMutations, usePosts, useSetVisibility } from '../api/journal';
import { formatBytes, formatMinutes, hoursToMinutes, minutesToHours } from '../lib';
import { useConfirm } from './Confirm';
import { Lightbox } from './ImageLightbox';
import { JournalSkeletons } from './PageSkeletons';

const errorText = (e: unknown) =>
    e instanceof ApiRequestError ? e.message : 'Something went wrong.';

const VISIBILITY_LABELS: Record<Visibility, string> = {
    private: 'Private: only you',
    unlisted: 'Unlisted: anyone with the link',
    public: 'Public: anyone with the link, and on your profile'
};

const journalUrl = (slug: string) => `${window.location.origin}/p/${slug}`;
const ownImageUrl = (id: number) => `/api/posts/images/${id}`;

/** Checks a picked file before it is sent, so the common mistakes are caught without a round trip. */
function checkFile(file: File): string | null {
    if (!(IMAGE_UPLOAD_TYPES as readonly string[]).includes(file.type))
        return `${file.name}: only JPEG, PNG and WebP images can be uploaded`;
    if (file.size > MAX_UPLOAD_BYTES)
        return `${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_UPLOAD_BYTES)}`;
    return null;
}

/** Who can read this playthrough's journal, and its link. */
function ShareControl({ p }: { p: PlaythroughDto }) {
    const set = useSetVisibility(p.id);
    const [error, setError] = useState<string>();
    const [copied, setCopied] = useState(false);
    const url = p.shareSlug ? journalUrl(p.shareSlug) : null;
    return (
        <div className="stack journal__share">
            <label className="field">
                <span>Who can read this journal</span>
                <select
                    value={p.visibility}
                    disabled={set.isPending}
                    onChange={(e) => {
                        setError(undefined);
                        set.mutate(e.target.value as Visibility, {
                            onError: (err) => setError(errorText(err))
                        });
                    }}
                >
                    {VISIBILITIES.map((v) => (
                        <option key={v} value={v}>
                            {VISIBILITY_LABELS[v]}
                        </option>
                    ))}
                </select>
            </label>
            {url && (
                <div className="row journal__link">
                    <input
                        readOnly
                        value={url}
                        aria-label="Journal link"
                        onFocus={(e) => e.target.select()}
                    />
                    <button
                        className="btn"
                        type="button"
                        onClick={async () => {
                            try {
                                await navigator.clipboard.writeText(url);
                                setCopied(true);
                                setTimeout(() => setCopied(false), 2000);
                            } catch {
                                setError('Copy failed; select the link and copy it.');
                            }
                        }}
                    >
                        <Copy aria-hidden="true" /> {copied ? 'Copied' : 'Copy link'}
                    </button>
                    <a className="btn" href={url} target="_blank" rel="noreferrer">
                        <ExternalLink aria-hidden="true" /> Open
                    </a>
                </div>
            )}
            {p.visibility === 'private' && (
                <p className="muted">
                    Going back to private switches the link off. Sharing again makes a new one.
                </p>
            )}
            <p className="form-error" role="alert">
                {error}
            </p>
        </div>
    );
}

type Kind = 'note' | 'hours' | 'screenshot';

/** The "add to the journal" form: a note, hours played, or screenshots. */
export function AddPost({ playthroughId }: { playthroughId: number }) {
    const m = usePostMutations(playthroughId);
    const [kind, setKind] = useState<Kind>('note');
    const [body, setBody] = useState('');
    const [hours, setHours] = useState('');
    const [spoiler, setSpoiler] = useState(false);
    const [files, setFiles] = useState<File[]>([]);
    const [fileInput, setFileInput] = useState(0);
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);

    function reset() {
        setBody('');
        setHours('');
        setSpoiler(false);
        setFiles([]);
        setFileInput((n) => n + 1);
    }

    async function submit(e: FormEvent) {
        e.preventDefault();
        setError(undefined);
        try {
            if (kind === 'note') {
                await m.create.mutateAsync({ kind, body, spoiler });
            } else if (kind === 'hours') {
                const minutes = hoursToMinutes(hours);
                if (minutes === null) return setError('Enter the hours you played.');
                await m.create.mutateAsync({ kind, minutes, body, spoiler });
            } else {
                if (files.length === 0) return setError('Choose at least one picture.');
                const bad = files.map(checkFile).find(Boolean);
                if (bad) return setError(bad);
                setBusy(true);
                const post = await m.create.mutateAsync({ kind, body, spoiler });
                let sent = 0;
                for (const file of files) {
                    try {
                        await m.upload.mutateAsync({ postId: post.id, file });
                        sent++;
                    } catch (err) {
                        setError(`${file.name}: ${errorText(err)}`);
                        break;
                    }
                }
                // A post with no picture would just be clutter: take it back
                if (sent === 0) {
                    await m.remove.mutateAsync(post.id);
                    return;
                }
                if (sent < files.length) return;
            }
            reset();
        } catch (err) {
            setError(errorText(err));
        } finally {
            setBusy(false);
        }
    }

    return (
        <form className="stack subpanel journal__add" onSubmit={submit}>
            <div className="seg" role="group" aria-label="What to add">
                {(
                    [
                        ['note', 'Note', NotebookPen],
                        ['hours', 'Hours', Clock],
                        ['screenshot', 'Screenshots', Camera]
                    ] as const
                ).map(([k, label, Icon]) => (
                    <button
                        key={k}
                        type="button"
                        className={`btn${kind === k ? ' btn--primary' : ''}`}
                        aria-pressed={kind === k}
                        onClick={() => {
                            setKind(k);
                            setError(undefined);
                        }}
                    >
                        <Icon aria-hidden="true" /> {label}
                    </button>
                ))}
            </div>
            {kind === 'hours' && (
                <label className="field">
                    <span>Hours played this time</span>
                    <input
                        type="number"
                        inputMode="decimal"
                        min="0.1"
                        step="any"
                        value={hours}
                        onChange={(e) => setHours(e.target.value)}
                        required
                    />
                </label>
            )}
            {kind === 'screenshot' && (
                <label className="field">
                    <span>
                        Pictures (JPEG, PNG or WebP, up to {MAX_IMAGES_PER_POST}, 8 MB each)
                    </span>
                    <input
                        key={fileInput}
                        type="file"
                        accept={IMAGE_UPLOAD_TYPES.join(',')}
                        multiple
                        onChange={(e) =>
                            setFiles([...(e.target.files ?? [])].slice(0, MAX_IMAGES_PER_POST))
                        }
                    />
                </label>
            )}
            <label className="field">
                <span>
                    {kind === 'note'
                        ? 'Note'
                        : kind === 'hours'
                          ? 'Remark (optional)'
                          : 'Caption (optional)'}
                </span>
                <textarea
                    rows={kind === 'note' ? 4 : 2}
                    maxLength={MAX_POST_BODY}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    required={kind === 'note'}
                    data-autofocus
                />
            </label>
            <div className="row">
                <label className="check">
                    <input
                        type="checkbox"
                        checked={spoiler}
                        onChange={(e) => setSpoiler(e.target.checked)}
                    />
                    Contains spoilers (hidden from visitors until they click)
                </label>
                <button
                    className="btn btn--primary"
                    type="submit"
                    disabled={busy || m.create.isPending}
                >
                    {busy ? 'Uploading…' : 'Add to journal'}
                </button>
            </div>
            <p className="form-error" role="alert">
                {error}
            </p>
        </form>
    );
}

function PostItem({ post, playthroughId }: { post: PostDto; playthroughId: number }) {
    const m = usePostMutations(playthroughId);
    const confirm = useConfirm();
    const [editing, setEditing] = useState(false);
    const [body, setBody] = useState(post.body);
    const [hours, setHours] = useState(minutesToHours(post.minutes));
    const [spoiler, setSpoiler] = useState(post.spoiler);
    const [lightbox, setLightbox] = useState<number | null>(null);
    const [error, setError] = useState<string>();
    const [adding, setAdding] = useState(false);
    const when = new Date(post.createdAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
    });

    async function save(e: FormEvent) {
        e.preventDefault();
        setError(undefined);
        const minutes = post.kind === 'hours' ? hoursToMinutes(hours) : undefined;
        if (post.kind === 'hours' && minutes === null) return setError('Enter the hours played.');
        try {
            await m.patch.mutateAsync({
                id: post.id,
                body,
                spoiler,
                ...(minutes ? { minutes } : {})
            });
            setEditing(false);
        } catch (err) {
            setError(errorText(err));
        }
    }

    async function addPictures(files: File[]) {
        setError(undefined);
        const room = MAX_IMAGES_PER_POST - post.images.length;
        const bad = files.map(checkFile).find(Boolean);
        if (bad) return setError(bad);
        setAdding(true);
        try {
            for (const file of files.slice(0, room))
                await m.upload.mutateAsync({ postId: post.id, file });
        } catch (err) {
            setError(errorText(err));
        } finally {
            setAdding(false);
        }
    }

    return (
        <li className="journal__post">
            <div className="journal__meta">
                <span className="badge">
                    {post.kind === 'note'
                        ? 'Note'
                        : post.kind === 'hours'
                          ? 'Hours'
                          : 'Screenshots'}
                </span>
                {post.spoiler && (
                    <span className="badge">
                        <EyeOff aria-hidden="true" /> Spoiler
                    </span>
                )}
                <time className="muted" dateTime={new Date(post.createdAt).toISOString()}>
                    {when}
                </time>
            </div>
            {editing ? (
                <form className="stack" onSubmit={save}>
                    {post.kind === 'hours' && (
                        <label className="field">
                            <span>Hours</span>
                            <input
                                type="number"
                                inputMode="decimal"
                                min="0.1"
                                step="any"
                                value={hours}
                                onChange={(e) => setHours(e.target.value)}
                                required
                            />
                        </label>
                    )}
                    <label className="field">
                        <span>{post.kind === 'note' ? 'Note' : 'Text'}</span>
                        <textarea
                            rows={3}
                            maxLength={MAX_POST_BODY}
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            required={post.kind === 'note'}
                            data-autofocus
                            autoFocus
                        />
                    </label>
                    <label className="check">
                        <input
                            type="checkbox"
                            checked={spoiler}
                            onChange={(e) => setSpoiler(e.target.checked)}
                        />
                        Contains spoilers
                    </label>
                    {post.kind === 'screenshot' && post.images.length < MAX_IMAGES_PER_POST && (
                        <label className="field">
                            <span>Add pictures</span>
                            <input
                                type="file"
                                accept={IMAGE_UPLOAD_TYPES.join(',')}
                                multiple
                                disabled={adding}
                                onChange={(e) => {
                                    void addPictures([...(e.target.files ?? [])]);
                                    e.target.value = '';
                                }}
                            />
                        </label>
                    )}
                    <div className="row">
                        <button
                            className="btn btn--primary"
                            type="submit"
                            disabled={m.patch.isPending}
                        >
                            Save
                        </button>
                        <button
                            className="btn btn--ghost"
                            type="button"
                            onClick={() => setEditing(false)}
                        >
                            Done
                        </button>
                    </div>
                </form>
            ) : (
                <>
                    {post.kind === 'hours' && post.minutes !== null && (
                        <p className="journal__hours">
                            <Clock aria-hidden="true" /> {formatMinutes(post.minutes)} played
                        </p>
                    )}
                    {post.body && <p className="journal__body">{post.body}</p>}
                </>
            )}
            {post.images.length > 0 && (
                <ul className="journal__images" aria-label="Screenshots">
                    {post.images.map((img, i) => (
                        <li key={img.id}>
                            <button
                                type="button"
                                className="journal__thumb"
                                onClick={() => setLightbox(i)}
                                aria-label={`View picture ${i + 1} of ${post.images.length}`}
                            >
                                <img
                                    src={ownImageUrl(img.id)}
                                    width={img.width}
                                    height={img.height}
                                    alt=""
                                    loading="lazy"
                                />
                            </button>
                            {editing && (
                                <button
                                    type="button"
                                    className="btn btn--ghost btn--danger"
                                    onClick={async () =>
                                        (await confirm({
                                            title: 'Remove this picture?',
                                            confirmLabel: 'Remove picture',
                                            tone: 'danger'
                                        })) && m.removeImage.mutate(img.id)
                                    }
                                >
                                    Remove
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            <Lightbox
                urls={post.images.map((img) => ownImageUrl(img.id))}
                label="Journal pictures"
                alt={(i) => `Picture ${i + 1} of ${post.images.length}`}
                index={lightbox}
                onIndex={setLightbox}
                onClose={() => setLightbox(null)}
            />
            {!editing && (
                <div className="row">
                    <button className="btn btn--ghost" onClick={() => setEditing(true)}>
                        <Pencil aria-hidden="true" /> Edit
                    </button>
                    <button
                        className="btn btn--ghost btn--danger"
                        disabled={m.remove.isPending}
                        onClick={async () =>
                            (await confirm({
                                title: 'Delete this post?',
                                message:
                                    post.images.length > 0
                                        ? 'Its pictures are deleted too.'
                                        : undefined,
                                confirmLabel: 'Delete post',
                                tone: 'danger'
                            })) && m.remove.mutate(post.id)
                        }
                    >
                        Delete
                    </button>
                </div>
            )}
            <p className="form-error" role="alert">
                {error}
            </p>
        </li>
    );
}

/** The journal of one playthrough: who can read it, a form to add to it, and its posts in time order. */
export function Journal({ p }: { p: PlaythroughDto }) {
    const posts = usePosts(p.id);
    return (
        <div className="stack journal">
            <ShareControl p={p} />
            <p className="muted">
                {p.visibility === 'private' ? (
                    <EyeOff aria-hidden="true" />
                ) : (
                    <Eye aria-hidden="true" />
                )}{' '}
                {p.loggedMinutes > 0
                    ? `${formatMinutes(p.loggedMinutes)} logged in this journal.`
                    : 'No hours logged yet.'}
            </p>
            <AddPost playthroughId={p.id} />
            {posts.isPending ? (
                <JournalSkeletons />
            ) : posts.isError ? (
                <p role="alert">Couldn't load the journal.</p>
            ) : posts.data.length === 0 ? (
                <p className="muted">Nothing here yet. Add a note, your hours or a screenshot.</p>
            ) : (
                <ul className="journal__posts">
                    {posts.data.map((post) => (
                        <PostItem key={post.id} post={post} playthroughId={p.id} />
                    ))}
                </ul>
            )}
        </div>
    );
}
