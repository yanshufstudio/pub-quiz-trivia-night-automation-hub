import type { NextRequest } from "next/server";
import { createFixedWindowCounter, isCounterUnavailable } from "@/lib/fixed-window-counter";

/**
 * Upstash Redis when configured, an in-process Map otherwise — see
 * src/lib/fixed-window-counter.ts, which holds the one client and the one
 * counter body this file and src/lib/daily-ceiling.ts share. With Upstash,
 * limits hold across every serverless instance; without it each instance
 * keeps its own counters and a cold start wipes them, which is fine for
 * local dev and not for a real multi-instance deploy.
 */
const counter = createFixedWindowCounter();

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * `identity` overrides what the bucket is counted against. It defaults to the
 * client IP, which is right for an open public endpoint but wrong for anything
 * played in one room: a pub's teams all arrive from a single NAT address, so
 * an IP-keyed bucket would have the first team's submissions throttle
 * everybody else's. Pass a team id (or another per-actor identifier) for those.
 */
export async function rateLimit(
  req: NextRequest,
  key: string,
  { limit, windowMs, identity }: { limit: number; windowMs: number; identity?: string }
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  return consumeRateLimit(`ratelimit:${key}:${identity ?? clientIp(req)}`, { limit, windowMs });
}

/**
 * The same limiter, addressed by a fully-formed bucket key instead of by a
 * request.
 *
 * Better Auth's own rate limiting is wired to this (see the `customStorage`
 * in src/lib/auth.ts): its endpoints must be bounded by the *same* store as
 * everything else here, or a deploy with Upstash configured would still be
 * counting sign-in attempts in a per-instance Map — which on a serverless
 * host is N limiters, not one. It hands us a key and a rule and has no
 * NextRequest to give, hence this entry point. `rateLimit` above is now a
 * thin wrapper that only decides what the key is.
 */
export async function consumeRateLimit(
  bucketKey: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  // One clock reading for both calls, so the fallback store measures the
  // wait from the same instant it counted at.
  const now = Date.now();
  try {
    const count = await counter.hit(bucketKey, windowMs, now);
    if (count > limit) {
      return { allowed: false, retryAfterSeconds: await counter.secondsLeft(bucketKey, now) };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  } catch (error) {
    if (!isCounterUnavailable(error)) throw error;
    // Fail open. A limiter that cannot count must not become an outage: on
    // 27 Sep a bad Upstash token made every call here throw, and because
    // Better Auth runs its own rate limiting through this function
    // (customStorage in src/lib/auth.ts) the throw surfaced as a 500 from
    // /api/auth/get-session — sign-in was down for everyone because the
    // *throttle* was broken. Letting the request through loses abuse
    // protection for as long as the store is away, which is the smaller of
    // the two failures and the reversible one.
    //
    // The cost ceiling makes the opposite choice on purpose, because what it
    // protects is a bill rather than a nuisance: see reserveDailyGeneration
    // in src/lib/daily-ceiling.ts.
    warnCounterUnavailable(bucketKey, error, now);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/**
 * At most one warning a minute, whatever the traffic.
 *
 * An outage here is per-request, so a busy minute would write thousands of
 * identical lines — enough to bury the rest of the log and to cost real money
 * on a metered log drain. One a minute is enough to see that it is happening
 * and how long it lasted.
 */
const WARN_INTERVAL_MS = 60_000;
let lastWarnedAtMs: number | null = null;

/** Exposed for tests: the throttle is module-level and outlives a test. */
export function __resetRateLimitWarnThrottle() {
  lastWarnedAtMs = null;
}

function warnCounterUnavailable(bucketKey: string, error: unknown, nowMs: number) {
  if (lastWarnedAtMs !== null && nowMs - lastWarnedAtMs < WARN_INTERVAL_MS) return;
  lastWarnedAtMs = nowMs;
  // "ratelimit-redis-error" is the string to alert on. The bucket key says
  // which limiter was affected; it is already namespaced and carries no
  // secret, though it can carry a client IP, which is why the key is the only
  // request detail logged.
  console.warn(
    `ratelimit-redis-error: rate limiting failed open for "${bucketKey}" — the shared counter is unreachable, ` +
      `so requests are being allowed without being counted. Further warnings are suppressed for ${
        WARN_INTERVAL_MS / 1000
      }s.`,
    error
  );
}
