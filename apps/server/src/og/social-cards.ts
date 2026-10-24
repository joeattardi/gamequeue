import type { AvatarIconChoice } from '@gamequeue/shared';
import {
    BODY,
    CARD_HEIGHT,
    DISPLAY,
    GLASS,
    GLASS_LINE,
    INK,
    MUTED,
    avatar,
    backdrop,
    brand,
    cover,
    footer,
    frame,
    gamepad,
    h,
    pill,
    type CardAssets,
    type El
} from './cards.js';

/**
 * Share cards for a public grid and a public tier list (1200x630, same look as the profile card). Like
 * the others they only draw glyphs the bundled latin fonts have: the title and tier names are the
 * owner's own words, so they are present only when `drawable` said so (see `services/og.ts`), and game
 * titles and cell labels are never drawn at all.
 */

export interface GridCardData {
    kind: 'grid';
    host: string;
    username: string;
    avatarVersion: number | null;
    avatarIcon: AvatarIconChoice | null;
    /** Null when the title has characters the cards can't draw */
    title: string | null;
    cols: number;
    rows: number;
    /** Row-major, `cols * rows` long: null = empty cell, otherwise the game's cover image id (null = no cover) */
    cells: ({ cover: string | null } | null)[];
    filled: number;
    /** Every cover image id above, once each */
    covers: string[];
    /** Path of the page, printed at the bottom */
    path: string;
}

export interface TierCardTier {
    /** Null when the name has characters the cards can't draw */
    name: string | null;
    /** Hex from TIER_COLORS */
    color: string;
    /** Games in the tier */
    total: number;
    /** The first few cover image ids (null = a game with no cover) */
    covers: (string | null)[];
}

export interface TierCardData {
    kind: 'tier';
    host: string;
    username: string;
    avatarVersion: number | null;
    avatarIcon: AvatarIconChoice | null;
    title: string | null;
    /** Tiers that have games, best first, at most `TIER_CARD_ROWS` */
    tiers: TierCardTier[];
    /** Games ranked in all tiers, not only the ones drawn */
    ranked: number;
    covers: string[];
    path: string;
}

export const TIER_CARD_ROWS = 5;
export const TIER_CARD_COVERS = 6;

const AREA_W = 500;
const AREA_H = 520;
const TIER_INK = '#111c2e';

/** Big titles shrink so a long one still fits two lines beside the artwork. */
const titleSize = (title: string) => (title.length <= 14 ? 84 : title.length <= 30 ? 62 : 48);

function leftColumn(
    d: {
        username: string;
        avatarVersion: number | null;
        avatarIcon: AvatarIconChoice | null;
        title: string | null;
        host: string;
        path: string;
    },
    a: CardAssets,
    label: string,
    fallbackTitle: string,
    detail: string
): El {
    return h(
        'div',
        {
            style: {
                position: 'absolute',
                left: 64,
                top: 56,
                width: 540,
                height: CARD_HEIGHT - 112,
                flexDirection: 'column'
            }
        },
        brand(),
        h(
            'div',
            { style: { flex: 1, flexDirection: 'column', justifyContent: 'center', gap: 22 } },
            h(
                'div',
                { style: { alignItems: 'center', gap: 20 } },
                avatar(d.username, d.avatarIcon, a.avatar, 72),
                pill(label)
            ),
            h(
                'div',
                {
                    style: {
                        fontFamily: DISPLAY,
                        fontWeight: 800,
                        fontSize: titleSize(d.title ?? fallbackTitle),
                        lineHeight: 1.02,
                        letterSpacing: '-0.04em',
                        color: INK,
                        width: 540,
                        maxHeight: titleSize(d.title ?? fallbackTitle) * 2.1,
                        overflow: 'hidden',
                        paddingBottom: 6
                    }
                },
                d.title ?? fallbackTitle
            ),
            h(
                'div',
                { style: { flexDirection: 'column', gap: 6 } },
                h(
                    'div',
                    {
                        style: {
                            fontFamily: BODY,
                            fontWeight: 700,
                            fontSize: 30,
                            color: INK,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            width: 540
                        }
                    },
                    `by ${d.username}`
                ),
                h(
                    'div',
                    { style: { fontFamily: BODY, fontWeight: 600, fontSize: 24, color: MUTED } },
                    detail
                )
            )
        ),
        footer(`${d.host}${d.path}`)
    );
}

