import type { UserDto } from '@gamequeue/shared';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useLogout } from '../api/auth';
import { useNavCounts } from '../api/counts';
import { useAiStatus } from '../api/ai';
import { useMediaQuery } from '../lib';
import { CommandPalette } from './CommandPalette';
import { ErrorBoundary } from './ErrorBoundary';
import { ErrorPage } from './ErrorPage';
import { Logo } from './Logo';
import { MoreSheet } from './MoreSheet';
import { DismissiblePreviewNotice } from './PreviewNotice';
import { SearchContext } from './SearchContext';
import { ShellProvider } from './ShellContext';
import { ToastProvider } from './Toast';
import { Tooltip } from './Tooltip';
import { UserMenu } from './UserMenu';
import {
    Bookmark,
    ChartColumn,
    Compass,
    Bot,
    Dices,
    Ellipsis,
    Gift,
    Inbox,
    Joystick,
    LibraryBig,
    PanelLeftClose,
    PanelLeftOpen,
    Search,
    SkipForward
} from 'lucide-react';

/** Below this the sidebar gives way to the top bar and the bottom tab bar. */
const NARROW = '(max-width: 899px)';
/** Phones get the full-screen search page; wider screens get the ⌘K palette. */
const PHONE = '(max-width: 767px)';

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

const COLLAPSED_KEY = 'gq.sidebar.collapsed';

/** The wide-screen sidebar can shrink to icons; the choice is remembered in this browser. */
function useCollapsed() {
    const [collapsed, setCollapsed] = useState(() => {
        try {
            return localStorage.getItem(COLLAPSED_KEY) === '1';
        } catch {
            return false;
        }
    });
    const toggle = () =>
        setCollapsed((c) => {
            try {
                localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1');
            } catch {
                // not remembered, still works for this visit
            }
            return !c;
        });
    return [collapsed, toggle] as const;
}

/** A nav link: icon, label and an optional count. Collapsed, the label becomes a tooltip. */
function NavItem({
    to,
    end,
    icon,
    label,
    count,
    unit = 'game',
    className,
    collapsed
}: {
    to: string;
    end?: boolean;
    icon: ReactNode;
    label: string;
    count?: number;
    /** What the count counts, singular */
    unit?: string;
    className?: string;
    collapsed: boolean;
}) {
    return (
        <Tooltip
            label={label}
            detail={
                count ? `${count.toLocaleString()} ${count === 1 ? unit : `${unit}s`}` : undefined
            }
            enabled={collapsed}
        >
            <NavLink to={to} end={end} className={className}>
                {icon}
                <span className="nav__text">{label}</span>
                {count ? (
                    <span className="nav__count">
                        <span aria-hidden="true">{count.toLocaleString()}</span>
                        <span className="sr-only"> {count === 1 ? unit : `${unit}s`}</span>
                    </span>
                ) : null}
            </NavLink>
        </Tooltip>
    );
}

