/**
 * Storefronts most people know, matched on a lowercase substring of the shop name ITAD reports
 * (ITAD lists dozens of key resellers; the page leads with these and tucks the rest away).
 */
const MAJOR_SHOP_PARTS = [
    'steam',
    'gog',
    'epic',
    'humble',
    'fanatical',
    'green man',
    'microsoft',
    'xbox',
    'playstation',
    'nintendo',
    'ubisoft',
    'ea app',
    'origin',
    'battle.net',
    'amazon',
    'itch.io'
];

export const isMajorShop = (name: string) => {
    const n = name.toLowerCase();
    return MAJOR_SHOP_PARTS.some((p) => n.includes(p));
};

/** Shown when none of a game's shops is a major one, so the list is never empty. */
export const FALLBACK_SHOP_COUNT = 5;

/** Splits cheapest-first deals into those to show up front and those behind "show more". */
export function splitShops<T extends { shop: string }>(deals: T[]): { main: T[]; more: T[] } {
    const major = deals.filter((d) => isMajorShop(d.shop));
    if (major.length === 0)
        return {
            main: deals.slice(0, FALLBACK_SHOP_COUNT),
            more: deals.slice(FALLBACK_SHOP_COUNT)
        };
    return { main: major, more: deals.filter((d) => !isMajorShop(d.shop)) };
}
