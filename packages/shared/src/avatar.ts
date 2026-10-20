/** Procedural "identicon" for a username: deterministic, so it needs no storage and no server call. */

export const AVATAR_GRID = 5;

export interface Identicon {
    /** 0-359, drives the avatar colour. */
    hue: number;
    /** `cells[row][col]`, left-right mirrored, true = filled. */
    cells: boolean[][];
}

/** FNV-1a, 32 bit. */
function hashString(text: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/** mulberry32: small seeded PRNG so one hash yields as many well-mixed bits as needed. */
function seededRandom(seed: number): () => number {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function generateIdenticon(username: string): Identicon {
    const random = seededRandom(hashString(username.trim().toLowerCase()));
    const hue = Math.floor(random() * 360);
    const half = Math.ceil(AVATAR_GRID / 2);
    const cells = Array.from({ length: AVATAR_GRID }, () => {
        const left = Array.from({ length: half }, () => random() < 0.5);
        return [...left, ...left.slice(0, AVATAR_GRID - half).reverse()];
    });
    // An all-empty grid would be a blank square.
    if (!cells.some((row) => row.some(Boolean))) {
        cells[Math.floor(AVATAR_GRID / 2)] = Array.from(
            { length: AVATAR_GRID },
            (_, i) => i === half - 1
        );
    }
    return { hue, cells };
}
