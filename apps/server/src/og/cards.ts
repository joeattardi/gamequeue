import {
    AVATAR_COLORS,
    AVATAR_GRID,
    AVATAR_ICON_VIEWBOX,
    findAvatarIcon,
    generateIdenticon,
    LOGO_PATH,
    LOGO_VIEWBOX,
    type AvatarIconChoice
} from '@gamequeue/shared';

/**
 * The two share cards (1200x630) as satori element trees. satori speaks a flexbox-only subset of CSS and
 * only draws glyphs the bundled latin fonts have, so the cards show numbers, our own phrases, the
 * username (a-z0-9_-) and IGDB genre names, never game titles or notes.
 */

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

export interface ProfileCardData {
    host: string;
    username: string;
    /** Bumps when the uploaded avatar changes; null means no upload (a preset icon or the identicon) */
    avatarVersion: number | null;
    avatarIcon: AvatarIconChoice | null;
    /** The slots hold a game, so the card says "now playing" and fans their covers */
    playing: boolean;
    total: number;
    finished: number;
    backlog: number;
    /** Cover image ids, at most three */
    covers: string[];
}

export interface RecapCardData {
    host: string;
    username: string;
    avatarVersion: number | null;
    avatarIcon: AvatarIconChoice | null;
    year: number;
    headline: { value: number; label: string };
    /** Finished games compared with the year before; null when neither year has any */
    delta: { diff: number; previousYear: number } | null;
    hours: number | null;
    topGenre: string | null;
    archetype: string | null;
    covers: string[];
}

/** What the renderer fetched for a card: cover art by image id, and the uploaded avatar if there is one */
export interface CardAssets {
    covers: Map<string, string | null>;
    avatar: string | null;
}

export type Style = Record<string, string | number>;
export interface El {
    type: string;
    props: Record<string, unknown> & { style?: Style; children?: unknown };
}
export type Child = El | string | false | null | undefined;

/** `div`s are flex containers (satori wants an explicit display on anything with several children). */
export function h(
    type: string,
    props: Record<string, unknown> & { style?: Style },
    ...kids: Child[]
): El {
    const children = kids.filter((k): k is El | string => k !== false && k != null);
    const style = type === 'div' ? { display: 'flex', ...props.style } : props.style;
    return { type, props: { ...props, style, children } };
}

export const DISPLAY = 'Bricolage Grotesque';
export const BODY = 'Figtree';
export const INK = '#f5f8ff';
export const MUTED = 'rgba(205, 218, 245, 0.72)';
export const GLASS = 'rgba(255, 255, 255, 0.07)';
export const GLASS_LINE = 'rgba(255, 255, 255, 0.14)';

function icon(size: number, stroke: string, paths: string[], width = 2): El {
    return h(
        'svg',
        {
            width: size,
            height: size,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke,
            'stroke-width': width,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round'
        },
        ...paths.map((d) => h('path', { d }))
    );
}

export const gamepad = (size: number, fill: string) =>
    h(
        'svg',
        { width: size, height: size, viewBox: LOGO_VIEWBOX },
        h('path', { d: LOGO_PATH, fill, 'fill-rule': 'evenodd' })
    );

export function brand(): El {
    return h(
        'div',
        { style: { alignItems: 'center', gap: 14 } },
        h(
            'div',
            {
                style: {
                    width: 44,
                    height: 44,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundImage: 'linear-gradient(145deg, #5b8cff, #1d4ed8)',
                    boxShadow: '0 6px 18px -4px rgba(59, 110, 255, 0.7)'
                }
            },
            gamepad(32, '#f5f8ff')
        ),
        h(
            'div',
            {
                style: {
                    fontFamily: DISPLAY,
                    fontWeight: 700,
                    fontSize: 32,
                    letterSpacing: '-0.02em',
                    color: INK
                }
            },
            'GameQueue'
        )
    );
}

const hsl = (h: number, s: number, l: number) => {
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(255 * c)
            .toString(16)
            .padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
};

/** Same margin as the web component (14% each side), done with the viewBox because satori drops path transforms. */
const ICON_PAD = Math.round((AVATAR_ICON_VIEWBOX * 0.14) / 0.72);
const ICON_SPAN = AVATAR_ICON_VIEWBOX + 2 * ICON_PAD;

