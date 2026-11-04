import { Link } from 'react-router';
import { useInShell } from './ShellContext';

/**
 * Copyright line, the IGDB attribution and a link to the credits page, for the pages outside the app shell
 * (landing, sign-in, credits, public profiles for visitors). Inside the shell the same attribution is in the user menu.
 */
export function Footer() {
    if (useInShell()) return null;
    return (
        <footer className="site-footer">
            <span>© {new Date().getFullYear()} Joe Attardi</span>
            <span>Preview: features may change and data could be lost.</span>
            <span>
                Game data from{' '}
                <a href="https://www.igdb.com" target="_blank" rel="noreferrer">
                    IGDB.com
                </a>
                {' · '}
                <Link to="/credits">Credits</Link>
            </span>
        </footer>
    );
}
