import { Link } from 'react-router';
import type { AvatarIconChoice } from '@gamequeue/shared';
import { Avatar } from './Avatar';
import { Logo } from './Logo';
import { DevBadge } from './DevBadge';

/**
 * Whose page this is, shown in the header once the page's own heading has scrolled away
 * (`shown`), so a long profile never loses its owner.
 */
export interface HeaderIdentity {
    username: string;
    realName: string | null;
    avatarUpdatedAt: number | null;
    avatarIcon: AvatarIconChoice | null;
    shown: boolean;
}

/** Public pages are rendered for logged-out visitors too, so they bring their own header instead of the Shell. */
export function PublicHeader({ identity }: { identity?: HeaderIdentity }) {
    return (
        <header className="topbar">
            <span className="logo-row">
                <Link to="/">
                    <Logo />
                </Link>
                <DevBadge />
            </span>
            {identity && (
                <div
                    className={`topbar__identity${identity.shown ? ' topbar__identity--shown' : ''}`}
                    aria-hidden={!identity.shown}
                >
                    <Avatar
                        username={identity.username}
                        size={28}
                        avatarUpdatedAt={identity.avatarUpdatedAt}
                        avatarIcon={identity.avatarIcon}
                    />
                    <span className="topbar__identity-name">
                        {identity.realName ?? identity.username}
                    </span>
                </div>
            )}
        </header>
    );
}
