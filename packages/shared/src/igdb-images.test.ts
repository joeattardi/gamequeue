import { describe, expect, it } from 'vitest';
import { coverSrcSet, coverUrl, IGDB_IMAGE_ID, screenshotUrl } from './igdb-images.js';

describe('cover images', () => {
    it('builds IGDB image urls from an image id', () => {
        expect(coverUrl('abc123')).toBe(
            'https://images.igdb.com/igdb/image/upload/t_cover_big/abc123.jpg'
        );
        expect(coverUrl('abc123', '1080p')).toBe(
            'https://images.igdb.com/igdb/image/upload/t_1080p/abc123.jpg'
        );
    });

    it('offers a sharper image for high-density screens', () => {
        expect(coverSrcSet('x', 'cover_big')).toBe(
            `${coverUrl('x', 'cover_big')} 1x, ${coverUrl('x', 'cover_big_2x')} 2x`
        );
        expect(coverSrcSet('x', 'cover_small')).toContain(' 2x');
        expect(coverSrcSet('x', '720p')).toBe(
            `${coverUrl('x', '720p')} 1x, ${coverUrl('x', '1080p')} 2x`
        );
        // defaults to cover_big
        expect(coverSrcSet('x')).toBe(coverSrcSet('x', 'cover_big'));
    });

    it('keeps a stored id inside one path segment, so it can never add a srcset candidate', () => {
        const evil = 'x 1x, https://attacker.example/i.png?';
        const set = coverSrcSet(evil)!;
        expect(set.split(', ')).toHaveLength(2);
        expect(set).not.toContain('https://attacker.example');
        expect(screenshotUrl('a/../b')).toBe(
            'https://images.igdb.com/igdb/image/upload/t_screenshot_big/a%2F..%2Fb.jpg'
        );
    });

    it('describes what an IGDB image id looks like', () => {
        for (const ok of ['co1wyy', 'puvydf5d6v0zirxfhzpg'])
            expect(IGDB_IMAGE_ID.test(ok)).toBe(true);
        for (const bad of ['', 'CO1', 'co 1', 'co1,x', 'a/b', 'x'.repeat(41)])
            expect(IGDB_IMAGE_ID.test(bad), bad).toBe(false);
    });

    it('has no retina step for sizes that are already the largest or are not covers', () => {
        expect(coverSrcSet('x', '1080p')).toBeUndefined();
        expect(coverSrcSet('x', 'cover_big_2x')).toBeUndefined();
        expect(coverSrcSet('x', 'thumb')).toBeUndefined();
    });
});
