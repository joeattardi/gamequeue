import { describe, expect, it } from 'vitest';
import { socialLinksSchema, socialUrl } from './social.js';

const empty = { steam: '', xbox: '', playstation: '', discord: '' };

describe('socialLinksSchema', () => {
    it('trims, strips a leading @ and turns empty into null', () => {
        const r = socialLinksSchema.parse({ ...empty, steam: ' gaben ', discord: '@some.one' });
        expect(r).toEqual({ steam: 'gaben', xbox: null, playstation: null, discord: 'some.one' });
    });

    it('accepts typical values', () => {
        expect(
            socialLinksSchema.safeParse({
                steam: '76561197960287930',
                xbox: 'Major Nelson#1234',
                playstation: 'Cool_Gamer-1',
                discord: 'old#0001'
            }).success
        ).toBe(true);
    });

    it('rejects anything that could break out of a link', () => {
        for (const bad of [
            'a/b',
            'x?y=1',
            'name<script>',
            'a b',
            'https://steamcommunity.com/id/x',
            'é'
        ]) {
            expect(socialLinksSchema.safeParse({ ...empty, steam: bad }).success).toBe(false);
        }
        expect(socialLinksSchema.safeParse({ ...empty, playstation: 'ab' }).success).toBe(false);
        expect(socialLinksSchema.safeParse({ ...empty, xbox: 'x'.repeat(16) }).success).toBe(false);
    });
});

describe('socialUrl', () => {
    it('builds profile links, encoding the value', () => {
        expect(socialUrl('steam', 'gaben')).toBe('https://steamcommunity.com/id/gaben');
        expect(socialUrl('steam', '76561197960287930')).toBe(
            'https://steamcommunity.com/profiles/76561197960287930'
        );
        expect(socialUrl('xbox', 'Major Nelson')).toBe(
            'https://account.xbox.com/en-us/profile?gamertag=Major%20Nelson'
        );
        expect(socialUrl('playstation', 'abc')).toBe('https://my.playstation.com/profile/abc');
    });
    it('has no link for Discord', () => {
        expect(socialUrl('discord', 'x')).toBeNull();
    });
});
