/** The cheapest current price of a game at ITAD; amounts are minor units (cents). */
export interface ItadPrice {
    currency: string;
    amount: number;
    regular: number;
    cut: number;
    shop: string;
    url: string;
    historyLow: number | null;
}

/** The slice of the IsThereAnyDeal API this app uses; faked in tests. */
export interface ItadClient {
    /** Country the prices are for; cached prices for another country are stale */
    readonly country: string;
    /** ITAD's id for a game with exactly this title, or null when it has none. */
    lookup(title: string): Promise<string | null>;
    /** Cheapest current price per ITAD id; null when no shop sells the game. */
    prices(ids: string[]): Promise<Map<string, ItadPrice | null>>;
}

export class ItadError extends Error {
    constructor(
        message: string,
        readonly status: number | null = null
    ) {
        super(message);
    }
}
