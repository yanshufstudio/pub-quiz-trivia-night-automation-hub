import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function requestFrom(ip: string) {
  return new NextRequest("http://localhost/api/x", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("rateLimit — in-memory fallback (no Upstash env vars configured)", () => {
  // The limiter's bucket map is module-level (shared across the whole test
  // file), so every test uses its own `key` namespace to stay isolated from
  // the others rather than relying on execution order.
  let key = 0;
  function freshKey() {
    key += 1;
    return `test-${key}`;
  }

  let rateLimit: typeof import("@/lib/rate-limit").rateLimit;

  beforeEach(async () => {
    ({ rateLimit } = await import("@/lib/rate-limit"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the limit, then blocks", async () => {
    const k = freshKey();
    const req = requestFrom("1.1.1.1");
    for (let i = 0; i < 3; i++) {
      expect((await rateLimit(req, k, { limit: 3, windowMs: 60_000 })).allowed).toBe(true);
    }
    const blocked = await rateLimit(req, k, { limit: 3, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks separate keys independently", async () => {
    const req = requestFrom("2.2.2.2");
    const keyA = freshKey();
    const keyB = freshKey();
    for (let i = 0; i < 3; i++) await rateLimit(req, keyA, { limit: 3, windowMs: 60_000 });
    // keyA is now exhausted; keyB should be untouched by it.
    expect((await rateLimit(req, keyB, { limit: 3, windowMs: 60_000 })).allowed).toBe(true);
  });

  it("tracks separate IPs independently under the same key", async () => {
    const k = freshKey();
    const reqA = requestFrom("3.3.3.3");
    const reqB = requestFrom("4.4.4.4");
    for (let i = 0; i < 3; i++) await rateLimit(reqA, k, { limit: 3, windowMs: 60_000 });
    expect((await rateLimit(reqA, k, { limit: 3, windowMs: 60_000 })).allowed).toBe(false);
    expect((await rateLimit(reqB, k, { limit: 3, windowMs: 60_000 })).allowed).toBe(true);
  });

  it("uses only the first address in a comma-separated x-forwarded-for", async () => {
    const k = freshKey();
    const spoofed = new NextRequest("http://localhost/api/x", {
      headers: { "x-forwarded-for": "5.5.5.5, 9.9.9.9" },
    });
    const plain = requestFrom("5.5.5.5");
    for (let i = 0; i < 3; i++) await rateLimit(spoofed, k, { limit: 3, windowMs: 60_000 });
    // Same real client (5.5.5.5) whether or not a proxy chain is appended.
    expect((await rateLimit(plain, k, { limit: 3, windowMs: 60_000 })).allowed).toBe(false);
  });

  it("resets the window after it expires", async () => {
    vi.useFakeTimers();
    const k = freshKey();
    const req = requestFrom("6.6.6.6");
    for (let i = 0; i < 2; i++) await rateLimit(req, k, { limit: 2, windowMs: 1000 });
    expect((await rateLimit(req, k, { limit: 2, windowMs: 1000 })).allowed).toBe(false);

    vi.advanceTimersByTime(1001);
    expect((await rateLimit(req, k, { limit: 2, windowMs: 1000 })).allowed).toBe(true);
  });
});

describe("rateLimit — Upstash Redis backend (env vars configured)", () => {
  // A minimal fake standing in for @upstash/redis's client: enough of
  // incr/expire/ttl to exercise the fixed-window logic without a real
  // network call. Keyed the same way the real Map fallback is (isolated per
  // test via freshKey), just backed by this object instead.
  const store = new Map<string, { count: number; expiresAt: number | null }>();

  function fakeRedisInstance() {
    return {
      incr: vi.fn(async (bucketKey: string) => {
        const now = Date.now();
        const existing = store.get(bucketKey);
        if (!existing || (existing.expiresAt !== null && existing.expiresAt <= now)) {
          store.set(bucketKey, { count: 1, expiresAt: null });
          return 1;
        }
        existing.count += 1;
        return existing.count;
      }),
      expire: vi.fn(async (bucketKey: string, seconds: number) => {
        const entry = store.get(bucketKey);
        if (entry) entry.expiresAt = Date.now() + seconds * 1000;
        return 1;
      }),
      ttl: vi.fn(async (bucketKey: string) => {
        const entry = store.get(bucketKey);
        if (!entry?.expiresAt) return -1;
        return Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / 1000));
      }),
    };
  }

  let key = 0;
  function freshKey() {
    key += 1;
    return `redis-test-${key}`;
  }

  let rateLimit: typeof import("@/lib/rate-limit").rateLimit;

  beforeEach(async () => {
    vi.resetModules();
    store.clear();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    vi.doMock("@upstash/redis", () => ({ Redis: vi.fn().mockImplementation(fakeRedisInstance) }));
    ({ rateLimit } = await import("@/lib/rate-limit"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@upstash/redis");
    vi.resetModules();
  });

  it("allows requests up to the limit, then blocks, using the Redis-backed path", async () => {
    const k = freshKey();
    const req = requestFrom("7.7.7.7");
    for (let i = 0; i < 3; i++) {
      expect((await rateLimit(req, k, { limit: 3, windowMs: 60_000 })).allowed).toBe(true);
    }
    const blocked = await rateLimit(req, k, { limit: 3, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks separate keys independently via Redis", async () => {
    const req = requestFrom("8.8.8.8");
    const keyA = freshKey();
    const keyB = freshKey();
    for (let i = 0; i < 3; i++) await rateLimit(req, keyA, { limit: 3, windowMs: 60_000 });
    expect((await rateLimit(req, keyB, { limit: 3, windowMs: 60_000 })).allowed).toBe(true);
  });

  // Everyone in a pub shares the venue's public IP, so anything counted per
  // player has to be counted against the player, not the address they arrived
  // from. Without this, the first team to use up an allowance would take the
  // rest of the room down with it.
  it("counts against `identity` instead of the IP when one is given", async () => {
    const k = freshKey();
    const sameIp = requestFrom("9.9.9.9");

    for (let i = 0; i < 3; i++) {
      expect((await rateLimit(sameIp, k, { limit: 3, windowMs: 60_000, identity: "team-a" })).allowed).toBe(true);
    }
    expect((await rateLimit(sameIp, k, { limit: 3, windowMs: 60_000, identity: "team-a" })).allowed).toBe(false);

    // Second team, exhausted key, identical IP — untouched.
    expect((await rateLimit(sameIp, k, { limit: 3, windowMs: 60_000, identity: "team-b" })).allowed).toBe(true);
  });

  it("still falls back to the IP when no identity is given", async () => {
    const k = freshKey();
    for (let i = 0; i < 3; i++) await rateLimit(requestFrom("10.0.0.1"), k, { limit: 3, windowMs: 60_000 });
    expect((await rateLimit(requestFrom("10.0.0.1"), k, { limit: 3, windowMs: 60_000 })).allowed).toBe(false);
    expect((await rateLimit(requestFrom("10.0.0.2"), k, { limit: 3, windowMs: 60_000 })).allowed).toBe(true);
  });
});