export function Shell({ user }: { user: UserDto }) {
    const logout = useLogout();
    const narrow = useMediaQuery(NARROW);
    const phone = useMediaQuery(PHONE);
    const [collapsedPref, toggleCollapsed] = useCollapsed();
    const counts = useNavCounts();
    // Ask AI shows for accounts with AI switched on (also while this month's budget is spent, for the saved chats)
    const ai = useAiStatus();
    const aiAvailable = !!(ai.data?.available || ai.data?.reason === 'budget_spent');
    // Collapsing is a wide-screen thing; below 900px there is no sidebar
    const collapsed = collapsedPref && !narrow;
    const [palette, setPalette] = useState({ open: false, query: '' });
    const [more, setMore] = useState(false);
    const { pathname } = useLocation();
    const navigate = useNavigate();

    useEffect(() => setMore(false), [pathname]);

    // Phones search on their own page; everything wider opens the palette over the current page
    const openSearch = useCallback(
        (query = '') => {
            if (phone) navigate(query ? `/search?q=${encodeURIComponent(query)}` : '/search');
            else setPalette({ open: true, query });
        },
        [phone, navigate]
    );
    const controls = useMemo(() => ({ openSearch }), [openSearch]);

    // ⌘K / Ctrl+K from anywhere, and "/" unless the user is typing somewhere
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey) {
                e.preventDefault();
                openSearch();
                return;
            }
            if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
            const el = e.target as HTMLElement | null;
            if (el?.closest('input, textarea, select, [contenteditable], dialog[open]')) return;
            e.preventDefault();
            openSearch();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [openSearch]);

    const on = (...prefixes: string[]) =>
        prefixes.some((p) => (p === '/' ? pathname === '/' : pathname.startsWith(p)));
    const tab = (active: boolean) => (active ? 'tabbar__item active' : 'tabbar__item');
    const mod = isMac() ? '⌘' : 'Ctrl ';

    return (
        <ToastProvider>
            <SearchContext.Provider value={controls}>
                <ShellProvider value={true}>
                    <a className="skip-link" href="#main">
                        Skip to content
                    </a>
                    <div className={collapsed ? 'app-shell app-shell--collapsed' : 'app-shell'}>
                        <header className="mobile-bar">
                            <Link to="/" className="mobile-bar__logo">
                                <Logo />
                            </Link>
                            {narrow && !phone && (
                                <button
                                    type="button"
                                    className="btn btn--ghost mobile-bar__search"
                                    aria-label="Search or jump to…"
                                    onClick={() => openSearch()}
                                >
                                    <Search aria-hidden="true" />
                                </button>
                            )}
                        </header>
                        <aside
                            id="main-nav"
                            className={collapsed ? 'sidebar is-collapsed' : 'sidebar'}
                            inert={narrow}
                        >
                            <div className="sidebar__head">
                                <div className="sidebar__brand">
                                    <Link to="/" className="sidebar__logo">
                                        <Logo />
                                    </Link>
                                </div>
                            </div>
                            <Tooltip
                                label="Search or jump to…"
                                shortcut={`${mod}K`}
                                enabled={collapsed}
                            >
                                <button
                                    type="button"
                                    className="nav-search"
                                    aria-keyshortcuts="Control+K Meta+K /"
                                    onClick={() => openSearch()}
                                >
                                    <Search aria-hidden="true" />
                                    <span className="nav__text">Search or jump to…</span>
                                    <kbd aria-hidden="true">{mod}K</kbd>
                                </button>
                            </Tooltip>
                            <nav className="nav" aria-label="Main">
                                <div className="nav__group" role="group" aria-labelledby="nav-play">
                                    <h2 className="nav__label" id="nav-play">
                                        Play
                                    </h2>
                                    <NavItem
                                        to="/"
                                        end
                                        icon={<Joystick />}
                                        label="Now playing"
                                        collapsed={collapsed}
                                    />
                                    <NavItem
                                        to="/queue"
                                        icon={<SkipForward />}
                                        label="Queue"
                                        count={counts.queue}
                                        collapsed={collapsed}
                                    />
                                </div>
                                <div
                                    className="nav__group"
                                    role="group"
                                    aria-labelledby="nav-library"
                                >
                                    <h2 className="nav__label" id="nav-library">
                                        Library
                                    </h2>
                                    <NavItem
                                        to="/collection"
                                        icon={<LibraryBig />}
                                        label="Collection"
                                        count={counts.collection}
                                        collapsed={collapsed}
                                    />
                                    {/* Temporary: Backlog and Wishlist become tabs on the Collection in the Collection phase */}
                                    <NavItem
                                        to="/backlog"
                                        icon={<Inbox />}
                                        label="Backlog"
                                        count={counts.backlog}
                                        collapsed={collapsed}
                                    />
                                    <NavItem
                                        to="/wishlist"
                                        icon={<Gift />}
                                        label="Wishlist"
                                        count={counts.wishlist}
                                        collapsed={collapsed}
                                    />
                                    <NavItem
                                        to="/lists"
                                        icon={<Bookmark />}
                                        label="Lists"
                                        count={counts.lists}
                                        unit="list"
                                        collapsed={collapsed}
                                    />
                                </div>
                                <div
                                    className="nav__group"
                                    role="group"
                                    aria-labelledby="nav-explore"
                                >
                                    <h2 className="nav__label" id="nav-explore">
                                        Explore
                                    </h2>
                                    <NavItem
                                        to="/pick"
                                        icon={<Dices />}
                                        label="Pick for me"
                                        collapsed={collapsed}
                                    />
                                    <NavItem
                                        to="/discover"
                                        icon={<Compass />}
                                        label="Discover"
                                        collapsed={collapsed}
                                    />
                                    {aiAvailable && (
                                        <NavItem
                                            to="/chat"
                                            icon={<Bot />}
                                            label="Ask AI"
                                            collapsed={collapsed}
                                        />
                                    )}
                                </div>
                                <div
                                    className="nav__group"
                                    role="group"
                                    aria-labelledby="nav-insights"
                                >
                                    <h2 className="nav__label" id="nav-insights">
                                        Insights
                                    </h2>
                                    <NavItem
                                        to="/stats"
                                        icon={<ChartColumn />}
                                        label="Stats"
                                        collapsed={collapsed}
                                    />
                                </div>
                            </nav>
                            <Tooltip label="Expand sidebar" enabled={collapsed}>
                                <button
                                    type="button"
                                    className="sidebar__collapse"
                                    aria-expanded={!collapsed}
                                    aria-controls="main-nav"
                                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                                    onClick={toggleCollapsed}
                                >
                                    {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
                                    <span className="nav__text">Collapse</span>
                                </button>
                            </Tooltip>
                            <UserMenu
                                user={user}
                                onSignOut={() => logout.mutate()}
                                signingOut={logout.isPending}
                            />
                        </aside>
                        <nav className="tabbar" aria-label="Main">
                            <Link to="/" className={tab(on('/', '/queue'))}>
                                <Joystick aria-hidden="true" />
                                <span>Play</span>
                            </Link>
                            <Link
                                to="/collection"
                                className={tab(
                                    on('/collection', '/backlog', '/wishlist', '/lists', '/games')
                                )}
                            >
                                <LibraryBig aria-hidden="true" />
                                <span>Library</span>
                            </Link>
                            {phone ? (
                                <Link to="/search" className={tab(on('/search'))}>
                                    <Search aria-hidden="true" />
                                    <span>Search</span>
                                </Link>
                            ) : (
                                <button
                                    type="button"
                                    className="tabbar__item"
                                    onClick={() => openSearch()}
                                >
                                    <Search aria-hidden="true" />
                                    <span>Search</span>
                                </button>
                            )}
                            <Link to="/stats" className={tab(on('/stats', '/recap'))}>
                                <ChartColumn aria-hidden="true" />
                                <span>Stats</span>
                            </Link>
                            <button
                                type="button"
                                className={tab(more)}
                                aria-haspopup="dialog"
                                aria-expanded={more}
                                onClick={() => setMore(true)}
                            >
                                <Ellipsis aria-hidden="true" />
                                <span>More</span>
                            </button>
                        </nav>
                        <div className="content">
                            <DismissiblePreviewNotice />
                            <main id="main" className="page" tabIndex={-1}>
                                {/* A page that crashes shows the error here; the sidebar stays usable, and
                                    navigating anywhere clears it */}
                                <ErrorBoundary
                                    resetKey={pathname}
                                    fallback={(error) => <ErrorPage error={error} variant="page" />}
                                >
                                    <Outlet />
                                </ErrorBoundary>
                            </main>
                        </div>
                    </div>
                    <CommandPalette
                        open={palette.open}
                        initialQuery={palette.query}
                        userId={user.id}
                        onClose={() => setPalette((p) => ({ ...p, open: false }))}
                    />
                    <MoreSheet
                        open={more}
                        onClose={() => setMore(false)}
                        user={user}
                        queueCount={counts.queue}
                        aiAvailable={aiAvailable}
                        onSignOut={() => logout.mutate()}
                        signingOut={logout.isPending}
                    />
                </ShellProvider>
            </SearchContext.Provider>
        </ToastProvider>
    );
}
