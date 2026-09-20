import type { NextRequest } from "next/server";
import { Redis } from "@upstash/redis";

/**
 * Upstash Redis when configured (UPSTASH_REDIS_REST_URL/TOKEN in
 * .env.example) — a real shared store, so limits are actually enforced
 * across every serverless instance rather than reset per cold start.
 * Falls back to an in-process Map otherwise, which is fine for local dev
 * (or a genuinely single, long-running process) but not for a real
 * multi-instance deploy: each instance gets its own counters, and a
 * redeploy/cold start wipes them.
 */
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
    : null;

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

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
  return redis ? redisRateLimit(redis, bucketKey, limit, windowMs) : memoryRateLimit(bucketKey, limit, windowMs);
}

/** Fixed-window counter via INCR + EXPIRE. Two requests racing to be "first"
 * in a new window can both fire the EXPIRE — harmless, since they agree on
 * how long the window should last (windowSeconds), so the TTL ends up the
 * same either way. */
async function redisRateLimit(
  redis: Redis,
  bucketKey: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const windowSeconds = Math.ceil(windowMs / 1000);
  const count = await redis.incr(bucketKey);
  if (count === 1) {
    await redis.expire(bucketKey, windowSeconds);
  }
  if (count > limit) {
    const ttl = await redis.ttl(bucketKey);
    return { allowed: false, retryAfterSeconds: Math.max(ttl, 1) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

function memoryRateLimit(
  bucketKey: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = memoryBuckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    memoryBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
