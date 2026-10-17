import type { UserDto } from '@gamequeue/shared';
import { NavLink, Outlet } from 'react-router';
import { useLogout } from '../api/auth';
import { Logo } from './Logo';

export function Shell({ user }: { user: UserDto }) {
    const logout = useLogout();
    return (
        <>
            <a className="skip-link" href="#main">
                Skip to content
            </a>
            <header className="topbar">
                <Logo />
                <nav className="nav" aria-label="Main">
                    <NavLink to="/" end>
                        Home
                    </NavLink>
                    <NavLink to="/collection">Collection</NavLink>
                    <NavLink to="/backlog">Backlog</NavLink>
                </nav>
                <div className="topbar__user">
                    <span className="topbar__email" title={user.email}>
                        {user.email}
                    </span>
                    <button
                        className="btn btn--ghost"
                        onClick={() => logout.mutate()}
                        disabled={logout.isPending}
                    >
                        Sign out
                    </button>
                </div>
            </header>
            <main id="main" className="page" tabIndex={-1}>
                <Outlet />
            </main>
        </>
    );
}
