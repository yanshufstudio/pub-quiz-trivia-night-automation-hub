import type { NextRequest } from "next/server";
import { createFixedWindowCounter } from "@/lib/fixed-window-counter";

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
  const count = await counter.hit(bucketKey, windowMs, now);
  if (count > limit) {
    return { allowed: false, retryAfterSeconds: await counter.secondsLeft(bucketKey, now) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}
