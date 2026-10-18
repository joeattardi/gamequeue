import type { IconName } from './platformIconPaths';

/** IGDB platform ids (stable) grouped by the glyph that represents them. */
const FAMILIES: Record<IconName | 'globe' | 'joystick', number[]> = {
    playstation: [7, 8, 9, 38, 46, 48, 165, 167, 390],
    xbox: [11, 12, 49, 169],
    windows: [6, 74, 161],
    apple: [14, 39],
    linux: [3],
    android: [34],
    steam: [163],
    nintendoswitch: [130, 508],
    sega: [23, 29, 30, 32, 35, 64],
    atari: [59, 60, 61, 62, 63, 65, 66],
    commodore: [15, 71],
    oculus: [162, 384, 385, 387],
    meta: [386, 471],
    globe: [82],
    joystick: [52]
};

const BY_ID = new Map<number, keyof typeof FAMILIES>(
    (Object.entries(FAMILIES) as [keyof typeof FAMILIES, number[]][]).flatMap(([icon, ids]) =>
        ids.map((id) => [id, icon] as const)
    )
);

/** Glyph for an IGDB platform id, or undefined when we have none (the text label stands alone). */
export const platformIconFor = (platformId: number) => BY_ID.get(platformId);
