import { useGameOffers } from '../api/collection';
import { formatPrice } from '../lib';

function OffersSkeleton() {
    return (
        <section className="panel" role="status" aria-label="Loading prices">
            <span className="skeleton skeleton--line skeleton--panel-title" aria-hidden="true" />
            <ul className="offers" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                    <li key={i} className="offers__row">
                        <span className="skeleton skeleton--line" style={{ width: '40%' }} />
                        <span className="skeleton skeleton--line" style={{ width: '20%' }} />
                    </li>
                ))}
            </ul>
        </section>
    );
}

/** Every shop's current price for a game, from IsThereAnyDeal. Hidden when the server has no key. */
export function GameOffers({ igdbId }: { igdbId: number }) {
    const q = useGameOffers(igdbId);
    if (q.isPending) return <OffersSkeleton />;
    if (q.data && !q.data.enabled) return null;
    const offers = q.data?.offers;
    const money = (n: number) => formatPrice(n, offers?.currency ?? 'USD');
    return (
        <section aria-labelledby="offers-h" className="panel stack">
            <h2 id="offers-h">Prices</h2>
            {q.isError ? (
                <p className="muted">Couldn't load prices right now.</p>
            ) : !offers ? (
                <p className="muted">No shop lists a price for this game.</p>
            ) : (
                <>
                    <ul className="offers">
                        {offers.deals.map((d) => (
                            <li key={`${d.shop}-${d.url}`} className="offers__row">
                                <span className="offers__shop">
                                    <a
                                        href={d.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label={`${d.shop}: ${money(d.amount)}${
                                            d.cut ? `, ${d.cut}% off` : ''
                                        } (opens in a new tab)`}
                                    >
                                        {d.shop}
                                    </a>
                                    {d.platforms.length > 0 && (
                                        <span className="muted"> · {d.platforms.join(', ')}</span>
                                    )}
                                </span>
                                <span className="offers__price">
                                    {d.cut > 0 && (
                                        <span className="price-line__cut">
                                            −{d.cut}% <s className="muted">{money(d.regular)}</s>
                                        </span>
                                    )}
                                    <strong>{money(d.amount)}</strong>
                                </span>
                            </li>
                        ))}
                    </ul>
                    <p className="muted price-credit">
                        {offers.historyLow !== null &&
                            `Lowest price ever: ${money(offers.historyLow)}. `}
                        Prices from{' '}
                        <a
                            href="https://isthereanydeal.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            IsThereAnyDeal
                        </a>
                        .
                    </p>
                </>
            )}
        </section>
    );
}
