import { ChevronRight } from 'lucide-react';

/** A collapsible group of checkboxes (any-of choices); the summary shows how many are ticked. */
export function Chips({
    legend,
    items,
    selected,
    onToggle
}: {
    legend: string;
    items: { key: number | string; label: string }[] | undefined;
    selected: Set<number | string> | Set<number> | Set<string>;
    onToggle: (key: number | string) => void;
}) {
    if (!items?.length) return null;
    return (
        <details className="chip-group">
            <summary className="chip-group__summary">
                <ChevronRight aria-hidden="true" />
                <span className="field-legend">{legend}</span>
                {selected.size > 0 && (
                    <span className="chip-group__count">{selected.size} selected</span>
                )}
            </summary>
            <fieldset className="checks">
                <legend className="sr-only">{legend}</legend>
                {items.map((i) => (
                    <label key={i.key} className="check">
                        <input
                            type="checkbox"
                            checked={(selected as Set<number | string>).has(i.key)}
                            onChange={() => onToggle(i.key)}
                        />
                        {i.label}
                    </label>
                ))}
            </fieldset>
        </details>
    );
}
