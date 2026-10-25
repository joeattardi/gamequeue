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
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { THEMES, useTheme } from '../theme';
import { Avatar } from './Avatar';

const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon };
const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };

/**
 * The signed-in user at the foot of the sidebar: a button that opens a small panel with the pages
 * that aren't part of everyday navigation (profile, account, data, admin) and sign out.
 */
export function UserMenu({
    user,
    onSignOut,
    signingOut
}: {
    user: UserDto;
    onSignOut: () => void;
    signingOut: boolean;
}) {
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
            className="user-menu"
            onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
            }}
        >
            {open && (
                <div id="user-menu-panel" className="user-menu__panel">
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
                        onClick={() =>
                            setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!)
                        }
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
            )}
            <button
                ref={button}
                type="button"
                className="user-menu__button"
                aria-expanded={open}
                aria-controls="user-menu-panel"
                aria-haspopup="true"
                onClick={() => setOpen((o) => !o)}
            >
                <Avatar
                    username={user.username}
                    size={28}
                    avatarUpdatedAt={user.avatarUpdatedAt}
                    avatarIcon={user.avatarIcon}
                />
                <span className="user-menu__name">{user.username}</span>
                <ChevronsUpDown aria-hidden="true" />
            </button>
        </div>
    );
}
