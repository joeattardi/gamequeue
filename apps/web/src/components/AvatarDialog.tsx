import { useRef, useState, type ChangeEvent } from 'react';
import { AVATAR_COLORS, AVATAR_COLOR_NAMES, AVATAR_ICONS, type UserDto } from '@gamequeue/shared';
import { ImageUp, Trash2, X } from 'lucide-react';
import { Link } from 'react-router';
import { useRemoveAvatar, useSetAvatarIcon, useUploadAvatar } from '../api/avatar';
import { ApiRequestError } from '../api/client';
import { prepareAvatar } from '../avatarImage';
import { Avatar } from './Avatar';
import { useConfirm } from './Confirm';
import { useModalDialog } from './useModalDialog';

/** Everything about choosing a profile picture: the generated one, an uploaded image or a preset icon. */
export function AvatarDialog({
    me,
    open,
    onClose
}: {
    me: UserDto;
    open: boolean;
    onClose: () => void;
}) {
    const ref = useModalDialog(open);
    return (
        <dialog
            ref={ref}
            className="dialog"
            onClose={onClose}
            aria-labelledby="avatar-dialog-title"
            onClick={(e) => e.target === ref.current && onClose()}
        >
            {open && <Body me={me} onDone={onClose} />}
        </dialog>
    );
}

function Body({ me, onDone }: { me: UserDto; onDone: () => void }) {
    const confirm = useConfirm();
    const upload = useUploadAvatar();
    const remove = useRemoveAvatar();
    const setIcon = useSetAvatarIcon();
    const input = useRef<HTMLInputElement>(null);
    const [error, setError] = useState<string>();
    const [preparing, setPreparing] = useState(false);
    // The colour applies to the next icon pick too, so it is remembered even before one is chosen
    const [color, setColor] = useState<number | null>(null);

    const busy = preparing || upload.isPending || remove.isPending || setIcon.isPending;
    const activeColor = color ?? me.avatarIcon?.color ?? 0;

    function pickIcon(icon: string, nextColor: number) {
        setError(undefined);
        setIcon.mutate(
            { icon, color: nextColor },
            { onError: () => setError('Could not save the icon.') }
        );
    }

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
        <div className="dialog__body">
            <div className="dialog__head">
                <h2 id="avatar-dialog-title">Profile picture</h2>
                <button className="btn btn--ghost" onClick={onDone} aria-label="Close">
                    <X />
                </button>
            </div>
            <div className="avatar-edit">
                <Avatar
                    username={me.username}
                    size={96}
                    avatarUpdatedAt={me.avatarUpdatedAt}
                    avatarIcon={me.avatarIcon}
                />
                <div className="avatar-edit__body">
                    <p>
                        {avatarSummary(me)} It's public, like the rest of your profile. Uploaded
                        images are cropped to a square and shrunk in your browser.
                    </p>
                    <div className="avatar-edit__actions">
                        <input ref={input} type="file" accept="image/*" hidden onChange={choose} />
                        <button
                            className="btn btn--primary"
                            onClick={() => input.current?.click()}
                            disabled={busy}
                            data-autofocus
                        >
                            <ImageUp aria-hidden="true" />
                            {busy ? 'Saving…' : 'Upload a picture'}
                        </button>
                        {(me.avatarUpdatedAt !== null || me.avatarIcon !== null) && (
                            <button className="btn btn--danger" onClick={clear} disabled={busy}>
                                <Trash2 aria-hidden="true" />
                                Use generated avatar
                            </button>
                        )}
                    </div>
                    {error && <p role="alert">{error}</p>}
                </div>
            </div>
            <fieldset className="icon-picker">
                <legend>Or pick an icon</legend>
                <div className="icon-picker__colors" role="group" aria-label="Colour">
                    {AVATAR_COLORS.map((hex, i) => (
                        <button
                            key={hex}
                            type="button"
                            className="icon-picker__color"
                            style={{ backgroundColor: hex }}
                            aria-label={AVATAR_COLOR_NAMES[i]}
                            aria-pressed={activeColor === i}
                            disabled={busy}
                            onClick={() => {
                                setColor(i);
                                if (me.avatarIcon && me.avatarUpdatedAt === null)
                                    pickIcon(me.avatarIcon.icon, i);
                            }}
                        />
                    ))}
                </div>
                <div className="icon-picker__grid">
                    {AVATAR_ICONS.map((icon) => (
                        <button
                            key={icon.key}
                            type="button"
                            className="icon-picker__icon"
                            aria-label={icon.label}
                            title={icon.label}
                            aria-pressed={me.avatarIcon?.icon === icon.key}
                            disabled={busy}
                            onClick={() => pickIcon(icon.key, activeColor)}
                        >
                            <Avatar
                                username={me.username}
                                size={44}
                                avatarIcon={{ icon: icon.key, color: activeColor }}
                            />
                        </button>
                    ))}
                </div>
                <p className="muted">
                    Icons from <Link to="/credits">game-icons.net</Link>.
                </p>
            </fieldset>
        </div>
    );
}

export const avatarSummary = (me: UserDto) =>
    me.avatarUpdatedAt !== null
        ? 'Your picture is shown on your profile.'
        : me.avatarIcon !== null
          ? 'Your icon is shown on your profile.'
          : 'You are using the avatar generated from your username.';
