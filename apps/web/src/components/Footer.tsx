/** Copyright line and the IGDB attribution. Shown in the app shell and on the public profile pages. */
export function Footer() {
    return (
        <footer className="site-footer">
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