/** The user's avatar: an uploaded image, a preset icon, or the identicon in the app's dark palette. */
export function avatar(
    username: string,
    icon: AvatarIconChoice | null,
    uploaded: string | null,
    size: number
): El {
    const frame = {
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.26),
        overflow: 'hidden',
        border: '3px solid rgba(255, 255, 255, 0.85)',
        boxShadow: '0 12px 30px -8px rgba(0, 0, 0, 0.6)'
    };
    if (uploaded) {
        return h(
            'div',
            { style: frame },
            h('img', {
                src: uploaded,
                width: size - 6,
                height: size - 6,
                style: { objectFit: 'cover' }
            })
        );
    }
    const preset = icon && findAvatarIcon(icon.icon);
    if (preset && icon) {
        return h(
            'div',
            { style: frame },
            h(
                'svg',
                {
                    width: size - 6,
                    height: size - 6,
                    viewBox: `${-ICON_PAD} ${-ICON_PAD} ${ICON_SPAN} ${ICON_SPAN}`
                },
                h('rect', {
                    x: -ICON_PAD,
                    y: -ICON_PAD,
                    width: ICON_SPAN,
                    height: ICON_SPAN,
                    fill: AVATAR_COLORS[icon.color] ?? AVATAR_COLORS[0]
                }),
                h('path', { d: preset.path, fill: '#ffffff' })
            )
        );
    }
    const { hue, cells } = generateIdenticon(username);
    const span = AVATAR_GRID + 2;
    return h(
        'div',
        { style: frame },
        h(
            'svg',
            { width: size - 6, height: size - 6, viewBox: `0 0 ${span} ${span}` },
            h('rect', { width: span, height: span, fill: hsl(hue, 30, 22) }),
            ...cells.flatMap((row, y) =>
                row.map((on, x) =>
                    on
                        ? h('rect', {
                              x: x + 1,
                              y: y + 1,
                              width: 1.02,
                              height: 1.02,
                              fill: hsl(hue, 70, 68)
                          })
                        : null
                )
            )
        )
    );
}

/** One cover, or a tinted placeholder when its image couldn't be fetched. 3:4 like IGDB's. */
export function cover(uri: string | null | undefined, width: number, style: Style): El {
    const height = Math.round((width * 4) / 3);
    const frame = {
        width,
        height,
        borderRadius: Math.round(width * 0.07),
        overflow: 'hidden',
        border: '1.5px solid rgba(255, 255, 255, 0.22)',
        boxShadow: '0 40px 60px -20px rgba(0, 0, 0, 0.75), 0 8px 18px -6px rgba(0, 0, 0, 0.5)',
        ...style
    };
    return uri
        ? h('div', { style: frame }, h('img', { src: uri, width, height }))
        : h(
              'div',
              {
                  style: {
                      ...frame,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundImage: 'linear-gradient(160deg, #35508f, #1c2a55)'
                  }
              },
              gamepad(Math.round(width * 0.36), 'rgba(255, 255, 255, 0.45)')
          );
}

/** Up to three covers fanned like a hand of cards, the first one in front. `box` is the area they fill. */
function fan(covers: (string | null)[], box: { width: number; height: number }, hero: number): El {
    const n = covers.length;
    const back = Math.round(hero * 0.82);
    const heroH = Math.round((hero * 4) / 3);
    const backH = Math.round((back * 4) / 3);
    const centerX = box.width / 2;
    const centerY = box.height / 2;
    const place = (width: number, height: number, dx: number, dy: number, rotate: number) => ({
        position: 'absolute',
        left: Math.round(centerX - width / 2 + dx),
        top: Math.round(centerY - height / 2 + dy),
        transform: `rotate(${rotate}deg)`
    });
    const items: El[] = [];
    if (n >= 3)
        items.push(
            cover(covers[2], back, place(back, backH, 128, 28, 9)),
            cover(covers[1], back, place(back, backH, -128, 28, -9))
        );
    else if (n === 2) items.push(cover(covers[1], back, place(back, backH, -92, 30, -8)));
    items.push(cover(covers[0], hero, place(hero, heroH, n === 2 ? 42 : 0, -8, n === 1 ? 3 : 0)));
    return h('div', { style: { position: 'relative', ...box } }, ...items);
}

