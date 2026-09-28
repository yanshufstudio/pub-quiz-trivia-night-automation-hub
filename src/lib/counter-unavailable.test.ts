import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What happens when Upstash is down.
 *
 * On 27 Sep a bad Upstash token made every Redis call throw. The throw
 * travelled out of the shared counter, through Better Auth's rate-limit
 * storage, and out of /api/auth/get-session as a 500: nobody could sign in
 * because the *rate limiter* was broken. Nothing in the suite noticed, because
 * every test until now ran against a store that answered.
 *
 * So this file runs the three modules against a store that throws, and pins
 * the two opposite decisions they are supposed to make — the limiter lets
 * traffic through, the cost ceiling does not. It covers all three together
 * because that asymmetry is the behaviour, and a per-module test cannot state
 * it.
 */

/** A client whose chosen commands throw the way @upstash/redis does when the
 * token is wrong: a rejected promise, not a synchronous throw. */
function throwingRedisFactory(
  failing: ReadonlyArray<"incr" | "decr" | "expire" | "ttl" | "set" | "del">,
  calls: string[]
) {
  const value = new Map<string, number>();
  const fail = (name: string) => async () => {
    calls.push(name);
    throw new Error(`WRONGPASS invalid or missing auth token (${name})`);
  };
  const ok = <T>(name: string, run: (...args: never[]) => T) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.fn(async (...args: any[]) => {
      calls.push(name);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (run as any)(...args);
    });

  return function throwingRedis() {
    return {
      incr: failing.includes("incr")
        ? vi.fn(fail("incr"))
        : ok("incr", (key: string) => {
            const next = (value.get(key) ?? 0) + 1;
            value.set(key, next);
            return next;
          }),
      decr: failing.includes("decr")
        ? vi.fn(fail("decr"))
        : ok("decr", (key: string) => {
            const next = (value.get(key) ?? 0) - 1;
            value.set(key, next);
            return next;
          }),
      expire: failing.includes("expire") ? vi.fn(fail("expire")) : ok("expire", () => 1),
      ttl: failing.includes("ttl") ? vi.fn(fail("ttl")) : ok("ttl", () => 42),
      set: failing.includes("set") ? vi.fn(fail("set")) : ok("set", () => "OK"),
      del: failing.includes("del") ? vi.fn(fail("del")) : ok("del", () => 1),
    };
  };
}

