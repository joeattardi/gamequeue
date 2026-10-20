import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
    SOCIAL_LABELS,
    SOCIAL_SERVICES,
    type SocialLinksInput,
    type UserDto
} from '@gamequeue/shared';
import { ImageUp, Settings, Trash2 } from 'lucide-react';
import { useUpdateAccount, useUpdateSocialLinks } from '../api/account';
import { useRemoveAvatar, useUploadAvatar } from '../api/avatar';
import { useMe } from '../api/auth';
import { ApiRequestError } from '../api/client';
import { prepareAvatar } from '../avatarImage';
import { Avatar } from '../components/Avatar';
import { useConfirm } from '../components/Confirm';
import { usePageTitle } from '../lib';

function NameForm({ me }: { me: UserDto }) {
    const update = useUpdateAccount();
    const [firstName, setFirstName] = useState(me.firstName ?? '');
    const [lastName, setLastName] = useState(me.lastName ?? '');
    const [showRealName, setShowRealName] = useState(me.showRealName);
    const [error, setError] = useState<string>();
    const [saved, setSaved] = useState(false);

    function submit(e: FormEvent) {
        e.preventDefault();
        setError(undefined);
        setSaved(false);
        update.mutate(
            { firstName, lastName, showRealName },
            {
                onSuccess: ({ user }) => {
                    // Show the stored (trimmed) values
                    setFirstName(user.firstName ?? '');
                    setLastName(user.lastName ?? '');
                    setSaved(true);
                },
                onError: (err) =>
                    setError(err instanceof ApiRequestError ? err.message : 'Could not save.')
            }
        );
    }

    const hasName = firstName.trim() !== '' || lastName.trim() !== '';
    return (
        <form onSubmit={submit} className="name-form">
            <p>
                Optional. Your first name is used to greet you around the app. Nobody else sees your
                name unless you tick the box below.
            </p>
            <div className="name-form__fields">
                <label className="field">
                    First name
                    <input
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        maxLength={50}
                        autoComplete="given-name"
                    />
                </label>
                <label className="field">
                    Last name
                    <input
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        maxLength={50}
                        autoComplete="family-name"
                    />
                </label>
            </div>
            <label className="check">
                <input
                    type="checkbox"
                    checked={showRealName}
                    onChange={(e) => setShowRealName(e.target.checked)}
                />
                Show my name on my public profile
            </label>
            {showRealName && !hasName && (
                <p className="muted">Nothing will be shown until you enter a name.</p>
            )}
            <div>
                <button className="btn btn--primary" disabled={update.isPending}>
                    {update.isPending ? 'Saving…' : 'Save'}
                </button>
            </div>
            <p role="status" className="muted">
                {saved ? 'Saved.' : ''}
            </p>
            {error && <p role="alert">{error}</p>}
        </form>
    );
}

function SocialForm({ me }: { me: UserDto }) {
    const update = useUpdateSocialLinks();
    const [values, setValues] = useState<Record<string, string>>(() =>
        Object.fromEntries(SOCIAL_SERVICES.map((s) => [s, me.socialLinks[s] ?? '']))
    );
    const [problems, setProblems] = useState<Record<string, string>>({});
    const [error, setError] = useState<string>();
    const [saved, setSaved] = useState(false);

    function submit(e: FormEvent) {
        e.preventDefault();
        setError(undefined);
        setProblems({});
        setSaved(false);
        update.mutate(values as SocialLinksInput, {
            onSuccess: ({ user }) => {
                setValues(
                    Object.fromEntries(SOCIAL_SERVICES.map((s) => [s, user.socialLinks[s] ?? '']))
                );
                setSaved(true);
            },
            onError: (err) => {
                if (err instanceof ApiRequestError && Array.isArray(err.details)) {
                    setProblems(
                        Object.fromEntries(
                            (err.details as { path: string; message: string }[]).map((d) => [
                                d.path,
                                d.message
                            ])
                        )
                    );
                } else setError(err instanceof ApiRequestError ? err.message : 'Could not save.');
            }
        });
    }

    return (
        <form onSubmit={submit} className="name-form">
            <p>
                Optional. Anything you fill in is shown, with a link where one exists, on your
                public profile.
            </p>
            <div className="name-form__fields">
                {SOCIAL_SERVICES.map((s) => (
                    <label className="field" key={s}>
                        {SOCIAL_LABELS[s].name}
                        <input
                            value={values[s]}
                            onChange={(e) => setValues({ ...values, [s]: e.target.value })}
                            maxLength={40}
                            autoComplete="off"
                            spellCheck={false}
                            aria-invalid={problems[s] ? true : undefined}
                            aria-describedby={`social-${s}`}
                        />
                        <small id={`social-${s}`}>{problems[s] ?? SOCIAL_LABELS[s].hint}</small>
                    </label>
                ))}
            </div>
            <div>
                <button className="btn btn--primary" disabled={update.isPending}>
                    {update.isPending ? 'Saving…' : 'Save'}
                </button>
            </div>
            <p role="status" className="muted">
                {saved ? 'Saved.' : ''}
            </p>
            {error && <p role="alert">{error}</p>}
        </form>
    );
}

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
                <section aria-labelledby="name-h" className="panel">
                    <h2 id="name-h">Your name</h2>
                    <NameForm me={me} />
                </section>

                <section aria-labelledby="social-h" className="panel">
                    <h2 id="social-h">Gaming accounts</h2>
                    <SocialForm me={me} />
                </section>

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
