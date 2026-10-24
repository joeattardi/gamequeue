import { useRef, useState, type ChangeEvent } from 'react';
import {
    AVATAR_COLORS,
    AVATAR_COLOR_NAMES,
    AVATAR_ICONS,
    type AvatarUploadInput,
    type UserDto
} from '@gamequeue/shared';
import { ImageUp, RotateCcw, X } from 'lucide-react';
import { Link } from 'react-router';
import { useRemoveAvatar, useSetAvatarIcon, useUploadAvatar } from '../api/avatar';
import { ApiRequestError } from '../api/client';
import { prepareAvatar } from '../avatarImage';
import { Avatar } from './Avatar';
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

type Draft =
    | { type: 'current' }
    | { type: 'generated' }
    | { type: 'icon'; icon: string; color: number }
    | { type: 'upload'; image: AvatarUploadInput };

/** Choices are held here until Save, so the dialog can be cancelled without touching the profile. */
function Body({ me, onDone }: { me: UserDto; onDone: () => void }) {
    const upload = useUploadAvatar();
    const remove = useRemoveAvatar();
    const setIcon = useSetAvatarIcon();
    const input = useRef<HTMLInputElement>(null);
    const [error, setError] = useState<string>();
    const [preparing, setPreparing] = useState(false);
    const [draft, setDraft] = useState<Draft>({ type: 'current' });
    // The colour applies to the next icon pick too, so it is remembered even before one is chosen
    const [color, setColor] = useState(me.avatarIcon?.color ?? 0);

    const saving = upload.isPending || remove.isPending || setIcon.isPending;
    const busy = preparing || saving;
    const currentIcon = me.avatarUpdatedAt === null ? me.avatarIcon : null;
    const iconKey =
        draft.type === 'icon'
            ? draft.icon
            : draft.type === 'current'
              ? (currentIcon?.icon ?? null)
              : null;
    const hasCustom = me.avatarUpdatedAt !== null || me.avatarIcon !== null;

    async function choose(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setError(undefined);
        setPreparing(true);
        try {
            setDraft({ type: 'upload', image: await prepareAvatar(file) });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong.');
        } finally {
            setPreparing(false);
        }
    }

    function save() {
        setError(undefined);
        const options = {
            onSuccess: onDone,
            onError: (err: Error) =>
                setError(err instanceof ApiRequestError ? err.message : 'Could not save.')
        };
        if (draft.type === 'icon')
            setIcon.mutate({ icon: draft.icon, color: draft.color }, options);
        else if (draft.type === 'upload') upload.mutate(draft.image, options);
        else if (draft.type === 'generated') remove.mutate(undefined, options);
        else onDone();
    }

    const preview =
        draft.type === 'upload' ? (
            <img
                className="avatar avatar--image"
                src={`data:${draft.image.contentType};base64,${draft.image.data}`}
                width={96}
                height={96}
                alt=""
            />
        ) : (
            <Avatar
                username={me.username}
                size={96}
                avatarUpdatedAt={draft.type === 'current' ? me.avatarUpdatedAt : null}
                avatarIcon={
                    draft.type === 'icon'
                        ? { icon: draft.icon, color: draft.color }
                        : draft.type === 'current'
                          ? me.avatarIcon
                          : null
                }
            />
        );

    return (
        <div className="dialog__body">
            <div className="dialog__head">
                <h2 id="avatar-dialog-title">Profile picture</h2>
                <button className="btn btn--ghost" onClick={onDone} aria-label="Close">
                    <X />
                </button>
            </div>
            <div className="avatar-edit">
                {preview}
                <div className="avatar-edit__body">
                    <p>
                        {draft.type === 'current'
                            ? avatarSummary(me)
                            : 'This is how your picture will look once saved.'}{' '}
                        It's public, like the rest of your profile. Uploaded images are cropped to a
                        square and shrunk in your browser.
                    </p>
                    <div className="avatar-edit__actions">
                        <input ref={input} type="file" accept="image/*" hidden onChange={choose} />
                        <button
                            className="btn"
                            onClick={() => input.current?.click()}
                            disabled={busy}
                            data-autofocus
                        >
                            <ImageUp aria-hidden="true" />
                            {preparing ? 'Preparing…' : 'Upload a picture'}
                        </button>
                        {(hasCustom || draft.type !== 'current') && draft.type !== 'generated' && (
                            <button
                                className="btn"
                                onClick={() =>
                                    setDraft(
                                        hasCustom ? { type: 'generated' } : { type: 'current' }
                                    )
                                }
                                disabled={busy}
                            >
                                <RotateCcw aria-hidden="true" />
                                {hasCustom ? 'Use generated avatar' : 'Discard'}
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
                            aria-pressed={color === i}
                            disabled={busy}
                            onClick={() => {
                                setColor(i);
                                if (iconKey) setDraft({ type: 'icon', icon: iconKey, color: i });
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
                            aria-pressed={iconKey === icon.key}
                            disabled={busy}
                            onClick={() => setDraft({ type: 'icon', icon: icon.key, color })}
                        >
                            <Avatar
                                username={me.username}
                                size={44}
                                avatarIcon={{ icon: icon.key, color }}
                            />
                        </button>
                    ))}
                </div>
                <p className="muted">
                    Icons from <Link to="/credits">game-icons.net</Link>.
                </p>
            </fieldset>
            <div className="dialog__actions">
                <button className="btn" onClick={onDone} disabled={saving}>
                    Cancel
                </button>
                <button
                    className="btn btn--primary"
                    onClick={save}
                    disabled={busy || draft.type === 'current'}
                >
                    {saving ? 'Saving…' : 'Save'}
                </button>
            </div>
        </div>
    );
}

export const avatarSummary = (me: UserDto) =>
    me.avatarUpdatedAt !== null
        ? 'Your picture is shown on your profile.'
        : me.avatarIcon !== null
          ? 'Your icon is shown on your profile.'
          : 'You are using the avatar generated from your username.';
