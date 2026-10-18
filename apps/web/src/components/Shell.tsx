import type { UserDto } from '@gamequeue/shared';
import { Link, NavLink, Outlet } from 'react-router';
import { useLogout } from '../api/auth';
import { Logo } from './Logo';
import {
    Database,
    Dices,
    Play,
    Gift,
    Library,
    List,
    ListOrdered,
    ListTodo,
    LogOut
} from 'lucide-react';

export function Shell({ user }: { user: UserDto }) {
    const logout = useLogout();
    return (
        <>
            <a className="skip-link" href="#main">
                Skip to content
            </a>
            <div className="app-shell">
                <aside className="sidebar">
                    <Link to="/">
                        <Logo />
                    </Link>
                    <nav className="nav" aria-label="Main">
                        <NavLink to="/" end>
                            <Play />
                            Now playing
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
                        <NavLink to="/data">
                            <Database />
                            Data
                        </NavLink>
                    </nav>
                    <div className="sidebar__user">
                        <Link className="sidebar__username" to={`/u/${user.username}`}>
                            {user.username}
                        </Link>
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
                <main id="main" className="page" tabIndex={-1}>
                    <Outlet />
                </main>
            </div>
        </>
    );
}
