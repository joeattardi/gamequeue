import { useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';

export const THEME_KEY = 'gq.theme';

export const THEMES: Theme[] = ['system', 'light', 'dark'];

/** The saved choice; anything missing or unreadable means follow the system setting. */
export function readTheme(): Theme {
    try {
        const saved = localStorage.getItem(THEME_KEY);
        return saved === 'light' || saved === 'dark' ? saved : 'system';
    } catch {
        return 'system';
    }
}

/** The page background in each theme, for the browser's address bar (`<meta name="theme-color">`). */
const THEME_COLORS = { light: '#f3f6fb', dark: '#0d1320' };

/**
 * Light and dark pin `data-theme` on <html>; system leaves it off so the media query decides. The
 * two theme-color tags in index.html follow the system via their `media`; a chosen theme sets both
 * to its colour, and system puts each back.
 */
export function applyTheme(theme: Theme) {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
        const own = m.media.includes('dark') ? 'dark' : 'light';
        m.content = THEME_COLORS[theme === 'system' ? own : theme];
    });
}

/** The theme choice, remembered in localStorage (the inline script in index.html applies it before first paint). */
export function useTheme(): [Theme, (next: Theme) => void] {
    const [theme, setTheme] = useState<Theme>(readTheme);
    const choose = (next: Theme) => {
        setTheme(next);
        applyTheme(next);
        try {
            if (next === 'system') localStorage.removeItem(THEME_KEY);
            else localStorage.setItem(THEME_KEY, next);
        } catch {
            // Not persisted (private window, blocked storage); the choice still applies.
        }
    };
    return [theme, choose];
}
