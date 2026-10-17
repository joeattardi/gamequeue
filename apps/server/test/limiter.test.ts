import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestLimiter } from "../src/igdb/limiter.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("RequestLimiter", () => {
  it("starts at most 4 requests per second", async () => {
    const limiter = new RequestLimiter(4, 8);
    const startedAt: number[] = [];
    const t0 = Date.now();
    const all = Promise.all(
      Array.from({ length: 10 }, () =>
        limiter.schedule(async () => {
          startedAt.push(Date.now() - t0);
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(3000);
    await all;
    expect(startedAt).toHaveLength(10);
    expect(startedAt.filter((t) => t < 1000)).toHaveLength(4);
    expect(startedAt.filter((t) => t >= 1000 && t < 2000)).toHaveLength(4);
    expect(startedAt.filter((t) => t >= 2000)).toHaveLength(2);
  });

  it("never has more than the max in flight", async () => {
    const limiter = new RequestLimiter(100, 2);
    let inFlight = 0;
    let peak = 0;
    const all = Promise.all(
      Array.from({ length: 6 }, () =>
        limiter.schedule(async () => {
          peak = Math.max(peak, ++inFlight);
          await new Promise((r) => setTimeout(r, 50));
          inFlight--;
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(1000);
    await all;
    expect(peak).toBe(2);
  });

  it("propagates rejections without stalling the queue", async () => {
    const limiter = new RequestLimiter(4, 1);
    const bad = limiter.schedule(async () => {
      throw new Error("boom");
    });
    const good = limiter.schedule(async () => "ok");
    await expect(bad).rejects.toThrow("boom");
    await expect(good).resolves.toBe("ok");
  });
});
