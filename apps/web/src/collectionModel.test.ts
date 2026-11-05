import type { EntryDto } from '@gamequeue/shared';
import { describe, expect, it } from 'vitest';
import {
    apiParams,
    canQueue,
    defaultDensity,
    effectiveDensity,
    entryMetaParts,
    facetButtonLabel,
    hueOf,
    parseDensity,
    platformText,
    quickAction,
    showFacet,
    tabCounts,
    tabFromParams
} from './collectionModel';

const PC = { id: 6, name: 'PC (Microsoft Windows)', abbreviation: 'PC' };
const PS5 = { id: 167, name: 'PlayStation 5', abbreviation: 'PS5' };
const SW = { id: 130, name: 'Nintendo Switch', abbreviation: null };
const entry = (e: Partial<EntryDto>) =>
    ({
        status: 'unplayed',
        rating: null,
        ttbMinutes: null,
        lastFinishedOn: null,
        openPlaythrough: null,
        platforms: [PC],
        queued: false,
        ...e
    }) as unknown as EntryDto;

describe('tabs', () => {
    it('reads one status from the address, anything else is All', () => {
        expect(tabFromParams(new URLSearchParams('status=playing'))).toBe('playing');
        expect(tabFromParams(new URLSearchParams('status=unplayed'))).toBe('unplayed');
        expect(tabFromParams(new URLSearchParams('status=wishlist'))).toBe('wishlist');
        expect(tabFromParams(new URLSearchParams('status=playing&status=paused'))).toBe('all');
        expect(tabFromParams(new URLSearchParams('status=nope'))).toBe('all');
        expect(tabFromParams(new URLSearchParams(''))).toBe('all');
    });
    it('does not send the wishlist tab to the entries API, and sorts by recently added by default', () => {
        expect(apiParams(new URLSearchParams('status=wishlist&platform=6')).toString()).toBe(
            'platform=6&sort=added'
        );
        expect(apiParams(new URLSearchParams('status=playing&sort=title')).toString()).toBe(
            'status=playing&sort=title'
        );
    });
    it('counts: All is the sum of the statuses, and every status has a number', () => {
        const c = tabCounts(
            [
                { value: 'playing', count: 2 },
                { value: 'finished', count: 5 }
            ],
            3
        );
        expect(c).toMatchObject({
            all: 7,
            playing: 2,
            finished: 5,
            paused: 0,
            unplayed: 0,
            wishlist: 3
        });
        expect(tabCounts(undefined, undefined)).toEqual({});
    });
});

describe('density', () => {
    const desktop = { touch: false, narrow: false };
    it('defaults to the wall on desktop and the grid on touch or narrow screens', () => {
        expect(defaultDensity(desktop)).toBe('wall');
        expect(defaultDensity({ touch: true, narrow: false })).toBe('grid');
        expect(defaultDensity({ touch: false, narrow: true })).toBe('grid');
    });
    it('draws the grid in place of a saved wall where the wall cannot work, but keeps the choice', () => {
        expect(effectiveDensity('wall', { touch: true, narrow: false })).toBe('grid');
        expect(effectiveDensity('wall', desktop)).toBe('wall');
        expect(effectiveDensity('list', { touch: true, narrow: true })).toBe('list');
        expect(effectiveDensity(null, desktop)).toBe('wall');
        expect(parseDensity('wall')).toBe('wall');
        expect(parseDensity('x')).toBeNull();
    });
});

describe('entryMetaParts', () => {
    it('shows platforms and one fact for the state, never an invented number', () => {
        expect(entryMetaParts(entry({ platforms: [PC, PS5, SW] }))).toEqual(['PC / PS5 +1']);
        expect(entryMetaParts(entry({ ttbMinutes: 900 }))).toEqual(['PC', '~15h to beat']);
        expect(
            entryMetaParts(
                entry({
                    status: 'playing',
                    openPlaythrough: { loggedMinutes: 760 } as EntryDto['openPlaythrough']
                })
            )
        ).toEqual(['PC', '12h 40m logged']);
        // Playing with no hours logged: nothing about hours
        expect(
            entryMetaParts(
                entry({
                    status: 'playing',
                    openPlaythrough: { loggedMinutes: 0 } as EntryDto['openPlaythrough']
                })
            )
        ).toEqual(['PC']);
        expect(
            entryMetaParts(entry({ status: 'finished', lastFinishedOn: '2025-03-01', rating: 4 }))
        ).toEqual(['PC', 'Finished 2025', '★ 4']);
    });
    it('falls back to the full platform name', () => {
        expect(platformText([SW])).toBe('Nintendo Switch');
    });
});

describe('filters and actions', () => {
    it('hides a facet with one option unless something is selected', () => {
        expect(showFacet(1, 0)).toBe(false);
        expect(showFacet(2, 0)).toBe(true);
        expect(showFacet(1, 1)).toBe(true);
        expect(showFacet(0, 0)).toBe(false);
    });
    it('labels a filter button', () => {
        expect(facetButtonLabel('Platform', [])).toBe('Platform');
        expect(facetButtonLabel('Platform', ['PC'])).toBe('Platform: PC');
        expect(facetButtonLabel('Platform', ['PC', 'PS5'])).toBe('Platform: 2');
    });
    it('picks the quick action by state', () => {
        expect(quickAction('unplayed')).toBe('start');
        expect(quickAction('playing')).toBe('continue');
        expect(quickAction('paused')).toBe('resume');
        expect(quickAction('finished')).toBe('again');
        expect(quickAction('abandoned')).toBe('again');
    });
    it('offers the queue + only for games that are neither queued nor being played', () => {
        expect(canQueue({ queued: false, status: 'unplayed' })).toBe(true);
        expect(canQueue({ queued: true, status: 'unplayed' })).toBe(false);
        expect(canQueue({ queued: false, status: 'playing' })).toBe(false);
        expect(canQueue({ queued: false, status: 'finished' })).toBe(true);
    });
    it('gives the same name the same hue', () => {
        expect(hueOf('Hades')).toBe(hueOf('Hades'));
        expect(hueOf('Hades')).toBeGreaterThanOrEqual(0);
        expect(hueOf('Hades')).toBeLessThan(360);
    });
});
