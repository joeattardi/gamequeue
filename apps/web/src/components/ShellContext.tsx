import { createContext, useContext, type ReactNode } from 'react';

/** True under `Shell`: the sidebar, banner and error boundary are already there, so public pages skip their own frame. */
const InShell = createContext(false);
export const ShellProvider = InShell.Provider;
export const useInShell = () => useContext(InShell);

/**
 * The page body of a public page. On its own it is the page's `<main>`; inside the app shell, which
 * already has one, it is a plain wrapper.
 */
export function PublicMain({ children }: { children: ReactNode }) {
    return useInShell() ? (
        <div className="public-body">{children}</div>
    ) : (
        <main className="page">{children}</main>
    );
}
