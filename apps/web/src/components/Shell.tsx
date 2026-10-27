import type { UserDto } from '@gamequeue/shared';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useLogout } from '../api/auth';
import { useNavCounts } from '../api/counts';
import { isRecapSeason } from '../lib';
import { ErrorBoundary } from './ErrorBoundary';
import { ErrorPage } from './ErrorPage';
import { Footer } from './Footer';
import { PreviewBadge } from './PreviewBadge';
import { Logo } from './Logo';
import { MenuIcon } from './MenuIcon';
import { Tooltip } from './Tooltip';
import { UserMenu } from './UserMenu';
import {
    Bookmark,
    ChartColumn,
    Compass,
    Dices,
    Gift,
    Inbox,
    Joystick,
    LayoutGrid,
    LibraryBig,
    PanelLeftClose,
    PanelLeftOpen,
    Rows3,
    Search,
    SkipForward,
    Sparkles
} from 'lucide-react';

const NARROW = '(max-width: 899px)';

/** Whether the viewport is narrow enough for the nav to be a slide-in drawer. */
function useNarrow() {
    const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
    useEffect(() => {
        const mq = window.matchMedia(NARROW);
        const onChange = () => setNarrow(mq.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);
    return narrow;
}

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
    const narrow = useNarrow();
    const [collapsedPref, toggleCollapsed] = useCollapsed();
    const counts = useNavCounts();
    // Collapsing is a wide-screen thing: the drawer is always the full nav
    const collapsed = collapsedPref && !narrow;
    const [open, setOpen] = useState(false);
    const sidebar = useRef<HTMLElement>(null);
    const barLogo = useRef<HTMLAnchorElement>(null);
    const hamburger = useRef<HTMLButtonElement>(null);
    const closeButton = useRef<HTMLButtonElement>(null);
    // What opened the menu, to give focus back to it when it closes
    const opener = useRef<HTMLButtonElement | null>(null);
    const { pathname } = useLocation();
    const navigate = useNavigate();
    // The drawer only exists on narrow screens; while it is open the rest of the page is inert
    const drawerOpen = narrow && open;

    useEffect(() => setOpen(false), [pathname]);
    useEffect(() => {
        if (!drawerOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOpen(false);
                opener.current?.focus({ preventScroll: true });
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [drawerOpen]);

    // "/" jumps to search, unless the user is typing somewhere
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
            const el = e.target as HTMLElement | null;
            if (el?.closest('input, textarea, select, [contenteditable]')) return;
            e.preventDefault();
            navigate('/search');
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [navigate]);

    /**
     * Opens or closes the full-screen menu from the hamburger. On open, the icon that was tapped (the circle's origin), the hamburger and the bar's logo are measured first:
     * the menu's own ✕ and logo are fixed on the hamburger's and logo's boxes, so neither moves when
     * it opens. The variables are set (and flushed) before the open class goes on: if they changed
     * in the same frame, the circle would start from the old origin and visibly jump on the first
     * open.
     */
    const toggleMenu = (from: HTMLButtonElement | null) => {
        if (drawerOpen) {
            setOpen(false);
            opener.current?.focus({ preventScroll: true });
            return;
        }
        opener.current = from;
        const el = sidebar.current;
        const icon = from?.querySelector('svg')?.getBoundingClientRect();
        const bar = hamburger.current?.getBoundingClientRect();
        const logo = barLogo.current?.getBoundingClientRect();
        if (el && icon && bar && logo) {
            // The bar scrolled away with the page: the ✕ and logo go to where the bar starts
            const barShown = bar.top >= 0 && bar.bottom <= window.innerHeight;
            const vars: Record<string, string | null> = {
                '--menu-cx': `${icon.left + icon.width / 2}px`,
                '--menu-cy': `${icon.top + icon.height / 2}px`,
                '--menu-left': barShown ? `${bar.left}px` : null,
                '--menu-top': barShown ? `${bar.top}px` : null,
                '--menu-w': barShown ? `${bar.width}px` : null,
                '--menu-h': barShown ? `${bar.height}px` : null,
                '--logo-left': `${logo.left}px`,
                '--logo-top': `${barShown ? logo.top : 2}px`,
                '--logo-h': `${logo.height}px`
            };
            for (const [name, value] of Object.entries(vars)) {
                if (value === null) el.style.removeProperty(name);
                else el.style.setProperty(name, value);
            }
            void getComputedStyle(el).clipPath;
        }
        setOpen(true);
    };

    return (
        <>
            <a className="skip-link" href="#main">
                Skip to content
            </a>
            <div className={collapsed ? 'app-shell app-shell--collapsed' : 'app-shell'}>
                <header className="mobile-bar" inert={drawerOpen}>
                    <button
                        ref={hamburger}
                        type="button"
                        className="btn btn--ghost mobile-bar__menu"
                        aria-label="Open menu"
                        aria-expanded={drawerOpen}
                        aria-controls="main-nav"
                        onClick={(e) => toggleMenu(e.currentTarget)}
                    >
                        <MenuIcon />
                    </button>
                    <div className="mobile-bar__brand">
                        <Link ref={barLogo} to="/" className="mobile-bar__logo">
                            <Logo />
                        </Link>
                        <PreviewBadge />
                    </div>
                </header>
                <aside
                    ref={sidebar}
                    id="main-nav"
                    className={
                        drawerOpen
                            ? 'sidebar is-open'
                            : collapsed
                              ? 'sidebar is-collapsed'
                              : 'sidebar'
                    }
                    inert={narrow && !open}
                    // A link to the page you are already on doesn't change the path, so close here too
                    onClick={(e) => {
                        if ((e.target as HTMLElement).closest('a')) setOpen(false);
                    }}
                >
                    <div className="sidebar__head">
                        <div className="sidebar__brand">
                            <Link to="/" className="sidebar__logo">
                                <Logo />
                            </Link>
                            <PreviewBadge />
                        </div>
                        <button
                            ref={closeButton}
                            type="button"
                            className="btn btn--ghost sidebar__close"
                            aria-label="Close menu"
                            onClick={() => toggleMenu(null)}
                        >
                            <MenuIcon open={drawerOpen} />
                        </button>
                    </div>
                    <Tooltip label="Search games" shortcut="/" enabled={collapsed}>
                        <NavLink className="nav-search" to="/search">
                            <Search />
                            <span className="nav__text">Search games</span>
                            <kbd aria-hidden="true">/</kbd>
                        </NavLink>
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
                            <NavItem
                                to="/pick"
                                icon={<Dices />}
                                label="Pick"
                                collapsed={collapsed}
                            />
                        </div>
                        <div className="nav__group" role="group" aria-labelledby="nav-library">
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
                            <NavItem
                                to="/backlog"
                                icon={<Inbox />}
                                label="Backlog"
                                count={counts.backlog}
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
                            <NavItem
                                to="/wishlist"
                                icon={<Gift />}
                                label="Wishlist"
                                count={counts.wishlist}
                                collapsed={collapsed}
                            />
                            <NavItem
                                to="/discover"
                                icon={<Compass />}
                                label="Discover"
                                collapsed={collapsed}
                            />
                        </div>
                        <div className="nav__group" role="group" aria-labelledby="nav-social">
                            <h2 className="nav__label" id="nav-social">
                                Social
                            </h2>
                            <NavItem
                                to="/grids"
                                icon={<LayoutGrid />}
                                label="Grids"
                                collapsed={collapsed}
                            />
                            <NavItem
                                to="/tiers"
                                icon={<Rows3 />}
                                label="Tier lists"
                                collapsed={collapsed}
                            />
                        </div>
                        <div className="nav__group" role="group" aria-labelledby="nav-insights">
                            <h2 className="nav__label" id="nav-insights">
                                Insights
                            </h2>
                            <NavItem
                                to="/stats"
                                icon={<ChartColumn />}
                                label="Stats"
                                collapsed={collapsed}
                            />
                            {/* Always in the footer's site map; promoted here for the season */}
                            {isRecapSeason() && (
                                <NavItem
                                    to="/recap"
                                    className="nav__season"
                                    icon={<Sparkles />}
                                    label="Save File"
                                    collapsed={collapsed}
                                />
                            )}
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
                <nav className="tabbar" aria-label="Quick links">
                    <NavLink to="/" end className="tabbar__item" onClick={() => setOpen(false)}>
                        <Joystick />
                        <span>Playing</span>
                    </NavLink>
                    <NavLink to="/queue" className="tabbar__item" onClick={() => setOpen(false)}>
                        <SkipForward />
                        <span>Queue</span>
                        {counts.queue ? (
                            <span className="tabbar__count" aria-hidden="true">
                                {counts.queue > 99 ? '99+' : counts.queue}
                            </span>
                        ) : null}
                    </NavLink>
                    <NavLink
                        to="/collection"
                        className="tabbar__item"
                        onClick={() => setOpen(false)}
                    >
                        <LibraryBig />
                        <span>Collection</span>
                    </NavLink>
                    <NavLink to="/search" className="tabbar__item" onClick={() => setOpen(false)}>
                        <Search />
                        <span>Search</span>
                    </NavLink>
                    <UserMenu
                        variant="tab"
                        user={user}
                        onSignOut={() => logout.mutate()}
                        signingOut={logout.isPending}
                    />
                </nav>
                <div className="content" inert={drawerOpen}>
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
                    <Footer sitemap />
                </div>
            </div>
        </>
    );
}
