/**
 * Small in-memory fixed-window rate limiter (no dependency).
 *
 * Scope: a single server process. Counters live in memory and reset on
 * restart; behind multiple replicas each replica limits independently. That is
 * acceptable for Phase 1; a shared store can replace `hit` later without
 * changing callers.
 */
export type RateLimitOptions = {
  windowMs: number;
  max: number;
  /** Upper bound on tracked keys so memory stays bounded. */
  maxKeys?: number;
  now?: () => number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();
  private readonly maxKeys: number;
  private readonly now: () => number;

  constructor(private readonly options: RateLimitOptions) {
    this.maxKeys = options.maxKeys ?? 10_000;
    this.now = options.now ?? Date.now;
  }

  hit(key: string): RateLimitResult {
    const now = this.now();
    let entry = this.windows.get(key);
    if (!entry || entry.resetAt <= now) {
      this.evictIfNeeded(now);
      entry = { count: 0, resetAt: now + this.options.windowMs };
      this.windows.set(key, entry);
    }
    entry.count += 1;
    const allowed = entry.count <= this.options.max;
    return {
      allowed,
      remaining: Math.max(0, this.options.max - entry.count),
      retryAfterMs: allowed ? 0 : Math.max(0, entry.resetAt - now),
    };
  }

  get size() {
    return this.windows.size;
  }

  private evictIfNeeded(now: number) {
    if (this.windows.size < this.maxKeys) return;
    for (const [key, entry] of this.windows) {
      if (entry.resetAt <= now) this.windows.delete(key);
    }
    // Still full of live windows: drop the oldest insertions.
    while (this.windows.size >= this.maxKeys) {
      const oldest = this.windows.keys().next().value;
      if (oldest === undefined) break;
      this.windows.delete(oldest);
    }
  }
}

const clampInt = (raw: string | undefined, fallback: number, min: number, max: number) => {
  const value = Number(raw);
  return Number.isFinite(value) && value >= min
    ? Math.min(Math.floor(value), max)
    : fallback;
};

/** Limits are env-tunable but always clamped to sane bounds. */
export const rateLimitConfig = () => ({
  ipPerMinute: clampInt(process.env.LUMO_RATE_LIMIT_IP_PER_MIN, 600, 10, 100_000),
  authPerMinute: clampInt(process.env.LUMO_RATE_LIMIT_AUTH_PER_MIN, 30, 5, 10_000),
  expensivePerMinute: clampInt(
    process.env.LUMO_RATE_LIMIT_EXPENSIVE_PER_MIN,
    30,
    1,
    10_000
  ),
});

type RequestLike = {
  ip?: string;
  socket?: { remoteAddress?: string };
};

export const clientKey = (req: RequestLike | undefined) =>
  req?.ip || req?.socket?.remoteAddress || "unknown";