function stubUpstash(
  failing: ReadonlyArray<"incr" | "decr" | "expire" | "ttl" | "set" | "del">,
  calls: string[]
) {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "a-token-the-server-rejects");
  vi.doMock("@upstash/redis", () => ({
    Redis: vi.fn().mockImplementation(throwingRedisFactory(failing, calls)),
  }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.doUnmock("@upstash/redis");
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("the counter reports unavailability rather than inventing a number", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it.each(["incr", "ttl", "decr"] as const)(
    "turns a failing %s into a CounterUnavailableError",
    async (command) => {
      const calls: string[] = [];
      stubUpstash([command], calls);
      const { createFixedWindowCounter, isCounterUnavailable } = await import(
        "@/lib/fixed-window-counter"
      );
      const counter = createFixedWindowCounter();

      const attempt =
        command === "incr"
          ? counter.hit("k", 60_000)
          : command === "ttl"
            ? counter.secondsLeft("k")
            : counter.release("k", 60_000);

      await expect(attempt).rejects.toSatisfy(isCounterUnavailable);
      expect(calls).toContain(command);
    }
  );

  it("names the operation that failed, and keeps the original error as the cause", async () => {
    stubUpstash(["incr"], []);
    const { createFixedWindowCounter } = await import("@/lib/fixed-window-counter");

    await createFixedWindowCounter()
      .hit("k", 60_000)
      .then(
        () => expect.fail("expected the hit to reject"),
        (error: Error & { operation?: string; cause?: unknown }) => {
          expect(error.name).toBe("CounterUnavailableError");
          expect(error.operation).toBe("hit");
          expect((error.cause as Error).message).toContain("WRONGPASS");
        }
      );
  });

  it("drops the key when INCR lands but EXPIRE does not, so it cannot become immortal", async () => {
    // The dangerous half-failure: the count is recorded with no TTL, and an
    // expiry is only ever set on a count of 1, so nothing would set one again.
    // Left alone the key would outlive its window for good — and the daily
    // ceiling, which fails closed, would refuse generation permanently.
    const calls: string[] = [];
    stubUpstash(["expire"], calls);
    const { createFixedWindowCounter, isCounterUnavailable } = await import(
      "@/lib/fixed-window-counter"
    );

    await expect(createFixedWindowCounter().hit("k", 60_000)).rejects.toSatisfy(isCounterUnavailable);
    expect(calls).toEqual(["incr", "expire", "del"]);
  });

  it("still answers from the in-process store when Upstash is not configured at all", async () => {
    // The fallback path must not be dragged into the failure handling: a
    // deploy with no Upstash is a supported configuration, not an outage.
    vi.resetModules();
    const { createFixedWindowCounter } = await import("@/lib/fixed-window-counter");
    const counter = createFixedWindowCounter();
    expect(await counter.hit("k", 60_000)).toBe(1);
    expect(await counter.hit("k", 60_000)).toBe(2);
  });
});

describe("rate limits fail OPEN", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T12:00:00.000Z"));
  });

  it("allows the request Better Auth's storage is asking about, instead of throwing", async () => {
    // This is the 27 Sep outage in one line: consumeRateLimit is what
    // src/lib/auth.ts hands Better Auth as customStorage, so a throw here is
    // a 500 from /api/auth/get-session and nobody signs in.
    stubUpstash(["incr"], []);
    const { consumeRateLimit } = await import("@/lib/rate-limit");

    await expect(
      consumeRateLimit("better-auth:sign-in-code:someone", { limit: 3, windowMs: 3_600_000 })
    ).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("allows a request-keyed limiter too, and says so once with ratelimit-redis-error", async () => {
    stubUpstash(["incr"], []);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rateLimit } = await import("@/lib/rate-limit");

    const req = { headers: new Headers({ "x-forwarded-for": "9.9.9.9" }) } as never;
    const result = await rateLimit(req, "packs:generate", { limit: 5, windowMs: 600_000 });

    expect(result.allowed).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]!.join(" ")).toContain("ratelimit-redis-error");
  });

  it("warns at most once a minute however much traffic arrives", async () => {
    stubUpstash(["incr"], []);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { consumeRateLimit, __resetRateLimitWarnThrottle } = await import("@/lib/rate-limit");
    __resetRateLimitWarnThrottle();

    for (let i = 0; i < 50; i++) {
      await consumeRateLimit("ratelimit:packs:generate:1.1.1.1", { limit: 5, windowMs: 600_000 });
    }
    expect(warn).toHaveBeenCalledTimes(1);

    // Still inside the window: still silent.
    vi.advanceTimersByTime(59_000);
    await consumeRateLimit("ratelimit:packs:generate:1.1.1.1", { limit: 5, windowMs: 600_000 });
    expect(warn).toHaveBeenCalledTimes(1);

    // Past it: one more line, so a long outage stays visible in the log.
    vi.advanceTimersByTime(1_500);
    await consumeRateLimit("ratelimit:packs:generate:1.1.1.1", { limit: 5, windowMs: 600_000 });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("fails open when the count arrives but the Retry-After lookup dies", async () => {
    // INCR works, TTL does not, and the caller is over its limit. There is no
    // number to tell them to wait, and a throw would be the outage again.
    const calls: string[] = [];
    stubUpstash(["ttl"], calls);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { consumeRateLimit } = await import("@/lib/rate-limit");

    const bucket = "ratelimit:packs:generate:2.2.2.2";
    for (let i = 0; i < 3; i++) {
      await consumeRateLimit(bucket, { limit: 2, windowMs: 600_000 });
    }
    await expect(consumeRateLimit(bucket, { limit: 2, windowMs: 600_000 })).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it("does not swallow a programming error that has nothing to do with Redis", async () => {
    // Failing open is a decision about one named failure, not a blanket catch:
    // a bug in here should still be loud.
    vi.resetModules();
    vi.doMock("@/lib/fixed-window-counter", () => ({
      isCounterUnavailable: () => false,
      createFixedWindowCounter: () => ({
        hit: async () => {
          throw new TypeError("someone renamed a field");
        },
        secondsLeft: async () => 1,
        release: async () => {},
        resetMemory: () => {},
      }),
    }));
    const { consumeRateLimit } = await import("@/lib/rate-limit");

    await expect(
      consumeRateLimit("ratelimit:whatever:3.3.3.3", { limit: 5, windowMs: 600_000 })
    ).rejects.toThrow("someone renamed a field");
    vi.doUnmock("@/lib/fixed-window-counter");
  });
});

describe("daily ceilings fail CLOSED", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("refuses, flags itself unavailable, and asks for a retry in seconds not hours", async () => {
    stubUpstash(["incr"], []);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { reserveDailyGeneration, CEILING_UNAVAILABLE_RETRY_SECONDS } = await import(
      "@/lib/daily-ceiling"
    );

    const reservation = await reserveDailyGeneration("FREE", new Date("2026-09-27T03:00:00.000Z"));

    expect(reservation.allowed).toBe(false);
    expect(reservation.unavailable).toBe(true);
    expect(reservation.used).toBe(0);
    // Not the ~21 hours until midnight that an exhausted ceiling returns.
    expect(reservation.retryAfterSeconds).toBe(CEILING_UNAVAILABLE_RETRY_SECONDS);
    expect(reservation.retryAfterSeconds).toBeLessThan(60);
    expect(error.mock.calls[0]!.join(" ")).toContain("daily-ceiling-redis-error");
  });

  it("makes the same refusal for PRO — a subscription is not a way past the bill", async () => {
    stubUpstash(["incr"], []);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { reserveDailyGeneration } = await import("@/lib/daily-ceiling");

    const reservation = await reserveDailyGeneration("PRO");
    expect(reservation.allowed).toBe(false);
    expect(reservation.unavailable).toBe(true);
  });

  it("does not mention limits or allowances in the message a visitor sees", async () => {
    const { CEILING_UNAVAILABLE_MESSAGE } = await import("@/lib/daily-ceiling");
    expect(CEILING_UNAVAILABLE_MESSAGE).toBe(
      "Pack generation is paused for a moment — please try again shortly."
    );
    expect(CEILING_UNAVAILABLE_MESSAGE).not.toMatch(/limit|ceiling|allowance|upgrade|Pro/i);
  });

  it("keeps the ordinary over-the-ceiling refusal distinguishable from an outage", async () => {
    // A working store that says "over the line" must not be reported as
    // unavailable, or the route would answer a real refusal with the wrong
    // words and the wrong Retry-After.
    stubUpstash([], []);
    vi.stubEnv("FREE_DAILY_PACK_CEILING", "1");
    const { reserveDailyGeneration } = await import("@/lib/daily-ceiling");

    const first = await reserveDailyGeneration("FREE");
    expect(first.allowed).toBe(true);

    const second = await reserveDailyGeneration("FREE");
    expect(second.allowed).toBe(false);
    expect(second.unavailable).toBeFalsy();
    expect(second.retryAfterSeconds).toBeGreaterThan(60);
  });

  it("still refuses when the give-back fails on the way to refusing", async () => {
    // INCR works and takes the count past the ceiling; DECR dies. The answer
    // is still a plain refusal, not a 500.
    stubUpstash(["decr"], []);
    vi.stubEnv("FREE_DAILY_PACK_CEILING", "1");
    const { reserveDailyGeneration } = await import("@/lib/daily-ceiling");

    await reserveDailyGeneration("FREE");
    const second = await reserveDailyGeneration("FREE");
    expect(second.allowed).toBe(false);
    expect(second.unavailable).toBeFalsy();
  });

  it("never throws out of release(), so a generation that worked still returns", async () => {
    // release() runs after the model call has been decided. A store that dies
    // in between must not turn a finished pack into a 500.
    stubUpstash(["decr"], []);
    const { reserveDailyGeneration } = await import("@/lib/daily-ceiling");

    const reservation = await reserveDailyGeneration("FREE");
    expect(reservation.allowed).toBe(true);
    await expect(reservation.release()).resolves.toBeUndefined();
  });
});
