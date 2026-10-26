import type { UserDto } from '@gamequeue/shared';
import {
    ChevronsUpDown,
    Database,
    LogOut,
    Monitor,
    Moon,
    Settings,
    ShieldCheck,
    Sun,
    UserRound
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { THEMES, useTheme } from '../theme';
import { Avatar } from './Avatar';

const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon };
const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };

/**
 * The signed-in user: a button that opens a small panel with the pages that aren't part of everyday
 * navigation (profile, account, data, admin) and sign out. In the sidebar it shows the avatar and
 * name; as `tab` it is the last item of the phone tab bar, with the avatar over a short label, and
 * the panel pops up above the bar.
 */
export function UserMenu({
    user,
    onSignOut,
    signingOut,
    variant = 'sidebar'
}: {
    user: UserDto;
    onSignOut: () => void;
    signingOut: boolean;
    variant?: 'sidebar' | 'tab';
}) {
    const panelId = useId();
    const [open, setOpen] = useState(false);
    const [theme, setTheme] = useTheme();
    const ThemeIcon = THEME_ICONS[theme];
    const root = useRef<HTMLDivElement>(null);
    const button = useRef<HTMLButtonElement>(null);
    const { pathname } = useLocation();

    useEffect(() => setOpen(false), [pathname]);
    useEffect(() => {
        if (!open) return;
        const onPointer = (e: PointerEvent) => {
            if (!root.current?.contains(e.target as Node)) setOpen(false);
        };
        // Capture phase, so Escape closes only the menu and not the drawer around it
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            setOpen(false);
            button.current?.focus();
        };
        document.addEventListener('pointerdown', onPointer);
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('pointerdown', onPointer);
            document.removeEventListener('keydown', onKey, true);
        };
    }, [open]);

    return (
        <div
            ref={root}
            className={variant === 'tab' ? 'user-menu user-menu--tab' : 'user-menu'}
            onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
            }}
        >
            {/* Always mounted so it can animate out; inert keeps it out of the tab order while closed */}
            <div
                id={panelId}
                className="user-menu__panel"
                data-open={open || undefined}
                inert={!open}
            >
                <Link to={`/u/${user.username}`}>
                    <UserRound />
                    Your profile
                </Link>
                <NavLink to="/account">
                    <Settings />
                    Account
                </NavLink>
                <NavLink to="/data">
                    <Database />
                    Data
                </NavLink>
                {user.role === 'admin' && (
                    <NavLink to="/admin">
                        <ShieldCheck />
                        Admin
                    </NavLink>
                )}
                <button
                    type="button"
                    onClick={() => setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!)}
                >
                    <ThemeIcon />
                    Theme: {THEME_LABELS[theme]}
                </button>
                <hr />
                <button type="button" onClick={onSignOut} disabled={signingOut}>
                    <LogOut />
                    Sign out
                </button>
            </div>
            <button
                ref={button}
                type="button"
                className={variant === 'tab' ? 'tabbar__item' : 'user-menu__button'}
                aria-expanded={open}
                aria-controls={panelId}
                aria-haspopup="true"
                aria-label={variant === 'tab' ? `Account menu for ${user.username}` : undefined}
                onClick={() => setOpen((o) => !o)}
            >
                <Avatar
                    username={user.username}
                    size={variant === 'tab' ? 26 : 28}
                    avatarUpdatedAt={user.avatarUpdatedAt}
                    avatarIcon={user.avatarIcon}
                />
                {variant === 'tab' ? (
                    <span>You</span>
                ) : (
                    <>
                        <span className="user-menu__name">{user.username}</span>
                        <ChevronsUpDown aria-hidden="true" />
                    </>
                )}
            </button>
        </div>
    );
}
