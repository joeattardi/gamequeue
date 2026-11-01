import { formatBytes } from '../lib';

/** An amount used against a limit, as a bar; goes amber near the limit and red at it. */
export function StorageMeter({
    used,
    cap,
    label = 'Screenshot storage used',
    format = formatBytes
}: {
    used: number;
    cap: number;
    label?: string;
    format?: (n: number) => string;
}) {
    const ratio = cap > 0 ? Math.min(used / cap, 1) : used > 0 ? 1 : 0;
    const tier = ratio >= 1 ? 'full' : ratio >= 0.8 ? 'high' : 'ok';
    return (
        <div
            className={`meter meter--${tier}`}
            role="meter"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={cap}
            aria-valuenow={Math.min(used, cap)}
            aria-valuetext={`${format(used)} of ${format(cap)} used`}
        >
            <div className="meter__fill" style={{ width: `${Math.round(ratio * 100)}%` }} />
            <span className="meter__label">
                {Math.round(ratio * 100)}% of the limit ({format(used)} of {format(cap)})
            </span>
        </div>
    );
}
