import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import {
    SOCIAL_LABELS,
    SOCIAL_SERVICES,
    socialUrl,
    type SocialLinks,
    type SocialService
} from '@gamequeue/shared';
import { DISCORD_PATH, ICON_PATHS } from '../platformIconPaths';

const PATHS: Record<SocialService, string> = {
    steam: ICON_PATHS.steam,
    xbox: ICON_PATHS.xbox,
    playstation: ICON_PATHS.playstation,
    discord: DISCORD_PATH
};

export function Glyph({ service }: { service: SocialService }) {
    return (
        <svg className="social__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d={PATHS[service]} />
        </svg>
    );
}

/** Discord has no profile URL by name, so it is a button that copies the username. */
function CopyChip({ service, value }: { service: SocialService; value: string }) {
    const [copied, setCopied] = useState(false);
    async function copy() {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard blocked: the username is still on screen to copy by hand
        }
    }
    return (
        <button
            type="button"
            className="social"
            onClick={copy}
            title={`Copy ${SOCIAL_LABELS[service].name} username`}
        >
            <Glyph service={service} />
            <span>{value}</span>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            <span className="sr-only" role="status">
                {copied ? 'Copied' : ''}
            </span>
        </button>
    );
}

/** Links to a user's gaming accounts; renders nothing when none are set. */
export function SocialLinksList({ links }: { links: SocialLinks }) {
    const set = SOCIAL_SERVICES.filter((s) => links[s]);
    if (set.length === 0) return null;
    return (
        <ul className="socials" aria-label="Gaming accounts">
            {set.map((service) => {
                const value = links[service]!;
                const url = socialUrl(service, value);
                return (
                    <li key={service}>
                        {url ? (
                            <a
                                className="social"
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`${SOCIAL_LABELS[service].name} profile (opens in a new tab)`}
                            >
                                <Glyph service={service} />
                                <span>{value}</span>
                            </a>
                        ) : (
                            <CopyChip service={service} value={value} />
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