/** Glass-effect statistic: a big number over a small caption. */
function stat(value: string, label: string, size = 54): El {
    return h(
        'div',
        {
            style: {
                flexDirection: 'column',
                gap: 6,
                padding: '16px 22px 14px',
                maxWidth: 260,
                borderRadius: 22,
                backgroundColor: GLASS,
                border: `1.5px solid ${GLASS_LINE}`
            }
        },
        h(
            'div',
            {
                style: {
                    fontFamily: DISPLAY,
                    fontWeight: 800,
                    fontSize: size,
                    lineHeight: 1.05,
                    letterSpacing: '-0.03em',
                    color: INK,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                }
            },
            value
        ),
        h(
            'div',
            {
                style: {
                    fontFamily: BODY,
                    fontWeight: 600,
                    fontSize: 17,
                    letterSpacing: '0.1em',
                    whiteSpace: 'nowrap',
                    textTransform: 'uppercase',
                    color: MUTED
                }
            },
            label
        )
    );
}

export const pill = (text: string, dot?: string) =>
    h(
        'div',
        {
            style: {
                alignItems: 'center',
                gap: 12,
                padding: '10px 20px',
                borderRadius: 999,
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: `1.5px solid ${GLASS_LINE}`,
                fontFamily: BODY,
                fontWeight: 700,
                fontSize: 21,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: INK
            }
        },
        dot &&
            h('div', {
                style: {
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: dot,
                    boxShadow: `0 0 12px ${dot}`
                }
            }),
        text
    );

/** Soft colour glows over a deep base: the look of both cards. */
export const backdrop = (base: string, layers: string[]): Style => ({
    backgroundColor: base,
    backgroundImage: layers.join(', ')
});

export const frame = (style: Style, ...kids: Child[]) =>
    h(
        'div',
        {
            style: {
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
                position: 'relative',
                overflow: 'hidden',
                fontFamily: BODY,
                color: INK,
                ...style
            }
        },
        ...kids
    );

const fmt = (n: number) => n.toLocaleString('en-US');

/** Big usernames shrink so the longest legal one (30 characters) still fits beside the covers. */
const nameSize = (username: string) =>
    username.length <= 9 ? 104 : username.length <= 14 ? 82 : username.length <= 20 ? 62 : 46;

export const footer = (text: string) =>
    h(
        'div',
        {
            style: {
                fontFamily: BODY,
                fontWeight: 600,
                fontSize: 24,
                color: MUTED,
                letterSpacing: '0.01em'
            }
        },
        text
    );

export function profileCard(d: ProfileCardData, a: CardAssets): El {
    const covers = d.covers.map((id) => a.covers.get(id) ?? null);
    return frame(
        backdrop('#070d20', [
            'radial-gradient(circle at 88% 8%, rgba(59, 110, 255, 0.6), transparent 52%)',
            'radial-gradient(circle at 4% 104%, rgba(124, 58, 237, 0.5), transparent 48%)'
        ]),
        // Left column
        h(
            'div',
            {
                style: {
                    position: 'absolute',
                    left: 64,
                    top: 56,
                    width: 640,
                    height: CARD_HEIGHT - 112,
                    flexDirection: 'column'
                }
            },
            brand(),
            h(
                'div',
                { style: { flex: 1, flexDirection: 'column', justifyContent: 'center', gap: 26 } },
                h(
                    'div',
                    { style: { alignItems: 'center', gap: 22 } },
                    avatar(d.username, d.avatarIcon, a.avatar, 96),
                    pill(
                        d.playing ? 'Now playing' : d.total > 0 ? 'Game collection' : 'New player',
                        d.playing ? '#34d399' : undefined
                    )
                ),
                h(
                    'div',
                    {
                        style: {
                            fontFamily: DISPLAY,
                            fontWeight: 800,
                            fontSize: nameSize(d.username),
                            lineHeight: 1,
                            letterSpacing: '-0.045em',
                            color: INK,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            width: 620,
                            paddingBottom: 6
                        }
                    },
                    d.username
                ),
                h(
                    'div',
                    { style: { gap: 16 } },
                    stat(fmt(d.total), 'Games'),
                    stat(fmt(d.finished), 'Finished'),
                    stat(fmt(d.backlog), 'Backlog')
                )
            ),
            footer(`${d.host}/u/${d.username}`)
        ),
        // Covers
        h(
            'div',
            { style: { position: 'absolute', right: 40, top: 0 } },
            d.covers.length > 0
                ? fan(covers, { width: 470, height: CARD_HEIGHT }, 262)
                : h(
                      'div',
                      {
                          style: {
                              width: 470,
                              height: CARD_HEIGHT,
                              alignItems: 'center',
                              justifyContent: 'center'
                          }
                      },
                      gamepad(300, 'rgba(255, 255, 255, 0.1)')
                  )
        )
    );
}

