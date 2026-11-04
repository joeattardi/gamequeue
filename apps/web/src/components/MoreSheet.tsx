import type { UserDto } from '@gamequeue/shared';
import {
    Bookmark,
    Bot,
    Compass,
    Database,
    Dices,
    Gift,
    Inbox,
    LogOut,
    Monitor,
    Moon,
    Settings,
    ShieldCheck,
    SkipForward,
    Sun,
    UserRound,
    X
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { THEMES, useTheme } from '../theme';
import { useModalDialog } from './useModalDialog';

const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon };
const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };

function Row({
    to,
    icon,
    children,
    count
}: {
    to: string;
    icon: ReactNode;
    children: ReactNode;
    count?: number;
}) {
    return (
        <Link to={to} className="more__row">
            {icon}
            <span>{children}</span>
            {count ? <span className="more__count">{count.toLocaleString()}</span> : null}
        </Link>
    );
}

/** The tab bar's "More": everything the four tabs don't reach, as a bottom sheet. */
export function MoreSheet({
    open,
    onClose,
    user,
    queueCount,
    aiAvailable,
    onSignOut,
    signingOut
}: {
    open: boolean;
    onClose: () => void;
    user: UserDto;
    queueCount?: number;
    aiAvailable: boolean;
    onSignOut: () => void;
    signingOut: boolean;
}) {
    const ref = useModalDialog(open);
    const [theme, setTheme] = useTheme();
    const ThemeIcon = THEME_ICONS[theme];
    return (
        <dialog
            ref={ref}
            className="sheet sheet--more"
            aria-labelledby="more-title"
            onClose={onClose}
            onClick={(e) => e.target === ref.current && onClose()}
        >
            <div className="sheet__body">
                <div className="sheet__grabber" aria-hidden="true" />
                <div className="more__head">
                    <h2 id="more-title">More</h2>
                    <button
                        type="button"
                        className="btn btn--ghost"
                        aria-label="Close"
                        onClick={onClose}
                    >
                        <X aria-hidden="true" />
                    </button>
                </div>
                <h3 className="sheet__label">Play</h3>
                <Row to="/queue" icon={<SkipForward aria-hidden="true" />} count={queueCount}>
                    Queue
                </Row>
                <h3 className="sheet__label">Library</h3>
                <Row to="/lists" icon={<Bookmark aria-hidden="true" />}>
                    Lists
                </Row>
                {/* Temporary: Backlog and Wishlist become tabs on the Collection in the Collection phase */}
                <Row to="/backlog" icon={<Inbox aria-hidden="true" />}>
                    Backlog
                </Row>
                <Row to="/wishlist" icon={<Gift aria-hidden="true" />}>
                    Wishlist
                </Row>
                <h3 className="sheet__label">Explore</h3>
                <Row to="/pick" icon={<Dices aria-hidden="true" />}>
                    Pick for me
                </Row>
                <Row to="/discover" icon={<Compass aria-hidden="true" />}>
                    Discover
                </Row>
                {aiAvailable && (
                    <Row to="/chat" icon={<Bot aria-hidden="true" />}>
                        Ask AI
                    </Row>
                )}
                <h3 className="sheet__label">{user.username}</h3>
                <Row to={`/u/${user.username}`} icon={<UserRound aria-hidden="true" />}>
                    Your profile
                </Row>
                <Row to="/account" icon={<Settings aria-hidden="true" />}>
                    Account
                </Row>
                <Row to="/data" icon={<Database aria-hidden="true" />}>
                    Data
                </Row>
                {user.role === 'admin' && (
                    <Row to="/admin" icon={<ShieldCheck aria-hidden="true" />}>
                        Admin
                    </Row>
                )}
                <button
                    type="button"
                    className="more__row"
                    onClick={() => setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!)}
                >
                    <ThemeIcon aria-hidden="true" />
                    <span>Theme: {THEME_LABELS[theme]}</span>
                </button>
                <button
                    type="button"
                    className="more__row"
                    onClick={onSignOut}
                    disabled={signingOut}
                >
                    <LogOut aria-hidden="true" />
                    <span>Sign out</span>
                </button>
                <p className="more__legal">
                    Game data from{' '}
                    <a href="https://www.igdb.com" target="_blank" rel="noreferrer">
                        IGDB.com
                    </a>
                    {' · '}
                    <Link to="/credits">Credits</Link>
                </p>
            </div>
        </dialog>
    );
}
