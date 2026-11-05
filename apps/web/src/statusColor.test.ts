import { ENTRY_STATUSES } from '@gamequeue/shared';
import { describe, expect, it } from 'vitest';
import { statusColor, statusColorOnCover, statusText } from './statusColor';

describe('statusColor', () => {
    it('maps every state to its own token', () => {
        const colors = [...ENTRY_STATUSES, 'wishlist' as const].map(statusColor);
        expect(new Set(colors).size).toBe(colors.length);
        expect(statusColor('unplayed')).toBe('var(--status-notstarted)');
        expect(statusColor('playing')).toBe('var(--status-playing)');
        expect(statusColor('wishlist')).toBe('var(--status-wishlist)');
    });
    it('has a brighter variant for use over cover art', () => {
        expect(statusColorOnCover('finished')).toBe('var(--status-finished-bright)');
        expect(statusColorOnCover('unplayed')).toBe('var(--status-notstarted-bright)');
    });
    it('has a text label for each state', () => {
        expect(statusText('unplayed')).toBe('Not Started');
        expect(statusText('wishlist')).toBe('Wishlist');
        expect(statusText('finished')).toBe('Finished');
    });
});
