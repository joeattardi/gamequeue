import { Link } from 'react-router';
import { Logo } from './Logo';

/** Public pages are rendered for logged-out visitors too, so they bring their own header instead of the Shell. */
export function PublicHeader() {
    return (
        <header className="topbar">
            <Link to="/">
                <Logo />
            </Link>
        </header>
    );
}
