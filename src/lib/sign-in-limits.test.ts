import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DAILY_LIMIT_ENV,
  DEFAULT_DAILY_LIMIT,
  DEFAULT_PER_ADDRESS_HOURLY,
  PER_ADDRESS_HOURLY_ENV,
  dailyCodeLimit,
  perAddressHourlyLimit,
  reserveSignInCode,
  signInCodeKeyFor,
  __resetSignInLimitCounters,
} from "@/lib/sign-in-limits";
import {
  SIGN_IN_CODES_PAUSED_CODE,
  SIGN_IN_CODES_PAUSED_MESSAGE,
  TOO_MANY_CODES_FOR_ADDRESS_CODE,
  TOO_MANY_CODES_FOR_ADDRESS_MESSAGE,
} from "@/lib/sign-in-limit-messages";
import { signInSendError, RATE_LIMITED_MESSAGE } from "@/lib/sign-in-errors";
import { __resetRateLimitWarnThrottle } from "@/lib/rate-limit";

/**
 * How many sign-in codes this app will email (M2).
 *
 * The number is not a matter of taste: Resend's free plan allows 100 emails a
 * day and that allowance is shared with another product on the same account, so
 * a flood exhausts a quota something else depends on.
 */

beforeEach(() => {
  __resetSignInLimitCounters();
  __resetRateLimitWarnThrottle();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetSignInLimitCounters();
  vi.restoreAllMocks();
});

describe("the two limits", () => {
  it("defaults to 3 an hour per address and 60 a day overall", () => {
    expect(perAddressHourlyLimit()).toBe(DEFAULT_PER_ADDRESS_HOURLY);
    expect(dailyCodeLimit()).toBe(DEFAULT_DAILY_LIMIT);
    expect(DEFAULT_PER_ADDRESS_HOURLY).toBe(3);
    // Short of Resend's 100, on purpose: the rest is left for the other
    // product on the account and for genuine resends.
    expect(DEFAULT_DAILY_LIMIT).toBe(60);
    expect(DEFAULT_DAILY_LIMIT).toBeLessThan(100);
  });

  it("takes the owner's numbers, and ignores a typo rather than propagating it", () => {
    vi.stubEnv(PER_ADDRESS_HOURLY_ENV, "5");
    vi.stubEnv(DAILY_LIMIT_ENV, "80");
    expect(perAddressHourlyLimit()).toBe(5);
    expect(dailyCodeLimit()).toBe(80);

    vi.stubEnv(PER_ADDRESS_HOURLY_ENV, "three");
    vi.stubEnv(DAILY_LIMIT_ENV, "");
    expect(perAddressHourlyLimit()).toBe(DEFAULT_PER_ADDRESS_HOURLY);
    expect(dailyCodeLimit()).toBe(DEFAULT_DAILY_LIMIT);
  });
});

describe("the per-address counting key", () => {
  it("folds case and whitespace, which are the same mailbox by definition", () => {
    expect(signInCodeKeyFor("  Host@Example.TEST ")).toBe("host@example.test");
  });

  it("does NOT fold dots or +tags, unlike the free-allowance normalisation", () => {
    // Folding them here would let one member of a shared domain exhaust
    // another's sign-in cap, and would make this counter a way to probe which
    // addresses an alias scheme collapses together. H1's normalisation exists
    // for a different question — who shares a free allowance — and is applied
    // nowhere near here.
    expect(signInCodeKeyFor("a.b+tag@gmail.com")).toBe("a.b+tag@gmail.com");
  });
});

