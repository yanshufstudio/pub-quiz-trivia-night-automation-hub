import { Redis } from "@upstash/redis";

/**
 * The one fixed-window counter this app keeps, and the one Upstash client it
 * builds.
 *
 * Two things count against a window: the per-request limiter
 * (src/lib/rate-limit.ts, which Better Auth's limiter also runs on) and the
 * daily generation ceiling (src/lib/daily-ceiling.ts). They used to carry a
 * copy each of the client construction, the in-process Map fallback and the
 * INCR/EXPIRE body — so a process built two Redis clients against one
 * instance, and any fix to the shared mechanism had to be made twice and
 * could be made once. This is that mechanism, once.
 *
 * Upstash when UPSTASH_REDIS_REST_URL/TOKEN are set: a real shared store, so
 * a window is counted across every serverless instance. An in-process Map
 * otherwise, which is fine for local dev and the test suites and wrong for a
 * multi-instance deploy — each instance keeps its own count and a cold start
 * wipes it. For the daily ceiling that means "20 a day" is really 20 a day
 * *per instance*, which is why production must set both variables.
 */
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
    : null;

export type FixedWindowCounter = {
  /**
   * Count one against `key` and return the new count. The request that opens
   * a window is the only one that sets how long it lasts; every other hit
   * leaves the expiry alone. Re-expiring on each hit would slide the window
   * forward, and on a busy key it would never roll over.
   *
   * `nowMs` only matters to the in-process fallback (Redis keeps its own
   * clock). It is a parameter so a caller that reasons about a specific
   * moment — the daily ceiling works in UTC days — counts against the same
   * moment it computed its key and window from.
   */
  hit(key: string, windowMs: number, nowMs?: number): Promise<number>;

  /**
   * Whole seconds until `key`'s window closes: what a refused caller is told
   * to wait. Never less than one, because a Retry-After of 0 invites an
   * immediate retry.
   */
  secondsLeft(key: string, nowMs?: number): Promise<number>;

  /**
   * Give one back, never taking a count below zero.
   *
   * In Redis a key that has already expired comes back from DECR as -1 — a
   * negative count that would hand out an extra window's worth of allowance.
   * The repair SET carries the expiry explicitly: Upstash's SET drops any TTL
   * the key had unless told otherwise, and `hit` only sets one on a count of
   * 1, so a bare SET here would leave the key with no expiry at all —
   * immortal once its window had passed.
   */
  release(key: string, windowMs: number): Promise<void>;

  /** For tests: the fallback store is module-level and outlives a test. Only
   * this counter's keys are cleared; another counter's are untouched. */
  resetMemory(): void;
};

/**
 * A counter. Each one has its own in-process fallback store — so resetting
 * one in a test never resets another's — and they all share the single Redis
 * client above, where the keys they build are already namespaced
 * (`ratelimit:…`, `better-auth:…`, `generate:daily:…`).
 */
export function createFixedWindowCounter(): FixedWindowCounter {
  const memory = new Map<string, { count: number; resetAt: number }>();

  return {
    async hit(key, windowMs, nowMs = Date.now()) {
      if (redis) {
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, windowSecondsFor(windowMs));
        return count;
      }
      const bucket = memory.get(key);
      if (!bucket || bucket.resetAt <= nowMs) {
        memory.set(key, { count: 1, resetAt: nowMs + windowMs });
        return 1;
      }
      bucket.count += 1;
      return bucket.count;
    },

    async secondsLeft(key, nowMs = Date.now()) {
      if (redis) return Math.max(await redis.ttl(key), 1);
      const bucket = memory.get(key);
      if (!bucket) return 1;
      return Math.max(Math.ceil((bucket.resetAt - nowMs) / 1000), 1);
    },

    async release(key, windowMs) {
      if (redis) {
        const count = await redis.decr(key);
        if (count < 0) await redis.set(key, 0, { ex: windowSecondsFor(windowMs) });
        return;
      }
      const bucket = memory.get(key);
      if (bucket && bucket.count > 0) bucket.count -= 1;
    },

    resetMemory() {
      memory.clear();
    },
  };
}

/** Redis expiries are whole seconds; a window is rounded up, never down, so a
 * window of 1.5s is not shortened to 1s. */
function windowSecondsFor(windowMs: number): number {
  return Math.ceil(windowMs / 1000);
}
