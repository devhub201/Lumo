import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter, rateLimitConfig } from "./rateLimit";

describe("FixedWindowRateLimiter", () => {
  it("allows up to max hits per window, then blocks with retry info", () => {
    let now = 1_000;
    const limiter = new FixedWindowRateLimiter({
      windowMs: 60_000,
      max: 3,
      now: () => now,
    });
    expect(limiter.hit("a").allowed).toBe(true);
    expect(limiter.hit("a").allowed).toBe(true);
    const third = limiter.hit("a");
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    const blocked = limiter.hit("a");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(60_000);
    now += 10_000;
    expect(limiter.hit("a").retryAfterMs).toBe(50_000);
  });

  it("tracks keys independently and resets after the window", () => {
    let now = 0;
    const limiter = new FixedWindowRateLimiter({
      windowMs: 1_000,
      max: 1,
      now: () => now,
    });
    expect(limiter.hit("a").allowed).toBe(true);
    expect(limiter.hit("a").allowed).toBe(false);
    expect(limiter.hit("b").allowed).toBe(true);
    now = 1_000;
    expect(limiter.hit("a").allowed).toBe(true);
  });

  it("keeps memory bounded when many distinct keys arrive", () => {
    const limiter = new FixedWindowRateLimiter({
      windowMs: 60_000,
      max: 5,
      maxKeys: 100,
    });
    for (let i = 0; i < 1_000; i += 1) limiter.hit(`key-${i}`);
    expect(limiter.size).toBeLessThanOrEqual(100);
  });
});

describe("rateLimitConfig", () => {
  it("clamps unreasonable environment values", () => {
    const previous = process.env.LUMO_RATE_LIMIT_EXPENSIVE_PER_MIN;
    process.env.LUMO_RATE_LIMIT_EXPENSIVE_PER_MIN = "99999999";
    expect(rateLimitConfig().expensivePerMinute).toBe(10_000);
    process.env.LUMO_RATE_LIMIT_EXPENSIVE_PER_MIN = "garbage";
    expect(rateLimitConfig().expensivePerMinute).toBe(30);
    if (previous === undefined)
      delete process.env.LUMO_RATE_LIMIT_EXPENSIVE_PER_MIN;
    else process.env.LUMO_RATE_LIMIT_EXPENSIVE_PER_MIN = previous;
  });
});
