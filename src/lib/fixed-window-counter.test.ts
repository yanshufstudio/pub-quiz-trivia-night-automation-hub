import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The shared counter under both of its stores.
 *
 * rate-limit.test.ts and daily-ceiling.test.ts still test their own call
 * sites unchanged; this file covers the mechanism they now share, including
 * the Redis-side release path, which neither of them ever exercised.
 */

type Entry = { value: number; expiresAt: number | null };

/** Just enough of @upstash/redis's client to run the counter against, with
 * every call recorded so a test can say which commands were sent. */
function fakeRedisFactory(store: Map<string, Entry>) {
  const live = (key: string) => {
    const e = store.get(key);
    if (e && e.expiresAt !== null && e.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return e;
  };
  return function fakeRedis() {
    return {
      incr: vi.fn(async (key: string) => {
        const e = live(key);
        if (!e) {
          store.set(key, { value: 1, expiresAt: null });
          return 1;
        }
        e.value += 1;
        return e.value;
      }),
      decr: vi.fn(async (key: string) => {
        const e = live(key);
        if (!e) {
          // Redis DECR on a missing key creates it at -1, with no expiry.
          store.set(key, { value: -1, expiresAt: null });
          return -1;
        }
        e.value -= 1;
        return e.value;
      }),
      expire: vi.fn(async (key: string, seconds: number) => {
        const e = live(key);
        if (e) e.expiresAt = Date.now() + seconds * 1000;
        return e ? 1 : 0;
      }),
      ttl: vi.fn(async (key: string) => {
        const e = live(key);
        if (!e) return -2;
        if (e.expiresAt === null) return -1;
        return Math.ceil((e.expiresAt - Date.now()) / 1000);
      }),
      // Upstash's SET replaces the value AND drops any TTL unless `ex` is given.
      set: vi.fn(async (key: string, value: number, opts?: { ex?: number }) => {
        store.set(key, { value, expiresAt: opts?.ex ? Date.now() + opts.ex * 1000 : null });
        return "OK";
      }),
    };
  };
}

describe("fixed-window counter — in-process fallback (no Upstash configured)", () => {
  let createFixedWindowCounter: typeof import("@/lib/fixed-window-counter").createFixedWindowCounter;

  beforeEach(async () => {
    vi.resetModules();
    ({ createFixedWindowCounter } = await import("@/lib/fixed-window-counter"));
  });

  it("counts hits within a window and starts again once it closes", async () => {
    const c = createFixedWindowCounter();
    const t0 = 1_000_000;
    expect(await c.hit("k", 1000, t0)).toBe(1);
    expect(await c.hit("k", 1000, t0 + 500)).toBe(2);
    expect(await c.hit("k", 1000, t0 + 999)).toBe(3);
    // The window is fixed from the first hit, not slid by the later ones.
    expect(await c.hit("k", 1000, t0 + 1000)).toBe(1);
  });

  it("reports whole seconds left, never less than one", async () => {
    const c = createFixedWindowCounter();
    const t0 = 2_000_000;
    await c.hit("k", 10_000, t0);
    expect(await c.secondsLeft("k", t0)).toBe(10);
    expect(await c.secondsLeft("k", t0 + 9_001)).toBe(1);
    expect(await c.secondsLeft("k", t0 + 9_999)).toBe(1);
  });

  it("never releases below zero", async () => {
    const c = createFixedWindowCounter();
    const t0 = 3_000_000;
    await c.hit("k", 60_000, t0);
    await c.release("k", 60_000);
    await c.release("k", 60_000);
    await c.release("k", 60_000);
    // Had the releases gone negative, this would come back as -1 or less.
    expect(await c.hit("k", 60_000, t0 + 1)).toBe(1);
  });

  it("keeps each counter's fallback store to itself", async () => {
    const a = createFixedWindowCounter();
    const b = createFixedWindowCounter();
    const t0 = 4_000_000;
    await a.hit("same-key", 60_000, t0);
    await b.hit("same-key", 60_000, t0);
    await b.hit("same-key", 60_000, t0);

    // Resetting one (as daily-ceiling's tests do between cases) must not
    // wipe the other's counts — the two used to be separate Maps.
    a.resetMemory();
    expect(await a.hit("same-key", 60_000, t0)).toBe(1);
    expect(await b.hit("same-key", 60_000, t0)).toBe(3);
  });
});

describe("fixed-window counter — Upstash (configured)", () => {
  const store = new Map<string, Entry>();
  let RedisCtor: ReturnType<typeof vi.fn>;
  let createFixedWindowCounter: typeof import("@/lib/fixed-window-counter").createFixedWindowCounter;

  beforeEach(async () => {
    vi.resetModules();
    store.clear();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    RedisCtor = vi.fn().mockImplementation(fakeRedisFactory(store));
    vi.doMock("@upstash/redis", () => ({ Redis: RedisCtor }));
    ({ createFixedWindowCounter } = await import("@/lib/fixed-window-counter"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.doUnmock("@upstash/redis");
    vi.resetModules();
  });

  function client() {
    return RedisCtor.mock.results[0]!.value as ReturnType<ReturnType<typeof fakeRedisFactory>>;
  }

  it("sets the expiry once, on the hit that opens the window", async () => {
    const c = createFixedWindowCounter();
    await c.hit("k", 90_000);
    await c.hit("k", 90_000);
    await c.hit("k", 90_000);
    expect(client().incr).toHaveBeenCalledTimes(3);
    // Re-expiring on every hit would slide the window and it would never roll over.
    expect(client().expire).toHaveBeenCalledTimes(1);
    expect(client().expire).toHaveBeenCalledWith("k", 90);
  });

  it("rounds a part-second window up, not down", async () => {
    const c = createFixedWindowCounter();
    await c.hit("k", 1_500);
    expect(client().expire).toHaveBeenCalledWith("k", 2);
  });

  it("reads the wait from Redis, never less than one second", async () => {
    const c = createFixedWindowCounter();
    await c.hit("k", 30_000);
    expect(await c.secondsLeft("k")).toBe(30);
    // A key with no expiry reports -1; that must not become a Retry-After of -1 or 0.
    store.set("immortal", { value: 5, expiresAt: null });
    expect(await c.secondsLeft("immortal")).toBe(1);
  });

  it("repairs a negative count with a SET that carries the expiry", async () => {
    vi.useFakeTimers();
    const c = createFixedWindowCounter();
    await c.hit("day", 60_000);

    // The window closes before the unit is handed back; DECR then recreates
    // the key at -1, which would read as one extra allowance.
    vi.advanceTimersByTime(60_001);
    await c.release("day", 60_000);

    expect(client().set).toHaveBeenCalledTimes(1);
    expect(client().set).toHaveBeenCalledWith("day", 0, { ex: 60 });
    expect(store.get("day")).toEqual({ value: 0, expiresAt: expect.any(Number) });

    // And the repaired key does expire, rather than living forever.
    vi.advanceTimersByTime(60_001);
    expect(await client().ttl("day")).toBe(-2);
  });

  it("leaves a positive count alone on release", async () => {
    const c = createFixedWindowCounter();
    await c.hit("k", 60_000);
    await c.hit("k", 60_000);
    await c.release("k", 60_000);
    expect(client().set).not.toHaveBeenCalled();
    expect(store.get("k")?.value).toBe(1);
  });
});

describe("one Upstash client per process", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@upstash/redis");
    vi.resetModules();
  });

  it("is built once, however many modules count against it", async () => {
    vi.resetModules();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    const RedisCtor = vi.fn().mockImplementation(fakeRedisFactory(new Map()));
    vi.doMock("@upstash/redis", () => ({ Redis: RedisCtor }));

    // Both users of the counter, loaded into the same module graph the way a
    // server process loads them. Each used to build its own client.
    await import("@/lib/rate-limit");
    await import("@/lib/daily-ceiling");

    expect(RedisCtor).toHaveBeenCalledTimes(1);
  });
});

