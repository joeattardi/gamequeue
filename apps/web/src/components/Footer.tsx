import { Link } from 'react-router';

const SITE_MAP = [
    ['/', 'Now playing'],
    ['/search', 'Search'],
    ['/queue', 'Queue'],
    ['/pick', 'Pick'],
    ['/collection', 'Collection'],
    ['/backlog', 'Backlog'],
    ['/lists', 'Lists'],
    ['/wishlist', 'Wishlist'],
    ['/discover', 'Discover'],
    ['/grids', 'Grids'],
    ['/stats', 'Stats'],
    ['/recap', 'Recap'],
    ['/data', 'Data'],
    ['/account', 'Account']
] as const;

/**
 * Copyright line and the IGDB attribution. Shown in the app shell and on the public profile pages.
 * `sitemap` adds plain links to the signed-in pages, including the ones the sidebar tucks away.
 */
export function Footer({ sitemap = false }: { sitemap?: boolean }) {
    return (
        <footer className="site-footer">
            {sitemap && (
                <nav className="site-footer__map" aria-label="Site map">
                    {SITE_MAP.map(([to, label]) => (
                        <Link key={to} to={to}>
                            {label}
                        </Link>
                    ))}
                </nav>
            )}
            <span>© {new Date().getFullYear()} Joe Attardi</span>
            <span>
                Game data from{' '}
                <a href="https://www.igdb.com" target="_blank" rel="noreferrer">
                    IGDB.com
                </a>
            </span>
        </footer>
    );
}
