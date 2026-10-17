/**
 * Queue that starts at most `perSecond` requests per rolling second and keeps at most
 * `maxConcurrent` in flight (IGDB: 4 req/s, 8 open requests; checked against the docs).
 */
export class RequestLimiter {
  private queue: (() => void)[] = [];
  private starts: number[] = [];
  private inFlight = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private perSecond = 4,
    private maxConcurrent = 8,
    private now: () => number = Date.now,
  ) {}

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(() => {
        this.inFlight++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            this.inFlight--;
            this.pump();
          });
      });
      this.pump();
    });
  }

  private pump() {
    if (this.timer) return;
    while (this.queue.length > 0 && this.inFlight < this.maxConcurrent) {
      const t = this.now();
      this.starts = this.starts.filter((s) => t - s < 1000);
      if (this.starts.length >= this.perSecond) {
        const wait = 1000 - (t - this.starts[0]!);
        this.timer = setTimeout(() => {
          this.timer = undefined;
          this.pump();
        }, Math.max(wait, 1));
        return;
      }
      this.starts.push(t);
      this.queue.shift()!();
    }
  }
}
