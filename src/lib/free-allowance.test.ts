import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_FREE_IP_DAILY_LIMIT,
  FREE_IP_DAILY_LIMIT_ENV,
  FREE_IP_LIMIT_MESSAGE,
  freeIpDailyLimit,
  normaliseForFreeAllowance,
  freeAllowanceKey,
  FREE_ALLOWANCE_KEY_VERSION,
  reserveFreeIpDaily,
  __resetFreeAllowanceCounters,
} from "@/lib/free-allowance";
import { __resetRateLimitWarnThrottle } from "@/lib/rate-limit";

/**
 * Free-tier abuse that needs no cookie (H1).
 *
 * Accounts closed the cookie door — generation needs one, so dropping
 * `pq_creator` no longer hands out a fresh allowance. What stayed open is that
 * signing up is free: aliases of one mailbox were separate accounts with
 * separate allowances, and nothing bounded how many free packs one machine could
 * take in a day.
 */

beforeEach(() => {
  __resetFreeAllowanceCounters();
  __resetRateLimitWarnThrottle();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetFreeAllowanceCounters();
  vi.restoreAllMocks();
});

describe("the mailbox behind an address", () => {
  it("folds Gmail's own documented equivalences", () => {
    // All of these are one inbox, and Google delivers all of them.
    for (const alias of [
      "someone@gmail.com",
      "someone+1@gmail.com",
      "some.one@gmail.com",
      "s.o.m.e.o.n.e+quiz@gmail.com",
      "someone@googlemail.com",
      "some.one+2@googlemail.com",
      "  SomeOne+Tag@GoogleMail.COM  ",
    ]) {
      expect(normaliseForFreeAllowance(alias), alias).toBe("someone@gmail.com");
    }
  });

  it("strips +tags on every other domain", () => {
    expect(normaliseForFreeAllowance("host+quiz@example.com")).toBe("host@example.com");
    expect(normaliseForFreeAllowance("HOST+a+b@Example.COM")).toBe("host@example.com");
  });

  it("does NOT remove dots outside Gmail", () => {
    // first.last@company.com and firstlast@company.com are two different people
    // at most companies. Merging them would deny a real customer their free
    // packs, which is a worse error than letting a determined abuser have two
    // more.
    expect(normaliseForFreeAllowance("first.last@company.com")).toBe("first.last@company.com");
    expect(normaliseForFreeAllowance("firstlast@company.com")).toBe("firstlast@company.com");
    expect(normaliseForFreeAllowance("first.last@company.com")).not.toBe(
      normaliseForFreeAllowance("firstlast@company.com")
    );
  });

  it("does not fold a domain that merely looks like Gmail", () => {
    // googlemail.co.uk and notgmail.com are not Google's.
    expect(normaliseForFreeAllowance("a.b@googlemail.co.uk")).toBe("a.b@googlemail.co.uk");
    expect(normaliseForFreeAllowance("a.b@notgmail.com")).toBe("a.b@notgmail.com");
  });

  it("keeps different mailboxes apart", () => {
    expect(normaliseForFreeAllowance("alice@gmail.com")).not.toBe(
      normaliseForFreeAllowance("bob@gmail.com")
    );
  });

  it("does not produce an empty local part out of a degenerate address", () => {
    // "...@gmail.com" would become "@gmail.com" under naive dot-stripping, and
    // every such address would then share one allowance.
    expect(normaliseForFreeAllowance("...@gmail.com")).toBe("...@gmail.com");
    expect(normaliseForFreeAllowance("+tag@gmail.com")).toBe("+tag@gmail.com");
  });

  it("leaves something it cannot parse alone, beyond lower-casing", () => {
    expect(normaliseForFreeAllowance("  NotAnAddress ")).toBe("notanaddress");
    expect(normaliseForFreeAllowance("@example.com")).toBe("@example.com");
    expect(normaliseForFreeAllowance("host@")).toBe("host@");
  });
});

describe("the normalisation is for counting free packs and nothing else", () => {
  /**
   * The brief's hard constraint: sign-in identity and account lookup must not
   * change — an account created as `Some.One+quiz@Gmail.com` signs in as exactly
   * that, today and after this change.
   *
   * That is a property of where the function is *not* used, so it is asserted
   * structurally. A future change that reaches for it in the auth path, the
   * creator lookup, or a User.email comparison fails here rather than silently
   * merging two people's accounts.
   */
  // Tighter than it needs to be on purpose: the mailbox key is not wired to
  // anything yet (see the note on normaliseForFreeAllowance), so *nothing*
  // outside its own module should mention it. When the owner decides how the
  // shared allowance is stored, whatever consumes it gets added here
  // deliberately rather than by accident.
  const ALLOWED = new Set([
    path.join("src", "lib", "free-allowance.ts"),
    path.join("src", "lib", "free-allowance.test.ts"),
  ]);

  function sourceFiles(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) sourceFiles(full, found);
      else if (/\.(ts|tsx)$/.test(entry)) found.push(full);
    }
    return found;
  }

  /** An `import { … normaliseForFreeAllowance … } from "@/lib/free-allowance"`,
   * in any of the shapes the codebase uses. Prose that merely names the function
   * — a comment explaining why it is not wired up — is not a use of it. */
  const IMPORTS_IT = /import[\s\S]*?normaliseForFreeAllowance[\s\S]*?from\s+["']@\/lib\/free-allowance["']/;

  it("is imported nowhere outside its own module and tests", () => {
    const offenders = sourceFiles("src")
      .filter((file) => !ALLOWED.has(file))
      .filter((file) => IMPORTS_IT.test(readFileSync(file, "utf8")));

    expect(
      offenders,
      "free-allowance normalisation must never reach sign-in or account lookup — see H1"
    ).toEqual([]);
  });

  it("is not reachable from the auth modules at all", () => {
    for (const file of [
      path.join("src", "lib", "auth.ts"),
      path.join("src", "lib", "auth-guard.ts"),
      path.join("src", "lib", "creator.ts"),
      path.join("src", "lib", "creator-claim.ts"),
    ]) {
      expect(readFileSync(file, "utf8")).not.toContain("free-allowance");
    }
  });
});

