import { Link, useSearchParams } from 'react-router';
import { useGameSearch } from '../api/collection';
import { ApiRequestError } from '../api/client';
import { Cover } from '../components/Cover';
import { MetaLine } from '../components/MetaLine';
import { PlatformTags } from '../components/PlatformIcon';
import { ResultSkeletons } from '../components/ResultSkeletons';
import { ScoreGauge } from '../components/ScoreGauge';
import { useDebounced, usePageTitle } from '../lib';
import { Search, SearchX } from 'lucide-react';

/** Searches IGDB; each result opens that game's page, owned or not. The query lives in the URL. */
export function SearchPage() {
    usePageTitle('Search');
    const [params, setParams] = useSearchParams();
    const text = params.get('q') ?? '';
    const q = useDebounced(text.trim(), 300);
    const search = useGameSearch(q);
    const searching = text.trim().length >= 2 && (search.isFetching || q !== text.trim());
    const noResults = !searching && !search.isError && search.data?.length === 0 && q.length >= 2;
    const status =
        text.trim().length < 2
            ? 'Type at least 2 characters.'
            : searching
              ? 'Searching…'
              : search.isError
                ? search.error instanceof ApiRequestError
                    ? search.error.message
                    : 'Search failed.'
                : noResults
                  ? 'No games found.'
                  : '';

    return (
        <section className="search-page">
            <div className="page-head">
                <div>
                    <h1>
                        <Search aria-hidden="true" />
                        Search
                    </h1>
                    <p className="muted">Find any game on IGDB and see where it stands with you.</p>
                </div>
            </div>
            <label className="field">
                <span>Search IGDB</span>
                <input
                    type="search"
                    value={text}
                    onChange={(e) =>
                        setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })
                    }
                    autoFocus
                    autoComplete="off"
                    placeholder="e.g. Hades"
                />
            </label>
            <div aria-live="polite" className="sr-only">
                {status}
            </div>
            {search.isError && !searching && (
                <p className="form-error" role="alert">
                    {status}
                </p>
            )}
            <ul className="results" aria-busy={searching}>
                {searching && <ResultSkeletons />}
                {noResults && (
                    <li className="empty-state" aria-hidden="true">
                        <span className="empty-state__icon">
                            <SearchX />
                        </span>
                        <strong>No games found for “{q}”</strong>
                        <span className="muted">
                            Check the spelling, or try a shorter or simpler title.
                        </span>
                    </li>
                )}
                {!searching &&
                    search.data?.map((r) => (
                        <li key={r.igdbId}>
                            <Link
                                className="result"
                                to={
                                    r.entryId !== null
                                        ? `/games/${r.entryId}`
                                        : `/games/igdb/${r.igdbId}`
                                }
                            >
                                <Cover imageId={r.coverImageId} name={r.name} size="cover_big" />
                                <span className="result__text">
                                    <strong>{r.name}</strong>
                                    <span className="muted">
                                        <MetaLine
                                            parts={[
                                                r.year,
                                                <PlatformTags
                                                    key="p"
                                                    platforms={r.platforms.slice(0, 4)}
                                                />
                                            ]}
                                        />
                                    </span>
                                </span>
                                {r.entryId !== null ? (
                                    <span className="badge">In collection</span>
                                ) : (
                                    r.wishlisted && <span className="badge">On wishlist</span>
                                )}
                                <span className="result__score">
                                    {r.igdbRating !== null && (
                                        <ScoreGauge value={r.igdbRating} label="IGDB" size={56} />
                                    )}
                                </span>
                            </Link>
                        </li>
                    ))}
            </ul>
        </section>
    );
}
