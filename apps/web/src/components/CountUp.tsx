import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './motion';

const DURATION_MS = 700;

/** A whole value that is one number, optionally grouped or with decimals, and an optional unit. */
const COUNT = /^(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\s?[A-Za-z%]+)?$/;

export interface ParsedCount {
    n: number;
    decimals: number;
    grouped: boolean;
    unit: string;
}

/**
 * Reads a figure such as `42`, `1,234`, `4.2` or `12.5 MB`. Anything else (a dash, `3d 4h`, a date)
 * is null, and is shown as it is without counting.
 */
export function parseCount(text: string): ParsedCount | null {
    const m = COUNT.exec(text);
    if (!m) return null;
    const [, whole = '', fraction = '', unit = ''] = m;
    return {
        n: Number(whole.replaceAll(',', '') + fraction),
        decimals: fraction ? fraction.length - 1 : 0,
        grouped: whole.includes(','),
        unit
    };
}

/** `x` written the way the parsed figure was. */
export function formatCount(x: number, p: ParsedCount): string {
    return (
        x.toLocaleString('en-US', {
            minimumFractionDigits: p.decimals,
            maximumFractionDigits: p.decimals,
            useGrouping: p.grouped
        }) + p.unit
    );
}

/**
 * A stat figure that counts up from zero when it first appears, and from the old value when it
 * changes. The final text is always exactly `value`; screen readers only ever get that.
 */
export function CountUp({ value }: { value: string | number }) {
    const text = String(value);
    const [shown, setShown] = useState(() => {
        const parsed = parseCount(text);
        return parsed && !prefersReducedMotion() ? formatCount(0, parsed) : text;
    });
    const from = useRef(0);

    useEffect(() => {
        const parsed = parseCount(text);
        if (!parsed || prefersReducedMotion()) {
            setShown(text);
            return;
        }
        const start = performance.now();
        const a = from.current;
        let frame = requestAnimationFrame(function tick(now) {
            const t = Math.min(1, (now - start) / DURATION_MS);
            if (t < 1) {
                const eased = 1 - (1 - t) ** 3;
                setShown(formatCount(a + (parsed.n - a) * eased, parsed));
                frame = requestAnimationFrame(tick);
            } else {
                from.current = parsed.n;
                setShown(text);
            }
        });
        return () => cancelAnimationFrame(frame);
    }, [text]);

    return (
        <>
            <span aria-hidden="true">{shown}</span>
            <span className="sr-only">{text}</span>
        </>
    );
}
