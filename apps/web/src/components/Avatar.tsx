import { useState, type CSSProperties } from 'react';
import {
    AVATAR_COLORS,
    AVATAR_GRID,
    AVATAR_ICON_VIEWBOX,
    avatarUrl,
    findAvatarIcon,
    generateIdenticon,
    type AvatarIconChoice
} from '@gamequeue/shared';

/** White icon on a coloured tile; the icon fills the tile minus a 14% margin on each side. */
const ICON_MARGIN = Math.round(AVATAR_ICON_VIEWBOX * 0.14);
const ICON_SCALE = (AVATAR_ICON_VIEWBOX - 2 * ICON_MARGIN) / AVATAR_ICON_VIEWBOX;

/**
 * The user's uploaded image when they have one (`avatarUpdatedAt` set), else their chosen preset icon,
 * else an identicon generated from the username. Decorative: the username is always shown beside it.
 */
export function Avatar({
    username,
    size = 32,
    avatarUpdatedAt = null,
    avatarIcon = null
}: {
    username: string;
    size?: number;
    avatarUpdatedAt?: number | null;
    avatarIcon?: AvatarIconChoice | null;
}) {
    const [failed, setFailed] = useState<number | null>(null);
    if (avatarUpdatedAt !== null && failed !== avatarUpdatedAt) {
        return (
            <img
                className="avatar avatar--image"
                src={avatarUrl(username, avatarUpdatedAt)}
                width={size}
                height={size}
                alt=""
                onError={() => setFailed(avatarUpdatedAt)}
            />
        );
    }
    const preset = avatarIcon && findAvatarIcon(avatarIcon.icon);
    if (preset && avatarIcon) {
        return (
            <svg
                className="avatar"
                width={size}
                height={size}
                viewBox={`0 0 ${AVATAR_ICON_VIEWBOX} ${AVATAR_ICON_VIEWBOX}`}
                aria-hidden="true"
                focusable="false"
            >
                <rect
                    width={AVATAR_ICON_VIEWBOX}
                    height={AVATAR_ICON_VIEWBOX}
                    fill={AVATAR_COLORS[avatarIcon.color] ?? AVATAR_COLORS[0]}
                />
                <path
                    d={preset.path}
                    fill="#fff"
                    transform={`translate(${ICON_MARGIN} ${ICON_MARGIN}) scale(${ICON_SCALE})`}
                />
            </svg>
        );
    }
    const { hue, cells } = generateIdenticon(username);
    // Inset of one cell so the pattern sits inside a padded tile.
    const span = AVATAR_GRID + 2;
    return (
        <svg
            className="avatar"
            width={size}
            height={size}
            viewBox={`0 0 ${span} ${span}`}
            style={{ '--avatar-h': hue } as CSSProperties}
            aria-hidden="true"
            focusable="false"
        >
            <rect className="avatar__bg" width={span} height={span} />
            {cells.flatMap((row, y) =>
                row.map((on, x) =>
                    on ? (
                        <rect
                            key={`${x}-${y}`}
                            className="avatar__cell"
                            x={x + 1}
                            y={y + 1}
                            width={1.02}
                            height={1.02}
                        />
                    ) : null
                )
            )}
        </svg>
    );
}
