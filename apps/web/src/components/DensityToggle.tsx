import { Grid3x3, LayoutGrid, List } from 'lucide-react';
import type { Density } from '../collectionModel';

const OPTIONS: { value: Density; label: string; icon: typeof List }[] = [
    { value: 'wall', label: 'Wall', icon: Grid3x3 },
    { value: 'grid', label: 'Grid', icon: LayoutGrid },
    { value: 'list', label: 'List', icon: List }
];

/** Wall, Grid or List. The wall needs hover and room, so it is left out where it can't work. */
export function DensityToggle({
    density,
    onChange,
    wallAvailable
}: {
    density: Density;
    onChange: (next: Density) => void;
    wallAvailable: boolean;
}) {
    return (
        <div className="density" role="group" aria-label="View">
            {OPTIONS.filter((o) => wallAvailable || o.value !== 'wall').map(
                ({ value, label, icon: Icon }) => (
                    <button
                        key={value}
                        type="button"
                        aria-pressed={density === value}
                        title={label}
                        onClick={() => onChange(value)}
                    >
                        <Icon aria-hidden="true" />
                        <span className="density__label">{label}</span>
                    </button>
                )
            )}
        </div>
    );
}
