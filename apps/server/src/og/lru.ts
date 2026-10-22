/** Least-recently-used cache: a Map keeps insertion order, so re-inserting on read moves a key to the back. */
export class LruCache<K, V> {
    private readonly items = new Map<K, V>();

    constructor(private readonly max: number) {}

    get(key: K): V | undefined {
        const value = this.items.get(key);
        if (value === undefined) return undefined;
        this.items.delete(key);
        this.items.set(key, value);
        return value;
    }

    set(key: K, value: V): void {
        this.items.delete(key);
        this.items.set(key, value);
        if (this.items.size > this.max) this.items.delete(this.items.keys().next().value as K);
    }

    get size() {
        return this.items.size;
    }
}
