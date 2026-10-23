import { describe, expect, it } from 'vitest';
import { isMajorShop, splitShops } from './shops.js';

const deals = (...shop: string[]) => shop.map((s) => ({ shop: s }));

describe('splitShops', () => {
    it('leads with the well-known shops and keeps the order', () => {
        const { main, more } = splitShops(
            deals('Kinguin', 'Steam', 'GOG', 'Gamesplanet DE', 'Epic Games Store')
        );
        expect(main.map((d) => d.shop)).toEqual(['Steam', 'GOG', 'Epic Games Store']);
        expect(more.map((d) => d.shop)).toEqual(['Kinguin', 'Gamesplanet DE']);
    });

    it('falls back to the cheapest few when no shop is a major one', () => {
        const { main, more } = splitShops(deals('A', 'B', 'C', 'D', 'E', 'F', 'G'));
        expect(main).toHaveLength(5);
        expect(more.map((d) => d.shop)).toEqual(['F', 'G']);
    });

    it('matches case-insensitively', () => {
        expect(isMajorShop('HUMBLE STORE')).toBe(true);
        expect(isMajorShop('Kinguin')).toBe(false);
    });
});
