import type { CSSProperties } from 'react';
import { LOGO_BARS, LOGO_BODY, LOGO_DPAD, LOGO_VIEWBOX } from '@gamequeue/shared';

/**
 * The full-page gamepad loader. Same markup and classes as the inline splash in `index.html` (whose
 * CSS it reuses), so the hand-over from the static splash to this one is invisible: `--splash-t`
 * skips the animations ahead by the time already spent loading instead of restarting them.
 */
export function Splash() {
    const elapsed = (typeof performance === 'undefined' ? 0 : performance.now()) / 1000;
    return (
        <div
            className="splash"
            role="status"
            aria-label="Loading GameQueue"
            style={{ '--splash-t': `${elapsed.toFixed(2)}s` } as CSSProperties}
        >
            <svg viewBox={LOGO_VIEWBOX} aria-hidden="true">
                <mask id="splash-cut">
                    <path d={LOGO_BODY} fill="#fff" />
                    <path d={LOGO_DPAD} fill="#000" />
                    {LOGO_BARS.map((d, i) => (
                        <path key={i} className={`bar-${i}`} d={d} fill="#000" />
                    ))}
                </mask>
                <rect x="-2" y="-1" width="68" height="68" mask="url(#splash-cut)" />
            </svg>
        </div>
    );
}
