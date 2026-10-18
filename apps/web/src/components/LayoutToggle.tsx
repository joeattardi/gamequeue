import { LayoutGrid, List } from 'lucide-react';
import { useState } from 'react';

export type Layout = 'grid' | 'list';

/** The grid/list choice, remembered in localStorage under `storageKey`. */
export function useLayout(
    storageKey: string,
    fallback: Layout = 'grid'
): [Layout, (next: Layout) => void] {
    const [layout, setLayout] = useState<Layout>(() => {
        try {
            const saved = localStorage.getItem(storageKey);
            return saved === 'list' || saved === 'grid' ? saved : fallback;
        } catch {
            return fallback;
        }
    });
    const choose = (next: Layout) => {
        setLayout(next);
        try {
            localStorage.setItem(storageKey, next);
        } catch {
            // Not persisted (private window, blocked storage); the choice still applies.
        }
    };
    return [layout, choose];
}

export function LayoutToggle({
    layout,
    onChange
}: {
    layout: Layout;
    onChange: (next: Layout) => void;
}) {
    return (
        <div className="layout-toggle" role="group" aria-label="Layout">
            <button
                type="button"
                aria-pressed={layout === 'grid'}
                aria-label="Grid"
                title="Grid"
                onClick={() => onChange('grid')}
            >
                <LayoutGrid aria-hidden="true" />
            </button>
            <button
                type="button"
                aria-pressed={layout === 'list'}
                aria-label="List"
                title="List"
                onClick={() => onChange('list')}
            >
                <List aria-hidden="true" />
            </button>
        </div>
    );
}
