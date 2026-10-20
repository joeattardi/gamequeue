import type { CSSProperties } from 'react';
import { AVATAR_GRID, generateIdenticon } from '@gamequeue/shared';

/** Identicon generated from the username. Decorative: the username is always shown beside it. */
export function Avatar({ username, size = 32 }: { username: string; size?: number }) {
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
