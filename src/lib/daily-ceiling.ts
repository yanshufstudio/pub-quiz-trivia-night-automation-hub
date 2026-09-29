import { createFixedWindowCounter, isCounterUnavailable } from "@/lib/fixed-window-counter";

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
 * a paying customer's capacity. Pro has no per-user cap — /pricing says "Pro
 * lifts the 2-pack limit" and names this service-wide daily safety limit
 * (planning, 25 Sep: "as many as you want" overclaimed) — and its ceiling
 * exists only as a backstop against a runaway loop, set far above real usage.
 */

/**
 * Set to the owner's API budget, not to a guess at demand. Measured in ACC5
 * for Opus 5.5 generating and checking, a pack costs about $0.075 on average
 * and $0.136 for five rounds of ten, so 20 + 50 is about $5 a day, or $9.50
 * if every pack were that large. A pack whose every call ran to its 16k
 * max_tokens, retried once, could cost about $1.40; these ceilings are what
 * bound that. The defaults exist so that a deploy which forgets
 * the environment variables is still bounded by something the owner has
 * agreed to pay, rather than by a number that merely sounded cautious.
 */
export const DEFAULT_FREE_DAILY_CEILING = 20;
export const DEFAULT_PRO_DAILY_CEILING = 50;

export const FREE_CEILING_ENV = "FREE_DAILY_PACK_CEILING";
export const PRO_CEILING_ENV = "PRO_DAILY_PACK_CEILING";

/**
 * What a visitor is told when the counter itself is unreachable, as opposed to
 * reached and over its ceiling. It says "for a moment" because that is the
 * honest shape of the failure — an Upstash outage, not an exhausted allowance
 * — and it deliberately does not mention limits, quotas or accounts, none of
 * which are the reason.
 */
export const CEILING_UNAVAILABLE_MESSAGE =
  "Pack generation is paused for a moment — please try again shortly.";

/**
 * How long a refused-because-unavailable caller is told to wait. Not the time
 * until midnight, which is what an exhausted ceiling returns: nothing about
 * this failure is tied to the day boundary, and telling someone to come back
 * in nine hours because a cache blinked would be wrong.
 */
export const CEILING_UNAVAILABLE_RETRY_SECONDS = 30;

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

/** Exported so the per-user Pro counter (src/lib/pro-limits.ts) cuts its day
 * at exactly the same boundary this ceiling does. Two definitions of "today"
 * would eventually disagree, and the one a host is refused by would not be the
 * one the message names. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Whole seconds until the next UTC midnight — the counter's TTL, and what a
 * refused caller is told to wait. Never zero: a Retry-After of 0 invites an
 * immediate retry. Shared with src/lib/pro-limits.ts, as above. */
export function secondsUntilUtcMidnight(now: Date): number {
  const nextMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((nextMidnight - now.getTime()) / 1000));
}

export type DailyReservation = {
  allowed: boolean;
  limit: number;
  /** How many of today's allowance are spoken for, capped at `limit`. */
  used: number;
  retryAfterSeconds: number;
  /**
   * True when the refusal means "we could not count", not "you are over the
   * ceiling". The two need different words and different status codes — a
   * 503 that says come back shortly, against a refusal that says come back
   * tomorrow — and only this flag can tell them apart. Never true when
   * `allowed`.
   */
  unavailable?: boolean;
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

  let count: number;
  try {
    count = await counter.hit(key, windowMs, now.getTime());
  } catch (error) {
    if (!isCounterUnavailable(error)) throw error;
    // Fail closed, unlike the rate limiter (src/lib/rate-limit.ts), and for a
    // reason that is not symmetry: this is the only thing standing between a
    // runaway loop and the Anthropic bill. Letting generation through while
    // the counter is away would mean no ceiling at all for the length of the
    // outage, and the spend it would authorise cannot be taken back. A
    // visitor turned away for a few minutes can come back.
    console.error(
      "daily-ceiling-redis-error: refusing generation because the shared daily counter is unreachable — " +
        "nothing can be counted, so nothing is spent",
      error
    );
    return {
      allowed: false,
      limit,
      used: 0,
      retryAfterSeconds: CEILING_UNAVAILABLE_RETRY_SECONDS,
      unavailable: true,
      release: NO_OP_RELEASE,
    };
  }

  if (count > limit) {
    // Over the line: give the unit straight back, so a refused request does
    // not push the counter further past the ceiling on every retry. If the
    // store dies between the hit and the give-back the refusal still stands —
    // the caller is over the ceiling either way, and turning that into a
    // thrown error would answer a plain "too many" with a 500.
    try {
      await counter.release(key, windowMs);
    } catch (error) {
      if (!isCounterUnavailable(error)) throw error;
    }
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
      // A give-back that cannot be made is not worth failing the request
      // over: by the time this runs the generation it was reserved for has
      // already been decided, and the key expires at midnight regardless. The
      // whole cost of swallowing it is one unit of today's allowance left
      // reserved against work that did not happen.
      try {
        await counter.release(key, windowMs);
      } catch (error) {
        if (!isCounterUnavailable(error)) throw error;
      }
    },
  };
}
