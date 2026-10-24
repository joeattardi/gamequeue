import type { SimilarGameDto } from '@gamequeue/shared';
import { Link } from 'react-router';
import { useSimilarGames } from '../api/collection';
import { Cover } from './Cover';

function SimilarSkeleton() {
    return (
        <section className="panel stack" role="status" aria-label="Loading similar games">
            <span className="skeleton skeleton--line skeleton--panel-title" aria-hidden="true" />
            <ul className="grid similar" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                    <li key={i} className="card card--skeleton">
                        <span className="skeleton skeleton--card-cover" />
                    </li>
                ))}
            </ul>
        </section>
    );
}

function SimilarCard({ game: g }: { game: SimilarGameDto }) {
    // Games you don't own have no page of their own: the IGDB page is where they get added
    const to = g.entryId ? `/games/${g.entryId}` : `/games/igdb/${g.igdbId}`;
    const state = g.entryId ? 'In collection' : g.wishlisted ? 'On wishlist' : null;
    return (
        <li className="card">
            <Link to={to} className="card__link">
                <div className="card__art">
                    <Cover imageId={g.coverImageId} name={g.name} size="cover_big" />
                </div>
                <span className="similar__title card__title">{g.name}</span>
                <span className="muted card__sub">
                    {[g.year, state].filter(Boolean).join(' · ')}
                </span>
            </Link>
        </li>
    );
}

/** Games IGDB lists as similar to this one. Hidden when it lists none or can't be reached. */
export function SimilarGames({ igdbId }: { igdbId: number }) {
    const q = useSimilarGames(igdbId);
    if (q.isPending) return <SimilarSkeleton />;
    if (q.isError || !q.data || q.data.length === 0) return null;
    return (
        <section aria-labelledby="similar-h" className="panel stack">
            <h2 id="similar-h">Similar games</h2>
            <ul className="grid similar">
                {q.data.map((g) => (
                    <SimilarCard key={g.igdbId} game={g} />
                ))}
            </ul>
        </section>
    );
}
