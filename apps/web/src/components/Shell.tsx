import type { UserDto } from '@gamequeue/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useLogout } from '../api/auth';
import { isRecapSeason } from '../lib';
import { Footer } from './Footer';
import { Logo } from './Logo';
import { UserMenu } from './UserMenu';
import {
    Bookmark,
    ChartColumn,
    Dices,
    Gift,
    Inbox,
    Joystick,
    LibraryBig,
    Menu,
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

export function Shell({ user }: { user: UserDto }) {
    const logout = useLogout();
    const narrow = useNarrow();
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
            <div className="app-shell">
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
                    className={drawerOpen ? 'sidebar is-open' : 'sidebar'}
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
                    <NavLink className="nav-search" to="/search">
                        <Search />
                        <span>Search games</span>
                        <kbd aria-hidden="true">/</kbd>
                    </NavLink>
                    <nav className="nav" aria-label="Main">
                        <div className="nav__group" role="group" aria-labelledby="nav-play">
                            <h2 className="nav__label" id="nav-play">
                                Play
                            </h2>
                            <NavLink to="/" end>
                                <Joystick />
                                Now playing
                            </NavLink>
                            <NavLink to="/queue">
                                <SkipForward />
                                Queue
                            </NavLink>
                            <NavLink to="/pick">
                                <Dices />
                                Pick
                            </NavLink>
                        </div>
                        <div className="nav__group" role="group" aria-labelledby="nav-library">
                            <h2 className="nav__label" id="nav-library">
                                Library
                            </h2>
                            <NavLink to="/collection">
                                <LibraryBig />
                                Collection
                            </NavLink>
                            <NavLink to="/backlog">
                                <Inbox />
                                Backlog
                            </NavLink>
                            <NavLink to="/lists">
                                <Bookmark />
                                Lists
                            </NavLink>
                            <NavLink to="/wishlist">
                                <Gift />
                                Wishlist
                            </NavLink>
                        </div>
                        <div className="nav__group" role="group" aria-labelledby="nav-insights">
                            <h2 className="nav__label" id="nav-insights">
                                Insights
                            </h2>
                            <NavLink to="/stats">
                                <ChartColumn />
                                Stats
                            </NavLink>
                            {/* Always in the footer's site map; promoted here for the season */}
                            {isRecapSeason() && (
                                <NavLink className="nav__season" to="/recap">
                                    <Sparkles />
                                    Recap
                                </NavLink>
                            )}
                        </div>
                    </nav>
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