describe("one address's free packs for a day (H1a)", () => {
  it("defaults to five, and takes the owner's number", () => {
    expect(freeIpDailyLimit()).toBe(DEFAULT_FREE_IP_DAILY_LIMIT);
    expect(DEFAULT_FREE_IP_DAILY_LIMIT).toBe(5);
    vi.stubEnv(FREE_IP_DAILY_LIMIT_ENV, "2");
    expect(freeIpDailyLimit()).toBe(2);
    vi.stubEnv(FREE_IP_DAILY_LIMIT_ENV, "lots");
    expect(freeIpDailyLimit()).toBe(DEFAULT_FREE_IP_DAILY_LIMIT);
  });

  it("allows the day's allowance from one address, then refuses it", async () => {
    vi.stubEnv(FREE_IP_DAILY_LIMIT_ENV, "2");
    expect((await reserveFreeIpDaily("1.1.1.1")).allowed).toBe(true);
    expect((await reserveFreeIpDaily("1.1.1.1")).allowed).toBe(true);
    const refused = await reserveFreeIpDaily("1.1.1.1");
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts addresses and days separately", async () => {
    vi.stubEnv(FREE_IP_DAILY_LIMIT_ENV, "1");
    const tonight = new Date("2026-09-27T23:00:00.000Z");
    const tomorrow = new Date("2026-09-28T01:00:00.000Z");
    expect((await reserveFreeIpDaily("2.2.2.2", tonight)).allowed).toBe(true);
    expect((await reserveFreeIpDaily("2.2.2.2", tonight)).allowed).toBe(false);
    // A different pub, and the next day.
    expect((await reserveFreeIpDaily("3.3.3.3", tonight)).allowed).toBe(true);
    expect((await reserveFreeIpDaily("2.2.2.2", tomorrow)).allowed).toBe(true);
  });

  it("gives the unit back when no pack was produced", async () => {
    vi.stubEnv(FREE_IP_DAILY_LIMIT_ENV, "1");
    const first = await reserveFreeIpDaily("4.4.4.4");
    await first.release();
    expect((await reserveFreeIpDaily("4.4.4.4")).allowed).toBe(true);
  });

  it("says what to do instead, and does not blame the person", async () => {
    expect(FREE_IP_LIMIT_MESSAGE).toContain("tomorrow");
    expect(FREE_IP_LIMIT_MESSAGE).toContain("Pro");
    expect(FREE_IP_LIMIT_MESSAGE).not.toMatch(/abuse|suspicious|blocked|banned/i);
  });
});

describe("the per-address cap fails open when Upstash is unreachable", () => {
  it("lets a legitimate host keep working, and says so", async () => {
    // An abuse control that cannot count must not stop people using the product
    // (N1). The global ceiling still fails closed behind these, so an outage
    // cannot become unbounded spend.
    vi.resetModules();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "rejected");
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
    const free = await import("@/lib/free-allowance");

    expect((await free.reserveFreeIpDaily("9.9.9.9")).allowed).toBe(true);
    expect(warn.mock.calls.flat().join(" ")).toContain("ratelimit-redis-error");

    vi.doUnmock("@upstash/redis");
    vi.resetModules();
  });
});

describe("the stored key for a mailbox", () => {
  it("is a digest, not the address", () => {
    const key = freeAllowanceKey("Some.One+quiz@Gmail.com");
    expect(key).not.toContain("@");
    expect(key).not.toContain("someone");
    expect(key).not.toContain("Some.One");
    // The row outlives the deletion of every account behind it — a cap a
    // "delete my account" resets is not a cap — so it must not be a second
    // stored copy of somebody's address.
    expect(key).toMatch(/^v1\.[0-9a-f]{64}$/);
  });

  it("gives every alias of one mailbox the same key", () => {
    const expected = freeAllowanceKey("someone@gmail.com");
    for (const alias of [
      "someone+1@gmail.com",
      "some.one@gmail.com",
      "s.o.m.e.o.n.e+anything@googlemail.com",
      "  SomeOne@GMAIL.com  ",
    ]) {
      expect(freeAllowanceKey(alias)).toBe(expected);
    }
  });

  it("gives different mailboxes different keys", () => {
    expect(freeAllowanceKey("someone@gmail.com")).not.toBe(freeAllowanceKey("someoneelse@gmail.com"));
    // Dots outside Gmail are two different people, so two different keys.
    expect(freeAllowanceKey("first.last@company.test")).not.toBe(
      freeAllowanceKey("firstlast@company.test")
    );
  });

  it("names the normalisation it was taken under", () => {
    // If the folding rules ever change, the keys change with them and every
    // mailbox starts a fresh allowance. The prefix makes that a visible
    // decision rather than a silent one.
    expect(FREE_ALLOWANCE_KEY_VERSION).toBe("v1");
    expect(freeAllowanceKey("someone@gmail.com").startsWith("v1.")).toBe(true);
  });
});
