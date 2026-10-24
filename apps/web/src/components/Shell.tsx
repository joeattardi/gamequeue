import type { UserDto } from '@gamequeue/shared';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useLogout } from '../api/auth';
import { useNavCounts } from '../api/counts';
import { isRecapSeason } from '../lib';
import { Footer } from './Footer';
import { Logo } from './Logo';
import { SlotStrip } from './SlotStrip';
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
    Menu,
    PanelLeftClose,
    PanelLeftOpen,
    Rows3,
    Search,
    SkipForward,
    Sparkles,
    X
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
    className,
    collapsed
}: {
    to: string;
    end?: boolean;
    icon: ReactNode;
    label: string;
    count?: number;
    className?: string;
    collapsed: boolean;
}) {
    return (
        <NavLink to={to} end={end} className={className} title={collapsed ? label : undefined}>
            {icon}
            <span className="nav__text">{label}</span>
            {count ? (
                <span className="nav__count">
                    <span aria-hidden="true">{count.toLocaleString()}</span>
                    <span className="sr-only"> games</span>
                </span>
            ) : null}
        </NavLink>
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
    const menuButton = useRef<HTMLButtonElement>(null);
    const closeButton = useRef<HTMLButtonElement>(null);
    const { pathname } = useLocation();
    const navigate = useNavigate();
    // The drawer only exists on narrow screens; while it is open the rest of the page is inert
    const drawerOpen = narrow && open;

    useEffect(() => setOpen(false), [pathname]);
    useEffect(() => {
        if (!drawerOpen) return;
        closeButton.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOpen(false);
                menuButton.current?.focus();
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

    return (
        <>
            <a className="skip-link" href="#main">
                Skip to content
            </a>
            <div className={collapsed ? 'app-shell app-shell--collapsed' : 'app-shell'}>
                <header className="mobile-bar" inert={drawerOpen}>
                    <button
                        ref={menuButton}
                        type="button"
                        className="btn btn--ghost mobile-bar__menu"
                        aria-label="Open menu"
                        aria-expanded={drawerOpen}
                        aria-controls="main-nav"
                        onClick={() => setOpen(true)}
                    >
                        <Menu />
                    </button>
                </header>
                <div
                    className={drawerOpen ? 'drawer-backdrop is-open' : 'drawer-backdrop'}
                    onClick={() => {
                        setOpen(false);
                        menuButton.current?.focus();
                    }}
                    aria-hidden="true"
                />
                <aside
                    id="main-nav"
                    className={
                        drawerOpen
                            ? 'sidebar is-open'
                            : collapsed
                              ? 'sidebar is-collapsed'
                              : 'sidebar'
                    }
                    inert={narrow && !open}
                >
                    <div className="sidebar__head">
                        <Link to="/">
                            <Logo />
                        </Link>
                        <button
                            ref={closeButton}
                            type="button"
                            className="btn btn--ghost sidebar__close"
                            aria-label="Close menu"
                            onClick={() => {
                                setOpen(false);
                                menuButton.current?.focus();
                            }}
                        >
                            <X />
                        </button>
                    </div>
                    <SlotStrip />
                    <NavLink
                        className="nav-search"
                        to="/search"
                        title={collapsed ? 'Search games' : undefined}
                    >
                        <Search />
                        <span className="nav__text">Search games</span>
                        <kbd aria-hidden="true">/</kbd>
                    </NavLink>
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
                                    label="Recap"
                                    collapsed={collapsed}
                                />
                            )}
                        </div>
                    </nav>
                    <button
                        type="button"
                        className="sidebar__collapse"
                        aria-expanded={!collapsed}
                        aria-controls="main-nav"
                        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        title={collapsed ? 'Expand sidebar' : undefined}
                        onClick={toggleCollapsed}
                    >
                        {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
                        <span className="nav__text">Collapse</span>
                    </button>
                    <UserMenu
                        user={user}
                        onSignOut={() => logout.mutate()}
                        signingOut={logout.isPending}
                    />
                </aside>
                <div className="content" inert={drawerOpen}>
                    <main id="main" className="page" tabIndex={-1}>
                        <Outlet />
                    </main>
                    <Footer sitemap />
                </div>
            </div>
        </>
    );
}
