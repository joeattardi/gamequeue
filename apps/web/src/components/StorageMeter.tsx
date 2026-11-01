import { formatBytes } from '../lib';

/** Space used against a limit, as a bar; goes amber near the limit and red at it. */
export function StorageMeter({ used, cap }: { used: number; cap: number }) {
    const ratio = cap > 0 ? Math.min(used / cap, 1) : used > 0 ? 1 : 0;
    const tier = ratio >= 1 ? 'full' : ratio >= 0.85 ? 'high' : 'ok';
    return (
        <div
            className={`meter meter--${tier}`}
            role="meter"
            aria-label="Screenshot storage used"
            aria-valuemin={0}
            aria-valuemax={cap}
            aria-valuenow={Math.min(used, cap)}
            aria-valuetext={`${formatBytes(used)} of ${formatBytes(cap)} used`}
        >
            <div className="meter__fill" style={{ width: `${Math.round(ratio * 100)}%` }} />
            <span className="meter__label">
                {Math.round(ratio * 100)}% of the limit ({formatBytes(used)} of {formatBytes(cap)})
            </span>
        </div>
    );
}
