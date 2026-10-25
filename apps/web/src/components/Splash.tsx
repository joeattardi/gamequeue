import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { LOGO_BARS, LOGO_BODY, LOGO_DPAD, LOGO_VIEWBOX } from '@gamequeue/shared';

/**
 * The full-page gamepad loader. Same markup and classes as the inline splash in `index.html` (whose
 * CSS it reuses), so the hand-over from the static splash to this one is invisible: `--splash-t`
 * skips the animations ahead by the time already spent loading instead of restarting them.
 */
export function Splash({ leaving, onDone }: { leaving?: boolean; onDone?: () => void } = {}) {
    const elapsed = (typeof performance === 'undefined' ? 0 : performance.now()) / 1000;
    const splash = (
        <div
            className={leaving ? 'splash splash--leaving' : 'splash'}
            role={leaving ? undefined : 'status'}
            aria-label={leaving ? undefined : 'Loading GameQueue'}
            aria-hidden={leaving ? true : undefined}
            style={{ '--splash-t': `${elapsed.toFixed(2)}s` } as CSSProperties}
            onAnimationEnd={(e) => {
                // The veil's own fade is the last animation to finish
                if (leaving && e.target === e.currentTarget) onDone?.();
            }}
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
    // Leaving, it hangs over the page as a veil; outside #root, which fades in beneath it
    return leaving ? createPortal(splash, document.body) : splash;
}

/**
 * The hand-over from the loader to the app: the controller shrinks and fades out, then the veil
 * lifts as the page (`#root`, via `.root-enter`) fades in. Skipped when the loader was never
 * visible (it only appears after 0.25s, so a fast load shows no flash) and under reduced motion.
 */
export function useSplashExit(ready: boolean) {
    const [leaving, setLeaving] = useState(false);
    const started = useRef(false);
    useLayoutEffect(() => {
        if (!ready || started.current) return;
        started.current = true;
        const seen = performance.now() > 400;
        const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!seen || still) return;
        document.getElementById('root')?.classList.add('root-enter');
        setLeaving(true);
    }, [ready]);
    const finish = useCallback(() => {
        document.getElementById('root')?.classList.remove('root-enter');
        setLeaving(false);
    }, []);
    return { leaving, finish };
}
