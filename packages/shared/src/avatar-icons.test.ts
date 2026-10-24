import { describe, expect, it } from 'vitest';
import {
    AVATAR_COLORS,
    AVATAR_COLOR_NAMES,
    AVATAR_ICONS,
    AVATAR_ICON_AUTHORS
} from './avatar-icons.js';

describe('avatar icons', () => {
    it('has unique keys, known authors and drawable paths', () => {
        const keys = AVATAR_ICONS.map((i) => i.key);
        expect(new Set(keys).size).toBe(keys.length);
        for (const icon of AVATAR_ICONS) {
            expect(AVATAR_ICON_AUTHORS[icon.author], icon.key).toBeDefined();
            expect(icon.path.startsWith('M'), icon.key).toBe(true);
        }
    });

    it('has eight named colours', () => {
        expect(AVATAR_COLORS).toHaveLength(8);
        expect(AVATAR_COLOR_NAMES).toHaveLength(8);
    });
});
