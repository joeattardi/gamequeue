import { useEffect, useId, useRef, useState } from 'react';

/**
 * Text cut to a few lines with a "Read more" toggle. The toggle only shows when the text really is
 * cut (measured, and again when the width changes), so a short description has no button.
 */
export function ClampedText({ text, lines = 4 }: { text: string; lines?: number }) {
    const ref = useRef<HTMLParagraphElement>(null);
    const id = useId();
    const [expanded, setExpanded] = useState(false);
    const [cut, setCut] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const measure = () => {
            if (!expanded) setCut(el.scrollHeight > el.clientHeight + 1);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [text, lines, expanded]);
    return (
        <div className="clamped">
            <p
                ref={ref}
                id={id}
                className={expanded ? 'clamped__text' : 'clamped__text clamped__text--cut'}
                style={{ '--lines': lines } as React.CSSProperties}
            >
                {text}
            </p>
            {(cut || expanded) && (
                <button
                    type="button"
                    className="clamped__toggle"
                    aria-expanded={expanded}
                    aria-controls={id}
                    onClick={() => setExpanded((v) => !v)}
                >
                    {expanded ? 'Show less' : 'Read more'}
                </button>
            )}
        </div>
    );
}
