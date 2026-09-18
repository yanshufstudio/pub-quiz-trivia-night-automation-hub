import { Redis } from "@upstash/redis";

/**
 * A hard ceiling on how many packs the whole deployment will generate in a
 * day, enforced before the model is called.
 *
 * The per-creator free cap (FREE_PACK_LIMIT, src/lib/creator.ts) is voluntary
 * in the only sense that matters to a bill: it is counted against a cookie,
 * and a request that sends no cookie is handed a brand-new Creator with a
 * fresh allowance. Deleting the cookie resets it; never sending one skips it
 * entirely. The per-IP limiter on the generate route bounds one address to 5
 * per 10 minutes — about 720 a day, per address — which is a throttle, not a
 * ceiling. Nothing stopped the Anthropic bill growing without limit.
 *
 * This is the thing that actually stops it. It is deliberately dumb: one
 * global counter per plan per UTC day, checked before any spend, with no
 * per-user dimension at all. A cheat cannot get around it by rotating
 * cookies, because there is no identity in the key.
 *
 * FREE and PRO count in separate buckets, so free traffic can never exhaust
 * a paying customer's capacity. Pro has no per-user cap — "as many quiz packs
 * as you want" on /pricing stays literally true — and its ceiling exists only
 * as a backstop against a runaway loop, set far above any real usage.
 */

export const DEFAULT_FREE_DAILY_CEILING = 50;
export const DEFAULT_PRO_DAILY_CEILING = 200;

export const FREE_CEILING_ENV = "FREE_DAILY_PACK_CEILING";
export const PRO_CEILING_ENV = "PRO_DAILY_PACK_CEILING";

/**
 * Anything that isn't a non-negative integer falls back to the documented
 * default rather than propagating — the same rule (and the same reason) as
 * parseFreeLimit in creator.ts. `Number("")` is 0 and `Number("fifty")` is
 * NaN; a typo'd value must not silently become a ceiling of zero, which would
 * take generation down for everybody.
 *
 * Note 0 is a legitimate value, and means "generate nothing" — a deliberate
 * kill switch, reachable only by setting the variable to an explicit "0".
 */
export function parseCeiling(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}

/**
 * Read per request, not once at module load. The ceiling is a lever the owner
 * reaches for when something is going wrong, and re-reading it costs nothing
 * next to the model call it guards — so a changed value takes hold as soon as
 * the platform hands it to a new process, with no code change and no rebuild.
 * (FREE_PACK_LIMIT is read at load *on purpose*, for the opposite reason: it
 * must not move under a creator part-way through a 30-day period.)
 */
export function dailyCeilingFor(plan: string): number {
  return plan === "PRO"
    ? parseCeiling(process.env[PRO_CEILING_ENV], DEFAULT_PRO_DAILY_CEILING)
    : parseCeiling(process.env[FREE_CEILING_ENV], DEFAULT_FREE_DAILY_CEILING);
}

/**
 * Upstash when configured, an in-process Map otherwise — the same arrangement
 * as src/lib/rate-limit.ts, and with the same caveat, which matters more here:
 * without Upstash each serverless instance keeps its own counter, so the
 * "global" ceiling is really N ceilings and bounds the bill N times less
 * tightly. This is a cost control, so set UPSTASH_REDIS_REST_URL/TOKEN in
 * production and treat the fallback as a local-dev convenience.
 */
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
    : null;

const memoryCounters = new Map<string, { count: number; resetAt: number }>();

/** Exposed for tests: the fallback store is module-level and outlives a test. */
export function __resetMemoryCounters() {
  memoryCounters.clear();
}

function bucketFor(plan: string): "PRO" | "FREE" {
  return plan === "PRO" ? "PRO" : "FREE";
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Whole seconds until the next UTC midnight — the counter's TTL, and what a
 * refused caller is told to wait. Never zero: a Retry-After of 0 invites an
 * immediate retry. */
function secondsUntilUtcMidnight(now: Date): number {
  const nextMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((nextMidnight - now.getTime()) / 1000));
}

export type DailyReservation = {
  allowed: boolean;
  limit: number;
  /** How many of today's allowance are spoken for, capped at `limit`. */
  used: number;
  retryAfterSeconds: number;
  /** Hand back an allowance that was reserved but not spent. Safe to call
   * more than once and safe to call on a refused reservation, where it is a
   * no-op. */
  release: () => Promise<void>;
};

const NO_OP_RELEASE = async () => {};

/**
 * Take one unit of today's allowance for `plan`, before the model is called.
 *
 * Reserving up front rather than counting afterwards is the whole point: a
 * generation takes several seconds, and a count kept after the fact lets any
 * number of concurrent requests through on the strength of the same stale
 * read. Whatever does not end up spent is handed back with `release`.
 */
export async function reserveDailyGeneration(plan: string, now: Date = new Date()): Promise<DailyReservation> {
  const limit = dailyCeilingFor(plan);
  const key = `generate:daily:${bucketFor(plan)}:${utcDay(now)}`;
  const ttlSeconds = secondsUntilUtcMidnight(now);

  // A ceiling of zero refuses without touching the counter at all.
  if (limit === 0) {
    return { allowed: false, limit, used: 0, retryAfterSeconds: ttlSeconds, release: NO_OP_RELEASE };
  }

  const count = redis
    ? await incrementRedis(redis, key, ttlSeconds)
    : incrementMemory(key, ttlSeconds, now);

  if (count > limit) {
    // Over the line: give the unit straight back, so a refused request does
    // not push the counter further past the ceiling on every retry.
    await releaseOne(key, ttlSeconds);
    return { allowed: false, limit, used: limit, retryAfterSeconds: ttlSeconds, release: NO_OP_RELEASE };
  }

  let released = false;
  return {
    allowed: true,
    limit,
    used: count,
    retryAfterSeconds: 0,
    release: async () => {
      if (released) return;
      released = true;
      await releaseOne(key, ttlSeconds);
    },
  };
}

async function incrementRedis(client: Redis, key: string, ttlSeconds: number): Promise<number> {
  const count = await client.incr(key);
  // Only the request that created the key sets its lifetime. Re-expiring on
  // every call would slide the window forward and the counter would never
  // roll over on a busy day.
  if (count === 1) await client.expire(key, ttlSeconds);
  return count;
}

function incrementMemory(key: string, ttlSeconds: number, now: Date): number {
  const bucket = memoryCounters.get(key);
  if (!bucket || bucket.resetAt <= now.getTime()) {
    memoryCounters.set(key, { count: 1, resetAt: now.getTime() + ttlSeconds * 1000 });
    return 1;
  }
  bucket.count += 1;
  return bucket.count;
}

/** Never lets a counter go negative: an expired key would otherwise come back
 * as -1 and hand out a day's worth of free generations.
 *
 * The repair SET carries the expiry explicitly. Upstash's SET drops whatever
 * TTL the key had unless told otherwise, and the INCR path only sets one when
 * it sees count === 1 — so a bare SET here would leave today's counter with no
 * expiry at all, immortal in Redis once the day rolls over. */
async function releaseOne(key: string, ttlSeconds: number): Promise<void> {
  if (redis) {
    const count = await redis.decr(key);
    if (count < 0) await redis.set(key, 0, { ex: ttlSeconds });
    return;
  }
  const bucket = memoryCounters.get(key);
  if (bucket && bucket.count > 0) bucket.count -= 1;
}
