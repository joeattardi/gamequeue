import { Globe, Joystick } from 'lucide-react';
import { platformIconFor } from '../platformIcons';
import { ICON_PATHS } from '../platformIconPaths';
import { platformLabel } from '../lib';

type Platform = { id: number; name: string; abbreviation: string | null };

/** Decorative brand glyph for a platform; renders nothing when we have none for it. */
export function PlatformIcon({ platform }: { platform: Platform }) {
    const icon = platformIconFor(platform.id);
    if (!icon) return null;
    if (icon === 'globe') return <Globe className="platform-icon" aria-hidden="true" />;
    if (icon === 'joystick') return <Joystick className="platform-icon" aria-hidden="true" />;
    return (
        <svg className="platform-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d={ICON_PATHS[icon]} />
        </svg>
    );
}

/** A platform's icon plus its short name; the full name is the tooltip. */
export function PlatformTag({ platform }: { platform: Platform }) {
    return (
        <span className="platform-tag" title={platform.name}>
            <PlatformIcon platform={platform} />
            <span>{platformLabel(platform)}</span>
        </span>
    );
}

export function PlatformTags({ platforms }: { platforms: Platform[] }) {
    if (platforms.length === 0) return null;
    return (
        <span className="platform-tags">
            {platforms.map((p) => (
                <PlatformTag key={p.id} platform={p} />
            ))}
        </span>
    );
}