const emptyArt = (): El =>
    h(
        'div',
        {
            style: { width: AREA_W, height: AREA_H, alignItems: 'center', justifyContent: 'center' }
        },
        gamepad(260, 'rgba(255, 255, 255, 0.16)', 0.6)
    );

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function gridCard(d: GridCardData, a: CardAssets): El {
    const gap = 10;
    // The largest 3:4 cell that lets the whole board fit the artwork area
    const w = Math.floor(
        Math.min(
            (AREA_W - (d.cols - 1) * gap) / d.cols,
            (((AREA_H - (d.rows - 1) * gap) / d.rows) * 3) / 4
        )
    );
    const ch = Math.round((w * 4) / 3);
    const board = Array.from({ length: d.rows }, (_, r) =>
        h(
            'div',
            { style: { gap } },
            ...Array.from({ length: d.cols }, (_, c) => {
                const cell = d.cells[r * d.cols + c];
                if (cell === null || cell === undefined)
                    return h('div', {
                        style: {
                            width: w,
                            height: ch,
                            borderRadius: Math.round(w * 0.07),
                            backgroundColor: GLASS,
                            border: `2px dashed ${GLASS_LINE}`
                        }
                    });
                return cover(cell.cover ? (a.covers.get(cell.cover) ?? null) : null, w, {
                    boxShadow: '0 10px 18px -8px rgba(0, 0, 0, 0.7)'
                });
            })
        )
    );
    return frame(
        backdrop('#06142a', [
            'radial-gradient(circle at 92% 6%, rgba(34, 211, 238, 0.5), transparent 52%)',
            'radial-gradient(circle at 2% 106%, rgba(59, 110, 255, 0.55), transparent 50%)'
        ]),
        leftColumn(
            d,
            a,
            'Game grid',
            'Game grid',
            `${d.filled} of ${d.cols * d.rows} ${plural(d.cols * d.rows, 'cell', 'cells')} filled`
        ),
        h(
            'div',
            {
                style: {
                    position: 'absolute',
                    right: 56,
                    top: 0,
                    width: AREA_W,
                    height: CARD_HEIGHT,
                    alignItems: 'center',
                    justifyContent: 'center'
                }
            },
            d.filled > 0
                ? h('div', { style: { flexDirection: 'column', gap } }, ...board)
                : emptyArt()
        )
    );
}

export function tierCard(d: TierCardData, a: CardAssets): El {
    const n = d.tiers.length;
    const gap = 10;
    const rowH = Math.min(96, Math.floor((AREA_H - (n - 1) * gap) / Math.max(1, n)));
    const labelW = rowH;
    const coverW = Math.floor((rowH * 3) / 4);
    const fit = Math.max(1, Math.floor((AREA_W - labelW - 14) / (coverW + 8)));
    const rows = d.tiers.map((t) => {
        const room = Math.min(fit, TIER_CARD_COVERS);
        // "+N" takes the place of the last cover when the tier has more than fit
        const more = t.total > room;
        const shown = t.covers.slice(0, more ? room - 1 : room);
        return h(
            'div',
            {
                style: {
                    width: AREA_W,
                    height: rowH,
                    borderRadius: 14,
                    overflow: 'hidden',
                    backgroundColor: GLASS,
                    border: `1.5px solid ${GLASS_LINE}`
                }
            },
            h(
                'div',
                {
                    style: {
                        width: labelW,
                        height: rowH,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: t.color,
                        fontFamily: DISPLAY,
                        fontWeight: 800,
                        fontSize: (t.name?.length ?? 0) <= 2 ? 44 : 22,
                        color: TIER_INK,
                        overflow: 'hidden'
                    }
                },
                t.name
            ),
            h(
                'div',
                { style: { flex: 1, alignItems: 'center', gap: 8, paddingLeft: 8 } },
                ...shown.map((id) =>
                    cover(id ? (a.covers.get(id) ?? null) : null, coverW - 4, {
                        boxShadow: 'none'
                    })
                ),
                more &&
                    h(
                        'div',
                        {
                            style: {
                                fontFamily: DISPLAY,
                                fontWeight: 800,
                                fontSize: 26,
                                color: INK
                            }
                        },
                        `+${t.total - shown.length}`
                    )
            )
        );
    });
    return frame(
        backdrop('#12081f', [
            'radial-gradient(circle at 92% 6%, rgba(236, 72, 153, 0.5), transparent 52%)',
            'radial-gradient(circle at 2% 106%, rgba(124, 58, 237, 0.6), transparent 50%)'
        ]),
        leftColumn(
            d,
            a,
            'Tier list',
            'Tier list',
            `${d.ranked} ${plural(d.ranked, 'game', 'games')} ranked`
        ),
        h(
            'div',
            {
                style: {
                    position: 'absolute',
                    right: 56,
                    top: 0,
                    width: AREA_W,
                    height: CARD_HEIGHT,
                    alignItems: 'center',
                    justifyContent: 'center'
                }
            },
            n > 0 ? h('div', { style: { flexDirection: 'column', gap } }, ...rows) : emptyArt()
        )
    );
}