describe("reserving permission to send one code", () => {
  it("allows the address its hourly allowance, then refuses that address", async () => {
    vi.stubEnv(PER_ADDRESS_HOURLY_ENV, "2");
    for (let i = 0; i < 2; i++) {
      expect((await reserveSignInCode("one@example.test")).allowed).toBe(true);
    }
    const refused = await reserveSignInCode("one@example.test");
    expect(refused.allowed).toBe(false);
    expect(refused.allowed === false && refused.reason).toBe("address");
  });

  it("counts a differently-capitalised address as the same mailbox", async () => {
    vi.stubEnv(PER_ADDRESS_HOURLY_ENV, "1");
    expect((await reserveSignInCode("Same@Example.test")).allowed).toBe(true);
    expect((await reserveSignInCode("same@example.TEST")).allowed).toBe(false);
  });

  it("does not spend a unit of the day's allowance on an address it refuses", async () => {
    // This is the ordering that matters: one person hammering the form must not
    // consume the shared quota on the way to being told to stop.
    vi.stubEnv(PER_ADDRESS_HOURLY_ENV, "1");
    vi.stubEnv(DAILY_LIMIT_ENV, "3");
    await reserveSignInCode("greedy@example.test");
    for (let i = 0; i < 10; i++) await reserveSignInCode("greedy@example.test");

    // The day still has two left for everybody else.
    expect((await reserveSignInCode("a@example.test")).allowed).toBe(true);
    expect((await reserveSignInCode("b@example.test")).allowed).toBe(true);
    expect((await reserveSignInCode("c@example.test")).allowed).toBe(false);
  });

  it("refuses with reason \"global\" once the day's allowance is gone", async () => {
    vi.stubEnv(DAILY_LIMIT_ENV, "1");
    expect((await reserveSignInCode("first@example.test")).allowed).toBe(true);
    const refused = await reserveSignInCode("second@example.test");
    expect(refused.allowed).toBe(false);
    expect(refused.allowed === false && refused.reason).toBe("global");
  });

  it("leaves an innocent address's hourly allowance intact when the day is exhausted", async () => {
    // They did nothing wrong, and tomorrow their three should still be three.
    vi.stubEnv(PER_ADDRESS_HOURLY_ENV, "2");
    vi.stubEnv(DAILY_LIMIT_ENV, "1");
    await reserveSignInCode("used@example.test");

    const refused = await reserveSignInCode("innocent@example.test");
    expect(refused.allowed).toBe(false);

    // The day rolls; their address counter must not already be one down.
    vi.stubEnv(DAILY_LIMIT_ENV, "10");
    expect((await reserveSignInCode("innocent@example.test")).allowed).toBe(true);
    expect((await reserveSignInCode("innocent@example.test")).allowed).toBe(true);
    expect((await reserveSignInCode("innocent@example.test")).allowed).toBe(false);
  });

  it("counts each UTC day separately", async () => {
    vi.stubEnv(DAILY_LIMIT_ENV, "1");
    const tonight = new Date("2026-09-27T23:59:00.000Z");
    const tomorrow = new Date("2026-09-28T00:01:00.000Z");
    expect((await reserveSignInCode("x@example.test", tonight)).allowed).toBe(true);
    expect((await reserveSignInCode("y@example.test", tonight)).allowed).toBe(false);
    expect((await reserveSignInCode("y@example.test", tomorrow)).allowed).toBe(true);
  });

  it("gives both units back when the email did not actually go out", async () => {
    vi.stubEnv(PER_ADDRESS_HOURLY_ENV, "1");
    vi.stubEnv(DAILY_LIMIT_ENV, "1");
    const permission = await reserveSignInCode("failed@example.test");
    expect(permission.allowed).toBe(true);
    if (permission.allowed) await permission.release();

    // Both counters are back where they were, so a send failure costs nobody
    // anything.
    expect((await reserveSignInCode("failed@example.test")).allowed).toBe(true);
  });

  it("treats an explicit zero as a deliberate off switch for email codes", async () => {
    vi.stubEnv(DAILY_LIMIT_ENV, "0");
    const refused = await reserveSignInCode("anyone@example.test");
    expect(refused.allowed).toBe(false);
    expect(refused.allowed === false && refused.reason).toBe("global");
  });
});

describe("failing open when the counter is unreachable", () => {
  it("still sends, and says so with ratelimit-redis-error", async () => {
    // 27 Sep again: a throttle that cannot count must not become an outage. The
    // exposure is bounded by Better Auth's per-IP rules in front of this, and
    // by Resend refusing once its quota is gone.
    vi.resetModules();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "rejected");
    // A regular function, not an arrow: the counter calls `new Redis(...)`, and
    // an arrow function cannot be constructed.
    function throwingRedis() {
      return {
        incr: vi.fn(async () => {
          throw new Error("WRONGPASS invalid auth token");
        }),
        decr: vi.fn(async () => 0),
        expire: vi.fn(async () => 1),
        ttl: vi.fn(async () => 60),
        set: vi.fn(async () => "OK"),
        del: vi.fn(async () => 1),
      };
    }
    vi.doMock("@upstash/redis", () => ({ Redis: vi.fn().mockImplementation(throwingRedis) }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const limits = await import("@/lib/sign-in-limits");

    const decision = await limits.reserveSignInCode("outage@example.test");
    expect(decision.allowed).toBe(true);
    expect(warn.mock.calls.flat().join(" ")).toContain("ratelimit-redis-error");

    vi.doUnmock("@upstash/redis");
    vi.resetModules();
  });
});

describe("what the sign-in form shows", () => {
  it("names the pause and points at Google when the day's allowance is gone", () => {
    expect(signInSendError({ status: 429, code: SIGN_IN_CODES_PAUSED_CODE })).toBe(
      SIGN_IN_CODES_PAUSED_MESSAGE
    );
    expect(SIGN_IN_CODES_PAUSED_MESSAGE).toContain("Google");
  });

  it("tells one address to wait an hour, not a minute", () => {
    // Both refusals are 429s, and the generic "wait a minute" would be false
    // for either.
    expect(signInSendError({ status: 429, code: TOO_MANY_CODES_FOR_ADDRESS_CODE })).toBe(
      TOO_MANY_CODES_FOR_ADDRESS_MESSAGE
    );
    expect(TOO_MANY_CODES_FOR_ADDRESS_MESSAGE).not.toBe(RATE_LIMITED_MESSAGE);
  });

  it("still falls back to the ordinary throttle wording for Better Auth's own 429s", () => {
    expect(signInSendError({ status: 429 })).toBe(RATE_LIMITED_MESSAGE);
  });

  it("neither message says whether the address has an account", () => {
    for (const message of [SIGN_IN_CODES_PAUSED_MESSAGE, TOO_MANY_CODES_FOR_ADDRESS_MESSAGE]) {
      expect(message).not.toMatch(/account|registered|exists|unknown/i);
    }
  });
});
