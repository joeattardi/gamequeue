import { Link } from 'react-router';
import { Avatar } from './Avatar';
import { Logo } from './Logo';

/**
 * Whose page this is, shown in the header once the page's own heading has scrolled away
 * (`shown`), so a long profile never loses its owner.
 */
export interface HeaderIdentity {
    username: string;
    realName: string | null;
    avatarUpdatedAt: number | null;
    shown: boolean;
}

/** Public pages are rendered for logged-out visitors too, so they bring their own header instead of the Shell. */
export function PublicHeader({ identity }: { identity?: HeaderIdentity }) {
    return (
        <header className="topbar">
            <Link to="/">
                <Logo />
            </Link>
            {identity && (
                <div
                    className={`topbar__identity${identity.shown ? ' topbar__identity--shown' : ''}`}
                    aria-hidden={!identity.shown}
                >
                    <Avatar
                        username={identity.username}
                        size={28}
                        avatarUpdatedAt={identity.avatarUpdatedAt}
                    />
                    <span className="topbar__identity-name">
                        {identity.realName ?? identity.username}
                    </span>
                </div>
            )}
        </header>
    );
}
