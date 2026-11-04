import { Ellipsis } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** A "•••" button with a small menu of actions. Escape and a click outside close it. */
export function ActionMenu({ label, children }: { label: string; children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const button = useRef<HTMLButtonElement>(null);
    const panelId = useId();
    useEffect(() => {
        if (!open) return;
        const onPointer = (e: PointerEvent) => {
            if (!root.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            setOpen(false);
            button.current?.focus();
        };
        document.addEventListener('pointerdown', onPointer);
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('pointerdown', onPointer);
            document.removeEventListener('keydown', onKey, true);
        };
    }, [open]);
    return (
        <div
            ref={root}
            className="amenu"
            onBlur={(e) => {
                if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node))
                    setOpen(false);
            }}
        >
            <button
                ref={button}
                type="button"
                className="btn amenu__btn"
                aria-label={label}
                aria-haspopup="true"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen((o) => !o)}
            >
                <Ellipsis aria-hidden="true" />
            </button>
            {open && (
                <div
                    className="amenu__panel"
                    id={panelId}
                    onClick={() => setOpen(false)}
                    onMouseDown={(e) => e.preventDefault()}
                >
                    {children}
                </div>
            )}
        </div>
    );
}
