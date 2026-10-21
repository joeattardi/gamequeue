import type { UserDto } from '@gamequeue/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useLogout } from '../api/auth';
import { Avatar } from './Avatar';
import { Footer } from './Footer';
import { Logo } from './Logo';
import {
    Database,
    ChartColumn,
    Sparkles,
    Dices,
    Play,
    Search,
    Gift,
    Library,
    List,
    ListOrdered,
    ListTodo,
    LogOut,
    Menu,
    Settings,
    ShieldCheck,
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
                    <nav className="nav" aria-label="Main">
                        <NavLink to="/" end>
                            <Play />
                            Now playing
                        </NavLink>
                        <NavLink to="/search">
                            <Search />
                            Search
                        </NavLink>
                        <NavLink to="/collection">
                            <Library />
                            Collection
                        </NavLink>
                        <NavLink to="/backlog">
                            <ListTodo />
                            Backlog
                        </NavLink>
                        <NavLink to="/queue">
                            <ListOrdered />
                            Queue
                        </NavLink>
                        <NavLink to="/lists">
                            <List />
                            Lists
                        </NavLink>
                        <NavLink to="/wishlist">
                            <Gift />
                            Wishlist
                        </NavLink>
                        <NavLink to="/pick">
                            <Dices />
                            Pick
                        </NavLink>
                        <NavLink to="/stats">
                            <ChartColumn />
                            Stats
                        </NavLink>
                        <NavLink to="/recap">
                            <Sparkles />
                            Recap
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
                    </nav>
                    <div className="sidebar__user">
                        <Link
                            className="btn btn--ghost sidebar__username"
                            to={`/u/${user.username}`}
                        >
                            <Avatar
                                username={user.username}
                                size={24}
                                avatarUpdatedAt={user.avatarUpdatedAt}
                            />
                            <span>{user.username}</span>
                        </Link>
                        <NavLink className="btn btn--ghost" to="/account">
                            <Settings />
                            Account
                        </NavLink>
                        <button
                            className="btn btn--ghost"
                            onClick={() => logout.mutate()}
                            disabled={logout.isPending}
                        >
                            <LogOut />
                            Sign out
                        </button>
                    </div>
                </aside>
                <div className="content" inert={drawerOpen}>
                    <main id="main" className="page" tabIndex={-1}>
                        <Outlet />
                    </main>
                    <Footer />
                </div>
            </div>
        </>
    );
}
