import { useCallback, useState } from 'react';
import { canShowWall, effectiveDensity, parseDensity, type Density } from '../collectionModel';
import { useMediaQuery } from '../lib';

const key = (userId: number) => `gq.collection.density.${userId}`;
const LEGACY_KEY = 'gq_collection_layout';

function read(userId: number): Density | null {
    try {
        const saved = parseDensity(localStorage.getItem(key(userId)));
        if (saved) return saved;
        // Before the wall there was a grid/list switch for the whole browser: keep a chosen list
        return localStorage.getItem(LEGACY_KEY) === 'list' ? 'list' : null;
    } catch {
        return null;
    }
}

/**
 * The Collection's Wall / Grid / List choice, remembered in this browser for each user (the choice is
 * not stored on the server). With nothing saved it is the wall on desktop and the grid on touch
 * screens and below 768 px. A saved wall on a screen that can't show it is drawn as the grid, and the
 * choice stays for when the user is back on a desktop.
 */
export function useDensity(userId: number) {
    const [saved, setSaved] = useState<Density | null>(() => read(userId));
    const touch = useMediaQuery('(hover: none), (pointer: coarse)');
    const narrow = useMediaQuery('(max-width: 767px)');
    const env = { touch, narrow };
    const choose = useCallback(
        (next: Density) => {
            setSaved(next);
            try {
                localStorage.setItem(key(userId), next);
            } catch {
                // Not remembered (private window, blocked storage); the choice still applies
            }
        },
        [userId]
    );
    return { density: effectiveDensity(saved, env), choose, wallAvailable: canShowWall(env) };
}
