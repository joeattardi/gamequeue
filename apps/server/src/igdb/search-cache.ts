/** Tiny TTL + size-bounded cache so repeated/debounced searches don't spend IGDB quota. */
export class TtlCache<V> {
    private map = new Map<string, { value: V; expiresAt: number }>();
    constructor(
        private ttlMs = 5 * 60_000,
        private maxSize = 200,
        private now: () => number = Date.now
    ) {}

    get(key: string): V | undefined {
        const hit = this.map.get(key);
        if (!hit) return undefined;
        if (hit.expiresAt <= this.now()) {
            this.map.delete(key);
            return undefined;
        }
        return hit.value;
    }

    set(key: string, value: V) {
        this.map.delete(key);
        this.map.set(key, { value, expiresAt: this.now() + this.ttlMs });
        if (this.map.size > this.maxSize) this.map.delete(this.map.keys().next().value!);
    }
}
