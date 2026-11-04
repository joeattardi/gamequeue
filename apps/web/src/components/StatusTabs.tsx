import { TABS, type TabKey } from '../collectionModel';
import { statusColor } from '../statusColor';

/**
 * The Collection's status tabs with counts. The active one is a filled light pill; each carries its
 * status colour as a dot and the word as text (colour is never the only cue).
 */
export function StatusTabs({
    active,
    counts,
    onPick
}: {
    active: TabKey;
    counts: Partial<Record<TabKey, number>>;
    onPick: (tab: TabKey) => void;
}) {
    return (
        <div className="status-tabs" role="group" aria-label="Status">
            {TABS.map((t) => (
                <button
                    key={t.key}
                    type="button"
                    className="status-tab"
                    aria-pressed={active === t.key}
                    onClick={() => onPick(t.key)}
                >
                    {t.key !== 'all' && (
                        <span
                            className="status-tab__dot"
                            style={{ background: statusColor(t.key) }}
                            aria-hidden="true"
                        />
                    )}
                    {t.label}
                    <span className="status-tab__count">
                        {counts[t.key] === undefined ? '' : counts[t.key]!.toLocaleString()}
                    </span>
                </button>
            ))}
        </div>
    );
}

/** Placeholder tabs while the first counts load. */
export function StatusTabsSkeleton() {
    return (
        <div className="status-tabs" role="status" aria-label="Loading status tabs">
            {TABS.map((t) => (
                <span
                    key={t.key}
                    className="skeleton status-tab status-tab--skeleton"
                    aria-hidden="true"
                />
            ))}
        </div>
    );
}
