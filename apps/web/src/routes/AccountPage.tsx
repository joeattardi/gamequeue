import { useRef, useState, type ChangeEvent } from 'react';
import { ImageUp, Settings, Trash2 } from 'lucide-react';
import { useRemoveAvatar, useUploadAvatar } from '../api/avatar';
import { useMe } from '../api/auth';
import { ApiRequestError } from '../api/client';
import { prepareAvatar } from '../avatarImage';
import { Avatar } from '../components/Avatar';
import { useConfirm } from '../components/Confirm';
import { usePageTitle } from '../lib';

export function AccountPage() {
    usePageTitle('Account');
    const confirm = useConfirm();
    const me = useMe().data;
    const upload = useUploadAvatar();
    const remove = useRemoveAvatar();
    const input = useRef<HTMLInputElement>(null);
    const [error, setError] = useState<string>();
    const [preparing, setPreparing] = useState(false);
    if (!me) return null;

    const busy = preparing || upload.isPending || remove.isPending;

    async function choose(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setError(undefined);
        setPreparing(true);
        try {
            upload.mutate(await prepareAvatar(file), {
                onError: (err) =>
                    setError(err instanceof ApiRequestError ? err.message : 'Upload failed.')
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong.');
        } finally {
            setPreparing(false);
        }
    }

    async function clear() {
        const ok = await confirm({
            title: 'Remove your picture?',
            message: 'Your generated avatar will be shown instead.',
            confirmLabel: 'Remove',
            tone: 'danger'
        });
        if (!ok) return;
        setError(undefined);
        remove.mutate(undefined, { onError: () => setError('Could not remove the picture.') });
    }

    return (
        <section>
            <div className="page-head">
                <div>
                    <h1>
                        <Settings aria-hidden="true" />
                        Account
                    </h1>
                    <p className="muted">Signed in as {me.username}.</p>
                </div>
            </div>

            <div className="stack">
                <section aria-labelledby="avatar-h" className="panel">
                    <h2 id="avatar-h">Profile picture</h2>
                    <div className="avatar-edit">
                        <Avatar
                            username={me.username}
                            size={96}
                            avatarUpdatedAt={me.avatarUpdatedAt}
                        />
                        <div className="avatar-edit__body">
                            <p>
                                {me.avatarUpdatedAt === null
                                    ? 'You are using the avatar generated from your username.'
                                    : 'Your picture is shown on your profile.'}{' '}
                                It's public, like the rest of your profile. Images are cropped to a
                                square and shrunk in your browser before upload.
                            </p>
                            <div className="avatar-edit__actions">
                                <input
                                    ref={input}
                                    type="file"
                                    accept="image/*"
                                    hidden
                                    onChange={choose}
                                />
                                <button
                                    className="btn btn--primary"
                                    onClick={() => input.current?.click()}
                                    disabled={busy}
                                >
                                    <ImageUp aria-hidden="true" />
                                    {busy ? 'Saving…' : 'Upload a picture'}
                                </button>
                                {me.avatarUpdatedAt !== null && (
                                    <button
                                        className="btn btn--danger"
                                        onClick={clear}
                                        disabled={busy}
                                    >
                                        <Trash2 aria-hidden="true" />
                                        Remove
                                    </button>
                                )}
                            </div>
                            {error && <p role="alert">{error}</p>}
                        </div>
                    </div>
                </section>
            </div>
        </section>
    );
}
