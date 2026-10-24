import { Sparkles } from 'lucide-react';
import { useId, useMemo, useState, type KeyboardEvent } from 'react';

/** `text` with the first case-insensitive match of `query` in bold. */
function Highlighted({ text, query }: { text: string; query: string }) {
    const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
    if (at === -1) return <>{text}</>;
    return (
        <>
            {text.slice(0, at)}
            <mark>{text.slice(at, at + query.length)}</mark>
            {text.slice(at + query.length)}
        </>
    );
}

/**
 * A text field with a styled list of suggestions under it (the native `<datalist>` can't be
 * styled). Suggestions filter as you type; arrows move, Enter picks, Esc closes the list. Any text
 * is still allowed. `exclude` hides suggestions that are already taken.
 */
export function LabelCombobox({
    label,
    value,
    onChange,
    suggestions,
    exclude = [],
    maxLength,
    placeholder
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    suggestions: readonly string[];
    exclude?: readonly string[];
    maxLength?: number;
    placeholder?: string;
}) {
    const id = useId();
    const listId = `${id}-list`;
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);

    const options = useMemo(() => {
        const q = value.trim().toLowerCase();
        const taken = new Set(exclude.map((e) => e.toLowerCase()));
        return suggestions.filter((s) => {
            const lower = s.toLowerCase();
            return lower !== q && !taken.has(lower) && lower.includes(q);
        });
    }, [value, suggestions, exclude]);
    const shown = open && options.length > 0;

    const pick = (s: string) => {
        onChange(s);
        setOpen(false);
        setActive(-1);
    };

    function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (options.length === 0) return;
            e.preventDefault();
            setOpen(true);
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setActive((a) => (a + step + options.length) % options.length);
        } else if (e.key === 'Enter' && shown && active >= 0) {
            e.preventDefault();
            pick(options[active]!);
        } else if (e.key === 'Escape' && shown) {
            // Closes the list, not the dialog around it
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            setActive(-1);
        }
    }

    return (
        <div className="field combo">
            <label htmlFor={id}>{label}</label>
            <input
                id={id}
                role="combobox"
                aria-expanded={shown}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={shown && active >= 0 ? `${id}-${active}` : undefined}
                autoComplete="off"
                value={value}
                maxLength={maxLength}
                placeholder={placeholder}
                onChange={(e) => {
                    onChange(e.target.value);
                    setOpen(true);
                    setActive(-1);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => {
                    setOpen(false);
                    setActive(-1);
                }}
                onKeyDown={onKeyDown}
            />
            {shown && (
                <div className="combo__popup">
                    <div className="combo__head" aria-hidden="true">
                        <Sparkles /> Suggestions
                    </div>
                    <ul id={listId} role="listbox" aria-label={`${label} suggestions`}>
                        {options.map((s, i) => (
                            <li
                                key={s}
                                id={`${id}-${i}`}
                                role="option"
                                aria-selected={i === active}
                                className={
                                    i === active ? 'combo__option is-active' : 'combo__option'
                                }
                                // mousedown, not click: the input must keep focus or blur closes the list first
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    pick(s);
                                }}
                                onMouseMove={() => setActive(i)}
                            >
                                <Highlighted text={s} query={value.trim()} />
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
