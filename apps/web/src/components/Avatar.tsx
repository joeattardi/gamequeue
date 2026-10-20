import { useState, type CSSProperties } from 'react';
import { AVATAR_GRID, avatarUrl, generateIdenticon } from '@gamequeue/shared';

/**
 * The user's uploaded image when they have one (`avatarUpdatedAt` set), else an identicon generated
 * from the username. Decorative: the username is always shown beside it.
 */
export function Avatar({
    username,
    size = 32,
    avatarUpdatedAt = null
}: {
    username: string;
    size?: number;
    avatarUpdatedAt?: number | null;
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
