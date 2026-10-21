import type { SeriesRefDto } from '@gamequeue/shared';
import { Link } from 'react-router';

/** "Series: The Witcher" under a game's title, each linking to the series page. */
export function SeriesLinks({ series }: { series: SeriesRefDto[] }) {
    if (series.length === 0) return null;
    return (
        <p className="muted series-links">
            Series:{' '}
            {series.map((s, i) => (
                <span key={s.id}>
                    {i > 0 && ', '}
                    <Link to={`/series/${s.id}`}>{s.name}</Link>
                </span>
            ))}
        </p>
    );
}
