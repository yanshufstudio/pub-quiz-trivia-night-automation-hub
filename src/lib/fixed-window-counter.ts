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
 *
 * Upstash being unreachable is not this module's decision to make. On 27 Sep a
 * bad token turned every Redis call into a throw, the throw travelled out
 * through Better Auth's rate-limit storage, and /api/auth/get-session answered
 * 500 — so nobody could sign in because the *rate limiter* was broken. The two
 * call sites want opposite things from that failure (the limiter should let
 * traffic through, the cost ceiling must not), so the counter raises a
 * CounterUnavailableError and each caller chooses. What it must never do is
 * return a number it did not get from the store.
 */

/**
 * How long one command may take before it counts as unavailable, and how many
 * times it is tried.
 *
 * Failing open kept the site *answering* during the 27 Sep outage, but it did
 * not keep it quick. Measured against an Upstash host that refuses connections:
 * `/api/auth/get-session` took **4.34s**, three times running, and the paths
 * that consult two counters (a sign-in code, a generation) took **8.67s** —
 * because the client's default is five attempts with an exponential backoff, so
 * every request paid the full retry budget before the throw this module turns
 * into unavailability. That is the difference between "the limiter is down" and
 * "the site is down": eight seconds is a user giving up, and it is close enough
 * to a platform function timeout that a request could be cut off instead of
 * failing open, which would undo the whole point.
 *
 * So: one retry, a short backoff, and a hard deadline per attempt. The worst
 * case is about 1.1s per command rather than 4.3s, and a request consulting two
 * counters about 2.2s rather than 8.7s.
 *
 * The number is a lever, not a law — UPSTASH_COMMAND_TIMEOUT_MS — because the
 * cost of getting it wrong is not symmetric. Too long and an outage is slow
 * again; too short and a *working but slow* Upstash is treated as absent, which
 * for the rate limiter means losing abuse protection and for the daily ceiling
 * means refusing generation (it fails closed). 500ms is many times a healthy
 * round trip from a serverless region and well short of the timeouts above; a
 * deploy that sees `ratelimit-redis-error` without an outage should raise it
 * rather than remove it.
 */
export const COMMAND_TIMEOUT_ENV = "UPSTASH_COMMAND_TIMEOUT_MS";
export const DEFAULT_COMMAND_TIMEOUT_MS = 500;
const COMMAND_RETRIES = 1;
const RETRY_BACKOFF_MS = 100;

/** Anything that is not a positive integer falls back to the default, the same
 * rule the ceilings use: a typo must not become a timeout of zero, which would
 * make every command fail. */
export function commandTimeoutMs(raw: string | undefined = process.env[COMMAND_TIMEOUT_ENV]): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_COMMAND_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_COMMAND_TIMEOUT_MS;
  return parsed;
}

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
        retry: { retries: COMMAND_RETRIES, backoff: () => RETRY_BACKOFF_MS },
        // A function, not a signal: the client calls it per request
        // (`signal: isSignalFunction ? signal() : signal` in its requester), so
        // each command gets its own fresh deadline. One shared AbortSignal would
        // fire once and then abort every later command for the life of the
        // process. The abort surfaces here as a throw like any other, which
        // viaRedis turns into CounterUnavailableError — so each caller keeps the
        // fail-open or fail-closed choice it already made, just sooner. The
        // timeout is read per call for the same reason the ceilings are.
        signal: () => AbortSignal.timeout(commandTimeoutMs()),
      })
    : null;

/**
 * The store could not answer. Carries the operation that failed and the
 * original error as `cause`, so a log line says which command died without
 * the caller having to guess.
 */
export class CounterUnavailableError extends Error {
  readonly operation: string;

  constructor(operation: string, cause: unknown) {
    super(`fixed-window counter unavailable during ${operation}`, { cause });
    this.name = "CounterUnavailableError";
    this.operation = operation;
  }
}

/**
 * Recognise the error above without relying on `instanceof`.
 *
 * The test suites re-import this module through `vi.resetModules()`, which can
 * leave two copies of the class in one process — and `instanceof` is false
 * across them. A caller that missed the match would rethrow and 500, which is
 * the exact bug this is all here to prevent, so the name is checked too.
 */
export function isCounterUnavailable(error: unknown): error is CounterUnavailableError {
  return (
    error instanceof CounterUnavailableError ||
    (error instanceof Error && error.name === "CounterUnavailableError")
  );
}

/** Run a Redis command, reporting any failure as unavailability. */
async function viaRedis<T>(operation: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    throw new CounterUnavailableError(operation, cause);
  }
}

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
   *
   * Throws CounterUnavailableError if the store could not be reached.
   */
  hit(key: string, windowMs: number, nowMs?: number): Promise<number>;

  /**
   * Whole seconds until `key`'s window closes: what a refused caller is told
   * to wait. Never less than one, because a Retry-After of 0 invites an
   * immediate retry.
   *
   * Throws CounterUnavailableError if the store could not be reached.
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
   *
   * Throws CounterUnavailableError if the store could not be reached. A caller
   * handing back an allowance it no longer needs generally wants to swallow
   * that: the work it was reserved for has already succeeded.
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
        return viaRedis("hit", async () => {
          const count = await redis.incr(key);
          if (count === 1) {
            try {
              await redis.expire(key, windowSecondsFor(windowMs));
            } catch (cause) {
              // INCR landed and EXPIRE did not, so the key now exists with no
              // TTL — and an expiry is only ever set on a count of 1, so
              // nothing would set one again. The key would be immortal: the
              // daily ceiling, which fails closed, would refuse generation
              // for good rather than for a moment. Drop it so the next window
              // opens clean, then report the failure.
              try {
                await redis.del(key);
              } catch {
                // Best effort. Already reporting unavailability.
              }
              throw cause;
            }
          }
          return count;
        });
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
      if (redis) return viaRedis("secondsLeft", async () => Math.max(await redis.ttl(key), 1));
      const bucket = memory.get(key);
      if (!bucket) return 1;
      return Math.max(Math.ceil((bucket.resetAt - nowMs) / 1000), 1);
    },

    async release(key, windowMs) {
      if (redis) {
        return viaRedis("release", async () => {
          const count = await redis.decr(key);
          if (count < 0) await redis.set(key, 0, { ex: windowSecondsFor(windowMs) });
        });
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
