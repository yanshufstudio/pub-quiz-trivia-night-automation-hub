import { createFixedWindowCounter } from "@/lib/fixed-window-counter";

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

/**
 * Set to the owner's API budget, not to a guess at demand: at roughly $0.18
 * for a pack that runs to the full 16k max_tokens, 20 + 50 is about $12.60 of
 * worst-case spend a day. The defaults exist so that a deploy which forgets
 * the environment variables is still bounded by something the owner has
 * agreed to pay, rather than by a number that merely sounded cautious.
 */
export const DEFAULT_FREE_DAILY_CEILING = 20;
export const DEFAULT_PRO_DAILY_CEILING = 50;

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
 * Upstash when configured, an in-process Map otherwise — the counter and the
 * client are shared with src/lib/rate-limit.ts (src/lib/fixed-window-counter.ts),
 * and the caveat matters more here: without Upstash each serverless instance
 * keeps its own counter, so the "global" ceiling is really N ceilings and
 * bounds the bill N times less tightly. This is a cost control, so set
 * UPSTASH_REDIS_REST_URL/TOKEN in production and treat the fallback as a
 * local-dev convenience.
 */
const counter = createFixedWindowCounter();

/** Exposed for tests: the fallback store is module-level and outlives a test. */
export function __resetMemoryCounters() {
  counter.resetMemory();
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

  const windowMs = ttlSeconds * 1000;
  const count = await counter.hit(key, windowMs, now.getTime());

  if (count > limit) {
    // Over the line: give the unit straight back, so a refused request does
    // not push the counter further past the ceiling on every retry.
    await counter.release(key, windowMs);
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
      await counter.release(key, windowMs);
    },
  };
}