describe("the daily ceiling's call site, on Upstash", () => {
  const store = new Map<string, Entry>();
  let RedisCtor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    store.clear();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    vi.stubEnv("FREE_DAILY_PACK_CEILING", "1");
    RedisCtor = vi.fn().mockImplementation(fakeRedisFactory(store));
    vi.doMock("@upstash/redis", () => ({ Redis: RedisCtor }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@upstash/redis");
    vi.resetModules();
  });

  it("expires today's key at UTC midnight and hands a refused unit back", async () => {
    const { reserveDailyGeneration } = await import("@/lib/daily-ceiling");
    const noon = new Date("2026-09-18T12:00:00.000Z");
    const redis = RedisCtor.mock.results[0]!.value as ReturnType<ReturnType<typeof fakeRedisFactory>>;

    expect((await reserveDailyGeneration("FREE", noon)).allowed).toBe(true);
    // Twelve hours to midnight, in seconds, set once when the day's key opens.
    expect(redis.expire).toHaveBeenCalledWith("generate:daily:FREE:2026-09-18", 43_200);

    expect((await reserveDailyGeneration("FREE", noon)).allowed).toBe(false);
    // The refusal INCRed to 2 and must DECR straight back to 1.
    expect(redis.decr).toHaveBeenCalledTimes(1);
    expect(store.get("generate:daily:FREE:2026-09-18")?.value).toBe(1);
  });
});
