import { z } from 'zod';

/** Gaming accounts a user can list on their profile. */
export const SOCIAL_SERVICES = ['steam', 'xbox', 'playstation', 'discord'] as const;
export type SocialService = (typeof SOCIAL_SERVICES)[number];
export type SocialLinks = Record<SocialService, string | null>;

export const SOCIAL_LABELS: Record<SocialService, { name: string; field: string; hint: string }> = {
    steam: {
        name: 'Steam',
        field: 'Steam ID or custom URL name',
        hint: 'The end of your steamcommunity.com/id/… address'
    },
    xbox: { name: 'Xbox', field: 'Xbox gamertag', hint: 'Your gamertag, e.g. Major Nelson' },
    playstation: { name: 'PlayStation', field: 'PSN ID', hint: 'Your PlayStation Network ID' },
    discord: {
        name: 'Discord',
        field: 'Discord username',
        hint: 'Shown as text to copy: Discord has no public profile links by name'
    }
};

/** What each service accepts. Strict on purpose: values end up in links on a public page. */
const PATTERNS: Record<SocialService, { re: RegExp; message: string }> = {
    // Custom URL name (2-32) or a 17-digit SteamID64
    steam: {
        re: /^(?:[A-Za-z0-9_-]{2,32}|\d{17})$/,
        message:
            'Steam names use 2-32 letters, numbers, underscores or hyphens (or a 17-digit Steam ID)'
    },
    xbox: {
        re: /^[A-Za-z0-9][A-Za-z0-9 ]{0,14}(?:#\d{1,6})?$/,
        message: 'Xbox gamertags use up to 15 letters, numbers or spaces (optionally with #1234)'
    },
    playstation: {
        re: /^[A-Za-z][A-Za-z0-9_-]{2,15}$/,
        message: 'PSN IDs use 3-16 letters, numbers, underscores or hyphens, starting with a letter'
    },
    discord: {
        re: /^[A-Za-z0-9_.]{2,32}(?:#\d{4})?$/,
        message: 'Discord usernames use 2-32 letters, numbers, underscores or dots'
    }
};

const socialField = (service: SocialService) =>
    z
        .string()
        .trim()
        .transform((s) => s.replace(/^@/, '').replace(/\s+/g, ' '))
        .refine((s) => s === '' || PATTERNS[service].re.test(s), PATTERNS[service].message)
        .transform((s) => (s === '' ? null : s));

export const socialLinksSchema = z.object({
    steam: socialField('steam'),
    xbox: socialField('xbox'),
    playstation: socialField('playstation'),
    discord: socialField('discord')
});
export type SocialLinksInput = z.infer<typeof socialLinksSchema>;

/** Public profile address for an account, or null when there is none (Discord). */
export function socialUrl(service: SocialService, value: string): string | null {
    const v = encodeURIComponent(value);
    switch (service) {
        case 'steam':
            return /^\d{17}$/.test(value)
                ? `https://steamcommunity.com/profiles/${v}`
                : `https://steamcommunity.com/id/${v}`;
        case 'xbox':
            return `https://account.xbox.com/en-us/profile?gamertag=${v}`;
        case 'playstation':
            return `https://profile.playstation.com/${v}`;
        case 'discord':
            return null;
    }
}
