import { afterAll, describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";

/**
 * Better Auth's limiter has to run on the SAME store as the rest of the app.
 *
 * Its default is a private in-memory Map, which on a serverless host is one
 * limiter per instance — i.e. no meaningful limit at all on the endpoints
 * that mail people sign-in links. src/lib/auth.ts points it at
 * `consumeRateLimit` instead: Upstash when configured, and otherwise the
 * same in-process Map every other limiter in the app uses.
 *
 * A behavioural test ("5 then 429", in magic-link.integration.test.ts)
 * cannot tell the two apart — Better Auth's own store would pass it too. So
 * this one puts a unit into the store through Better Auth's configured
 * storage and takes it out through ours. Only one store can satisfy both.
 */

describe("Better Auth rate limiting runs on this app's limiter", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("is configured with a custom storage at all", () => {
    expect(auth.options.rateLimit?.enabled).toBe(true);
    expect(typeof auth.options.rateLimit?.customStorage?.consume).toBe("function");
  });

  it("shares one bucket with the limiter the rest of the app uses", async () => {
    const storage = auth.options.rateLimit!.customStorage!;
    const key = `wiring-probe-${Math.random().toString(36).slice(2)}`;

    // One unit in, through Better Auth's side.
    const first = await storage.consume(key, { window: 60, max: 1 });
    expect(first.allowed).toBe(true);

    // The next one out, through ours, against the namespaced key
    // src/lib/auth.ts builds. If these were separate stores this would be
    // allowed — it is the first request that store has ever seen.
    const second = await consumeRateLimit(`better-auth:${key}`, { limit: 1, windowMs: 60_000 });
    expect(second.allowed).toBe(false);
    expect(second.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("reports a refusal in the shape Better Auth expects", async () => {
    const storage = auth.options.rateLimit!.customStorage!;
    const key = `shape-probe-${Math.random().toString(36).slice(2)}`;

    expect(await storage.consume(key, { window: 60, max: 1 })).toEqual({ allowed: true, retryAfter: null });

    const refused = await storage.consume(key, { window: 60, max: 1 });
    expect(refused.allowed).toBe(false);
    // `retryAfter` in seconds, never null on a refusal — it becomes the
    // Retry-After header, and a null there would be a 429 with no guidance.
    expect(refused.retryAfter).toBeGreaterThan(0);
  });
});
