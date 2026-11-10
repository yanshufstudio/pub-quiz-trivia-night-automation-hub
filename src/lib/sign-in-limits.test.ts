import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DAILY_LIMIT_ENV,
  DEFAULT_DAILY_LIMIT,
  DEFAULT_PER_ADDRESS_HOURLY,
  DEFAULT_PER_IP_DAILY,
  DEFAULT_PER_IP_HOURLY,
  PER_ADDRESS_HOURLY_ENV,
  PER_IP_DAILY_ENV,
  PER_IP_HOURLY_ENV,
  dailyCodeLimit,
  isEmailTooLong,
  perAddressHourlyLimit,
  perIpDailyLimit,
  perIpHourlyLimit,
  reserveSignInCode,
  signInCodeKeyFor,
  signInIpKeyFor,
  __resetSignInLimitCounters,
} from "@/lib/sign-in-limits";
import {
  EMAIL_TOO_LONG_CODE,
  EMAIL_TOO_LONG_MESSAGE,
  MAX_EMAIL_LENGTH,
  SIGN_IN_CODES_PAUSED_CODE,
  SIGN_IN_CODES_PAUSED_MESSAGE,
  TOO_MANY_CODES_FOR_ADDRESS_CODE,
  TOO_MANY_CODES_FOR_ADDRESS_MESSAGE,
  TOO_MANY_CODES_FROM_HERE_CODE,
  TOO_MANY_CODES_FROM_HERE_MESSAGE,
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

// One caller for the tests that are not about the per-IP cap.
const HERE = "203.0.113.1";
const reserve = (address: string, now?: Date) => reserveSignInCode(address, HERE, now);

beforeEach(() => {
  __resetSignInLimitCounters();
  __resetRateLimitWarnThrottle();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetSignInLimitCounters();
  vi.restoreAllMocks();
});

describe("the three limits", () => {
  it("defaults to 3 an hour per address, 10 an hour per caller, and 80 a day overall", () => {
    expect(perAddressHourlyLimit()).toBe(DEFAULT_PER_ADDRESS_HOURLY);
    expect(perIpHourlyLimit()).toBe(DEFAULT_PER_IP_HOURLY);
    expect(dailyCodeLimit()).toBe(DEFAULT_DAILY_LIMIT);
    expect(DEFAULT_PER_ADDRESS_HOURLY).toBe(3);
    expect(DEFAULT_PER_IP_HOURLY).toBe(10);
    expect(perIpDailyLimit()).toBe(DEFAULT_PER_IP_DAILY);
    expect(DEFAULT_PER_IP_DAILY).toBe(20);
    // Short of Resend's 100, on purpose: the rest is left for the other
    // product on the account.
    expect(DEFAULT_DAILY_LIMIT).toBe(80);
    expect(DEFAULT_DAILY_LIMIT).toBeLessThan(100);
  });

  it("takes the owner's numbers, and ignores a typo rather than propagating it", () => {
    vi.stubEnv(PER_ADDRESS_HOURLY_ENV, "5");
    vi.stubEnv(PER_IP_HOURLY_ENV, "7");
    vi.stubEnv(DAILY_LIMIT_ENV, "80");
    expect(perAddressHourlyLimit()).toBe(5);
    expect(perIpHourlyLimit()).toBe(7);
    expect(dailyCodeLimit()).toBe(80);

    vi.stubEnv(PER_ADDRESS_HOURLY_ENV, "three");
    vi.stubEnv(PER_IP_HOURLY_ENV, "-1");
    vi.stubEnv(DAILY_LIMIT_ENV, "");
    expect(perAddressHourlyLimit()).toBe(DEFAULT_PER_ADDRESS_HOURLY);
    expect(perIpHourlyLimit()).toBe(DEFAULT_PER_IP_HOURLY);
    expect(dailyCodeLimit()).toBe(DEFAULT_DAILY_LIMIT);
  });
});

describe("one caller cannot spend everybody's allowance (H1)", () => {
  const stranger = (i: number) => `stranger-${i}@example.test`;

  it("refuses a caller at its own hourly cap, and nobody else notices", async () => {
    // The lockout: a different address every time, so the per-address cap never
    // fires. It used to run until the day's shared total was gone.
    for (let i = 0; i < DEFAULT_PER_IP_HOURLY; i++) {
      expect((await reserveSignInCode(stranger(i), "198.51.100.7")).allowed).toBe(true);
    }
    for (let i = 0; i < 100; i++) {
      const refused = await reserveSignInCode(stranger(1000 + i), "198.51.100.7");
      expect(refused.allowed === false && refused.reason).toBe("ip");
    }

    // A host on another network still gets a code — and the hundred refusals
    // spent nothing of the day's total, which has exactly its ten gone.
    vi.stubEnv(DAILY_LIMIT_ENV, String(DEFAULT_PER_IP_HOURLY + 1));
    expect((await reserveSignInCode("host@example.test", "192.0.2.44")).allowed).toBe(true);
    const full = await reserveSignInCode("late@example.test", "192.0.2.45");
    expect(full.allowed === false && full.reason).toBe("global");
  });

  it("counts an IPv6 caller by its /64, however it writes or changes its address", async () => {
    expect(signInIpKeyFor("2001:db8:12:3400:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:12:3400::/64");
    expect(signInIpKeyFor("2001:0DB8:0012:3400::1")).toBe("2001:db8:12:3400::/64");
    expect(signInIpKeyFor("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(signInIpKeyFor("2001:db8:12:3401::1")).not.toBe(signInIpKeyFor("2001:db8:12:3400::1"));
    // IPv4 is one caller per address, also when written the IPv6 way.
    expect(signInIpKeyFor("203.0.113.5")).toBe("203.0.113.5");
    expect(signInIpKeyFor("::ffff:203.0.113.5")).toBe("203.0.113.5");

    // One connection choosing a fresh address in its own block each time.
    vi.stubEnv(PER_IP_HOURLY_ENV, "2");
    expect((await reserveSignInCode(stranger(1), "2001:db8:12:3400::1")).allowed).toBe(true);
    expect((await reserveSignInCode(stranger(2), "2001:db8:12:3400:ffff::2")).allowed).toBe(true);
    const refused = await reserveSignInCode(stranger(3), "2001:db8:12:3400:1:2:3:4");
    expect(refused.allowed === false && refused.reason).toBe("ip");
    expect((await reserveSignInCode(stranger(4), "2001:db8:12:3401::1")).allowed).toBe(true);
  });

  it("gives the address's unit back when the caller's cap refuses", async () => {
    vi.stubEnv(PER_ADDRESS_HOURLY_ENV, "1");
    vi.stubEnv(PER_IP_HOURLY_ENV, "1");
    await reserveSignInCode("first@example.test", "198.51.100.7");
    const refused = await reserveSignInCode("host@example.test", "198.51.100.7");
    expect(refused.allowed === false && refused.reason).toBe("ip");

    // The real owner of that mailbox, from their own network, is not one down.
    expect((await reserveSignInCode("host@example.test", "192.0.2.44")).allowed).toBe(true);
  });

  it("lets the caller back in an hour later, not at midnight", async () => {
    // A shared network (an office, a carrier) must not be shut out for the day.
    vi.stubEnv(PER_IP_HOURLY_ENV, "1");
    const now = new Date("2026-11-09T10:00:00.000Z");
    const soon = new Date("2026-11-09T10:59:00.000Z");
    const later = new Date("2026-11-09T11:01:00.000Z");
    expect((await reserveSignInCode("x@example.test", "198.51.100.7", now)).allowed).toBe(true);
    expect((await reserveSignInCode("y@example.test", "198.51.100.7", soon)).allowed).toBe(false);
    expect((await reserveSignInCode("y@example.test", "198.51.100.7", later)).allowed).toBe(true);
  });

  it("stops one caller for the day long before it could use up everybody's total", async () => {
    // Ten an hour alone would let one address reach the day's 80 in eight
    // hours and pause email sign-in for every host.
    expect(DEFAULT_PER_IP_DAILY).toBeLessThan(DEFAULT_DAILY_LIMIT / 2);
    let sent = 0;
    for (let hour = 0; hour < 24; hour++) {
      const at = new Date(Date.UTC(2026, 10, 9, hour, 30));
      for (let i = 0; i < DEFAULT_PER_IP_HOURLY; i++) {
        const decision = await reserveSignInCode(stranger(hour * 100 + i), "198.51.100.7", at);
        if (decision.allowed) sent += 1;
        else expect(decision.reason).toBe("ip");
      }
    }
    expect(sent).toBe(DEFAULT_PER_IP_DAILY);

    // Everyone else still has the rest of the day's total, and the caller
    // itself is let back in the next UTC day.
    const evening = new Date(Date.UTC(2026, 10, 9, 23, 45));
    expect((await reserveSignInCode("host@example.test", "192.0.2.44", evening)).allowed).toBe(true);
    const nextDay = new Date(Date.UTC(2026, 10, 10, 0, 50));
    expect((await reserveSignInCode(stranger(9999), "198.51.100.7", nextDay)).allowed).toBe(true);
  });

  it("reads the daily per-caller cap from its own variable", async () => {
    vi.stubEnv(PER_IP_DAILY_ENV, "1");
    expect(perIpDailyLimit()).toBe(1);
    expect((await reserveSignInCode(stranger(1), "198.51.100.7")).allowed).toBe(true);
    const refused = await reserveSignInCode(stranger(2), "198.51.100.7");
    expect(refused.allowed === false && refused.reason).toBe("ip");
    vi.stubEnv(PER_IP_DAILY_ENV, "twenty");
    expect(perIpDailyLimit()).toBe(DEFAULT_PER_IP_DAILY);
  });

  it("gives all three units back when the email did not go out", async () => {
    vi.stubEnv(PER_IP_HOURLY_ENV, "1");
    const permission = await reserve("failed@example.test");
    if (permission.allowed) await permission.release();
    expect((await reserve("again@example.test")).allowed).toBe(true);
  });

  it("names the network, and no wait that could be wrong for either of its two caps", () => {
    expect(signInSendError({ status: 429, code: TOO_MANY_CODES_FROM_HERE_CODE })).toBe(
      TOO_MANY_CODES_FROM_HERE_MESSAGE
    );
    expect(TOO_MANY_CODES_FROM_HERE_MESSAGE).toMatch(/network/);
    expect(TOO_MANY_CODES_FROM_HERE_MESSAGE).toMatch(/later/);
    expect(TOO_MANY_CODES_FROM_HERE_MESSAGE).not.toMatch(/minute|hour|tomorrow|today/);
    expect(TOO_MANY_CODES_FROM_HERE_MESSAGE).toContain("Google");
    expect(TOO_MANY_CODES_FROM_HERE_MESSAGE).not.toMatch(/account|registered|exists|unknown/i);
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
      expect((await reserve("one@example.test")).allowed).toBe(true);
    }
    const refused = await reserve("one@example.test");
    expect(refused.allowed).toBe(false);
    expect(refused.allowed === false && refused.reason).toBe("address");
  });

  it("counts a differently-capitalised address as the same mailbox", async () => {
    vi.stubEnv(PER_ADDRESS_HOURLY_ENV, "1");
    expect((await reserve("Same@Example.test")).allowed).toBe(true);
    expect((await reserve("same@example.TEST")).allowed).toBe(false);
  });

  it("does not spend a unit of the day's allowance on an address it refuses", async () => {
    // This is the ordering that matters: one person hammering the form must not
    // consume the shared quota on the way to being told to stop.
    vi.stubEnv(PER_ADDRESS_HOURLY_ENV, "1");
    vi.stubEnv(DAILY_LIMIT_ENV, "3");
    await reserve("greedy@example.test");
    for (let i = 0; i < 10; i++) await reserve("greedy@example.test");

    // The day still has two left for everybody else.
    expect((await reserve("a@example.test")).allowed).toBe(true);
    expect((await reserve("b@example.test")).allowed).toBe(true);
    expect((await reserve("c@example.test")).allowed).toBe(false);
  });

  it("refuses with reason \"global\" once the day's allowance is gone", async () => {
    vi.stubEnv(DAILY_LIMIT_ENV, "1");
    expect((await reserve("first@example.test")).allowed).toBe(true);
    const refused = await reserve("second@example.test");
    expect(refused.allowed).toBe(false);
    expect(refused.allowed === false && refused.reason).toBe("global");
  });

  it("leaves an innocent address's hourly allowance intact when the day is exhausted", async () => {
    // They did nothing wrong, and tomorrow their three should still be three.
    vi.stubEnv(PER_ADDRESS_HOURLY_ENV, "2");
    vi.stubEnv(DAILY_LIMIT_ENV, "1");
    await reserve("used@example.test");

    const refused = await reserve("innocent@example.test");
    expect(refused.allowed).toBe(false);

    // The day rolls; their address counter must not already be one down.
    vi.stubEnv(DAILY_LIMIT_ENV, "10");
    expect((await reserve("innocent@example.test")).allowed).toBe(true);
    expect((await reserve("innocent@example.test")).allowed).toBe(true);
    expect((await reserve("innocent@example.test")).allowed).toBe(false);
  });

  it("counts each UTC day separately", async () => {
    vi.stubEnv(DAILY_LIMIT_ENV, "1");
    const tonight = new Date("2026-09-27T23:59:00.000Z");
    const tomorrow = new Date("2026-09-28T00:01:00.000Z");
    expect((await reserve("x@example.test", tonight)).allowed).toBe(true);
    expect((await reserve("y@example.test", tonight)).allowed).toBe(false);
    expect((await reserve("y@example.test", tomorrow)).allowed).toBe(true);
  });

  it("gives both units back when the email did not actually go out", async () => {
    vi.stubEnv(PER_ADDRESS_HOURLY_ENV, "1");
    vi.stubEnv(DAILY_LIMIT_ENV, "1");
    const permission = await reserve("failed@example.test");
    expect(permission.allowed).toBe(true);
    if (permission.allowed) await permission.release();

    // Both counters are back where they were, so a send failure costs nobody
    // anything.
    expect((await reserve("failed@example.test")).allowed).toBe(true);
  });

  it("treats an explicit zero as a deliberate off switch for email codes", async () => {
    vi.stubEnv(DAILY_LIMIT_ENV, "0");
    const refused = await reserve("anyone@example.test");
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

    const decision = await limits.reserveSignInCode("outage@example.test", HERE);
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

describe("an address too long to be a mailbox", () => {
  const local = (n: number) => "a".repeat(n);

  it("refuses anything over 254 characters", () => {
    // RFC 5321 bounds the path at 256 octets including the angle brackets, so 254
    // is the address itself. Anything longer is a paste or a probe.
    const domain = "@example.test";
    const atLimit = local(MAX_EMAIL_LENGTH - domain.length) + domain;
    expect(atLimit).toHaveLength(MAX_EMAIL_LENGTH);
    expect(isEmailTooLong(atLimit)).toBe(false);
    expect(isEmailTooLong(local(MAX_EMAIL_LENGTH - domain.length + 1) + domain)).toBe(true);
  });

  it("measures the address the caps count, not the raw string", () => {
    // Surrounding whitespace must not push a legitimate address over the line —
    // it is measured after signInCodeKeyFor trims and lower-cases, which is the
    // same string the per-address cap is keyed on.
    const domain = "@example.test";
    const atLimit = local(MAX_EMAIL_LENGTH - domain.length) + domain;
    expect(isEmailTooLong(`   ${atLimit}\n`)).toBe(false);
    expect(isEmailTooLong(atLimit.toUpperCase())).toBe(false);
  });

  it("says so in a way the form can read back", () => {
    // It is not a throttle: no waiting fixes it, so the message says what to
    // change rather than when to come back.
    expect(signInSendError({ status: 400, code: EMAIL_TOO_LONG_CODE })).toBe(EMAIL_TOO_LONG_MESSAGE);
    expect(EMAIL_TOO_LONG_MESSAGE).toContain("254");
    expect(EMAIL_TOO_LONG_MESSAGE).not.toMatch(/wait|tomorrow|hour/i);
  });
});
