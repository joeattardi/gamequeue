/**
 * The GameQueue mark: a controller whose face buttons are a queue (three bars, longest next).
 * One drawing on a 64x64 grid, shared by the web app (sidebar, favicon, loader, share images) and
 * the server's link-preview cards. Fill `LOGO_PATH` with the `evenodd` rule: the d-pad and the bars
 * are holes in the body, so the mark takes whatever colour sits behind it.
 */

const BODY =
    'M20 12H44A12 12 0 0 1 55.9 22.4L59.5 43A8 8 0 0 1 45.9 49.6L40.5 44A4 4 0 0 0 37.6 42.8H26.4A4 4 0 0 0 23.5 44L18.1 49.6A8 8 0 0 1 4.5 43L8.1 22.4A12 12 0 0 1 20 12Z';
export const LOGO_DPAD = 'M16.5 20h5v4.5H26v5h-4.5V34h-5v-4.5H12v-5h4.5z';
/** The queue, first in line on top. Each is its own path so a loader can light them one by one. */
export const LOGO_BARS = ['M40 22h12v3H40z', 'M40 28h9v3H40z', 'M40 34h6v3H40z'] as const;

export const LOGO_BODY = BODY;
export const LOGO_PATH = [BODY, LOGO_DPAD, ...LOGO_BARS].join('');
/** Tight around the controller with a little air, for use without a tile. */
export const LOGO_VIEWBOX = '-2 -1 68 68';
