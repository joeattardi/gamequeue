/** In-memory failure counter with a fixed window. Fine for a single-process deployment. */
export class FailureLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private max: number,
    private windowMs: number,
    private clock: () => number = Date.now,
  ) {}

  /** Seconds until retry is allowed, or 0 if the key may proceed. */
  retryAfter(key: string): number {
    const h = this.hits.get(key);
    if (!h) return 0;
    if (h.resetAt <= this.clock()) {
      this.hits.delete(key);
      return 0;
    }
    return h.count >= this.max ? Math.ceil((h.resetAt - this.clock()) / 1000) : 0;
  }

  fail(key: string) {
    const t = this.clock();
    const h = this.hits.get(key);
    if (!h || h.resetAt <= t) this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
    else h.count++;
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
  }

  reset(key: string) {
    this.hits.delete(key);
  }
}
