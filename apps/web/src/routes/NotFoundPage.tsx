import { Link, useLocation } from 'react-router';
import { CartridgeArt } from '../components/CartridgeArt';
import { Footer } from '../components/Footer';
import { PublicHeader } from '../components/PublicHeader';
import { usePageTitle } from '../lib';

/**
 * Any URL no route matches. Inside the app shell by default; `standalone` (logged-out visitors, who
 * have no shell) brings its own header and footer.
 */
export function NotFoundPage({ standalone = false }: { standalone?: boolean }) {
    usePageTitle('Page not found');
    const { pathname } = useLocation();

    const content = (
        <div className="empty-state empty-state--shake">
            <CartridgeArt />
            <h1>Cartridge not found</h1>
            <p className="muted">
                There is nothing at <code>{pathname}</code>. The link may be broken, or the page may
                have moved.
            </p>
            <div className="empty-state__actions">
                <Link className="btn btn--primary" to="/">
                    {standalone ? 'Back to GameQueue' : 'Go home'}
                </Link>
                {standalone && (
                    <Link className="btn" to="/login">
                        Sign in
                    </Link>
                )}
            </div>
        </div>
    );

    if (!standalone) return content;
    return (
        <>
            <PublicHeader />
            <main className="page">{content}</main>
            <Footer />
        </>
    );
}