export function recapCard(d: RecapCardData, a: CardAssets): El {
    const covers = d.covers.map((id) => a.covers.get(id) ?? null);
    const delta = d.delta;
    const up = delta !== null && delta.diff > 0;
    const stats = [
        d.hours !== null && stat(`${fmt(d.hours)} hrs`, 'Est. play time', 34),
        d.topGenre && stat(d.topGenre, 'Top genre', 34),
        d.archetype && stat(d.archetype, 'Your type', 34)
    ].filter((s): s is El => !!s);
    return frame(
        backdrop('#1a2f9c', [
            'radial-gradient(circle at 90% 0%, rgba(167, 139, 250, 0.75), transparent 55%)',
            'radial-gradient(circle at 0% 100%, rgba(34, 211, 238, 0.4), transparent 50%)',
            'linear-gradient(140deg, #15286f 0%, #2547c9 58%, #5b3fd1 100%)'
        ]),
        h(
            'div',
            {
                style: {
                    position: 'absolute',
                    left: 64,
                    top: 56,
                    width: 650,
                    height: CARD_HEIGHT - 112,
                    flexDirection: 'column'
                }
            },
            h(
                'div',
                { style: { alignItems: 'center', justifyContent: 'space-between' } },
                brand(),
                h(
                    'div',
                    { style: { alignItems: 'center', gap: 14 } },
                    h(
                        'div',
                        {
                            style: {
                                fontFamily: BODY,
                                fontWeight: 600,
                                fontSize: 26,
                                color: INK,
                                maxWidth: 200,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                            }
                        },
                        d.username
                    ),
                    avatar(d.username, d.avatarIcon, a.avatar, 52)
                )
            ),
            h(
                'div',
                { style: { flex: 1, flexDirection: 'column', justifyContent: 'center' } },
                h(
                    'div',
                    { style: { alignItems: 'center', gap: 14, marginBottom: 6 } },
                    pill(`${d.year} Save File`),
                    delta &&
                        h(
                            'div',
                            {
                                style: {
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '10px 20px',
                                    borderRadius: 999,
                                    backgroundColor: up
                                        ? 'rgba(52, 211, 153, 0.2)'
                                        : 'rgba(255, 255, 255, 0.12)',
                                    border: `1.5px solid ${up ? 'rgba(52, 211, 153, 0.5)' : GLASS_LINE}`,
                                    fontFamily: BODY,
                                    fontWeight: 700,
                                    fontSize: 21,
                                    whiteSpace: 'nowrap',
                                    color: up ? '#a7f3d0' : INK
                                }
                            },
                            delta.diff !== 0 &&
                                icon(
                                    22,
                                    'currentColor',
                                    [delta.diff > 0 ? 'm5 14 7-7 7 7' : 'm5 10 7 7 7-7'],
                                    2.6
                                ),
                            delta.diff === 0
                                ? `Same as ${delta.previousYear}`
                                : `${Math.abs(delta.diff)} ${delta.diff > 0 ? 'more' : 'fewer'} than ${delta.previousYear}`
                        )
                ),
                h(
                    'div',
                    {
                        style: {
                            fontFamily: DISPLAY,
                            fontWeight: 800,
                            fontSize: 200,
                            lineHeight: 0.86,
                            letterSpacing: '-0.06em',
                            paddingBottom: 12,
                            color: INK,
                            backgroundImage: 'linear-gradient(180deg, #ffffff 25%, #b9ccff 100%)',
                            backgroundClip: 'text'
                        }
                    },
                    fmt(d.headline.value)
                ),
                h(
                    'div',
                    {
                        style: {
                            fontFamily: DISPLAY,
                            fontWeight: 700,
                            fontSize: 54,
                            letterSpacing: '-0.025em',
                            whiteSpace: 'nowrap',
                            color: INK
                        }
                    },
                    d.headline.label
                )
            ),
            h('div', { style: { gap: 14 } }, ...stats)
        ),
        h(
            'div',
            { style: { position: 'absolute', right: 24, top: 0 } },
            d.covers.length > 0
                ? fan(covers, { width: 440, height: CARD_HEIGHT }, 236)
                : h(
                      'div',
                      {
                          style: {
                              width: 440,
                              height: CARD_HEIGHT,
                              alignItems: 'center',
                              justifyContent: 'center'
                          }
                      },
                      gamepad(280, 'rgba(255, 255, 255, 0.12)')
                  )
        )
    );
}
