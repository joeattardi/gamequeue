import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Place {
    left: number;
    top: number;
}

const OPEN_DELAY = 250;
/** After one tooltip closes, the next opens at once, like moving along a toolbar */
const GRACE = 400;
let lastClosed = 0;

/**
 * A rich tooltip beside its child (to the right, for the collapsed sidebar). It wraps the child in a
 * `display: contents` span, so layout is untouched, and listens for hover and keyboard focus on it.
 * It is drawn in a portal with fixed positioning because the sidebar clips its overflow. It is
 * `aria-hidden`: the child must already have its own accessible name.
 */
export function Tooltip({
    label,
    detail,
    shortcut,
    enabled = true,
    children
}: {
    label: string;
    /** A second, quieter line */
    detail?: string;
    /** A key to show as a keycap */
    shortcut?: string;
    enabled?: boolean;
    children: ReactNode;
}) {
    const anchor = useRef<HTMLSpanElement>(null);
    const timer = useRef<number | undefined>(undefined);
    const [place, setPlace] = useState<Place | null>(null);

    const hide = useCallback(() => {
        window.clearTimeout(timer.current);
        setPlace((p) => {
            if (p) lastClosed = Date.now();
            return null;
        });
    }, []);

    const show = useCallback(
        (immediate: boolean) => {
            if (!enabled) return;
            window.clearTimeout(timer.current);
            const open = () => {
                const el = anchor.current?.firstElementChild;
                if (!el) return;
                const r = el.getBoundingClientRect();
                setPlace({ left: r.right + 12, top: r.top + r.height / 2 });
            };
            if (immediate || Date.now() - lastClosed < GRACE) open();
            else timer.current = window.setTimeout(open, OPEN_DELAY);
        },
        [enabled]
    );

    // Gone when the sidebar expands, the page scrolls or Escape is pressed
    useEffect(() => {
        if (!enabled) hide();
    }, [enabled, hide]);
    useEffect(() => {
        if (!place) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide();
        window.addEventListener('keydown', onKey);
        window.addEventListener('scroll', hide, true);
        window.addEventListener('resize', hide);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('scroll', hide, true);
            window.removeEventListener('resize', hide);
        };
    }, [place, hide]);
    useEffect(() => () => window.clearTimeout(timer.current), []);

    return (
        <span
            ref={anchor}
            className="tip-anchor"
            onMouseEnter={() => show(false)}
            onMouseLeave={hide}
            onFocus={(e) => e.target.matches(':focus-visible') && show(true)}
            onBlur={hide}
            onClick={hide}
        >
            {children}
            {place
                ? createPortal(
                      <div
                          className="tip"
                          style={{ left: place.left, top: place.top }}
                          aria-hidden="true"
                      >
                          <span className="tip__label">{label}</span>
                          {detail ? <span className="tip__detail">{detail}</span> : null}
                          {shortcut ? <kbd className="tip__key">{shortcut}</kbd> : null}
                      </div>,
                      document.body
                  )
                : null}
        </span>
    );
}
