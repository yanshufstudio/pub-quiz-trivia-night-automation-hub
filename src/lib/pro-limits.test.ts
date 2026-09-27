import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PRO_USER_DAILY_LIMIT,
  PRO_USER_DAILY_LIMIT_ENV,
  proDailyLimitMessage,
  PRO_GENERATION_OFF_MESSAGE,
  OFF_RETRY_SECONDS,
  proUserDailyLimit,
  reserveProDailyGeneration,
  shouldRollProPeriod,
  __resetProLimitCounters,
} from "@/lib/pro-limits";

/**
 * A Pro subscriber's own daily cap (H2) and the billing-period roll (M8).
 *
 * The shared ceiling has no identity in its key, which is what makes it proof
 * against rotating cookies and also what makes this necessary: without a
 * per-subscriber share, one Pro account running a loop consumes the whole day's
 * Pro capacity and every other paying customer is refused.
 */

beforeEach(() => {
  __resetProLimitCounters();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetProLimitCounters();
});

describe("the limit itself", () => {
  it("is ten a day unless the owner says otherwise", () => {
    expect(proUserDailyLimit()).toBe(DEFAULT_PRO_USER_DAILY_LIMIT);
    expect(DEFAULT_PRO_USER_DAILY_LIMIT).toBe(10);
  });

  it("takes the owner's number", () => {
    vi.stubEnv(PRO_USER_DAILY_LIMIT_ENV, "3");
    expect(proUserDailyLimit()).toBe(3);
  });

  it("falls back to the default rather than propagating a typo", () => {
    // "" is Number 0 and "ten" is NaN. A mistyped value must not silently
    // become a cap of zero, which would take Pro generation down for everyone
    // paying for it.
    for (const bad of ["", "   ", "ten", "-1", "2.5"]) {
      vi.stubEnv(PRO_USER_DAILY_LIMIT_ENV, bad);
      expect(proUserDailyLimit(), bad).toBe(DEFAULT_PRO_USER_DAILY_LIMIT);
    }
  });

  it("treats an explicit zero as a deliberate kill switch", async () => {
    vi.stubEnv(PRO_USER_DAILY_LIMIT_ENV, "0");
    expect(proUserDailyLimit()).toBe(0);
    const reservation = await reserveProDailyGeneration("creator_kill");
    expect(reservation.allowed).toBe(false);
    expect(reservation.used).toBe(0);
  });
});

describe("the message a capped subscriber reads", () => {
  it("names the number and the reset, in UTC", () => {
    expect(proDailyLimitMessage(10)).toBe(
      "You've made 10 packs today — the limit resets at 00:00 UTC."
    );
  });

  it("uses the configured number, not a hard-coded ten", () => {
    // Otherwise raising the cap to 25 would tell people they had made 10.
    expect(proDailyLimitMessage(25)).toContain("25 packs today");
  });

  it("does not claim zero packs and a midnight reset when the limit is zero", () => {
    // Driving the route with PRO_USER_DAILY_PACK_LIMIT=0 produced "You've made 0
    // packs today — the limit resets at 00:00 UTC.", which is false twice over:
    // they made none, and nothing resets, because a value was set rather than an
    // allowance spent.
    const message = proDailyLimitMessage(0);
    expect(message).toBe(PRO_GENERATION_OFF_MESSAGE);
    expect(message).not.toContain("0 packs");
    expect(message).not.toContain("00:00 UTC");
  });

  it("does not read like a fault or a suspension", () => {
    // Somebody is paying for this. "Try again later" or "not allowed" would be
    // the wrong shape of sentence.
    expect(proDailyLimitMessage(10)).not.toMatch(/error|wrong|not allowed|suspend|blocked/i);
  });
});

describe("a limit of zero, the deliberate kill switch", () => {
  it("reports itself as the service being off, with a short wait", async () => {
    vi.stubEnv(PRO_USER_DAILY_LIMIT_ENV, "0");
    const reservation = await reserveProDailyGeneration("creator-off");
    expect(reservation.allowed).toBe(false);
    expect(reservation.generationOff).toBe(true);
    // Not the time to midnight: a switch is thrown back when somebody throws it.
    expect(reservation.retryAfterSeconds).toBe(OFF_RETRY_SECONDS);
    expect(reservation.retryAfterSeconds).toBeLessThan(60);
    // And not the "we could not count" case, which needs different words again.
    expect(reservation.unavailable).toBeUndefined();
  });
});

describe("reserving one of today's packs", () => {
  it("allows exactly the limit, then refuses", async () => {
    vi.stubEnv(PRO_USER_DAILY_LIMIT_ENV, "3");
    for (let i = 1; i <= 3; i++) {
      const r = await reserveProDailyGeneration("creator_a");
      expect(r.allowed, `reservation ${i}`).toBe(true);
      expect(r.used).toBe(i);
    }
    const refused = await reserveProDailyGeneration("creator_a");
    expect(refused.allowed).toBe(false);
    expect(refused.used).toBe(3);
    expect(refused.limit).toBe(3);
  });

  it("does not push a refused caller's counter further past the limit", async () => {
    // Otherwise every retry would make the refusal longer-lived than the cap.
    vi.stubEnv(PRO_USER_DAILY_LIMIT_ENV, "1");
    await reserveProDailyGeneration("creator_b");
    for (let i = 0; i < 5; i++) await reserveProDailyGeneration("creator_b");
    const after = await reserveProDailyGeneration("creator_b");
    expect(after.used).toBe(1);
  });

  it("counts each subscriber separately", async () => {
    vi.stubEnv(PRO_USER_DAILY_LIMIT_ENV, "1");
    expect((await reserveProDailyGeneration("creator_c")).allowed).toBe(true);
    // One subscriber's exhausted day must not refuse another's first pack.
    expect((await reserveProDailyGeneration("creator_d")).allowed).toBe(true);
  });

  it("counts each UTC day separately", async () => {
    vi.stubEnv(PRO_USER_DAILY_LIMIT_ENV, "1");
    const monday = new Date("2026-09-27T23:59:00.000Z");
    const tuesday = new Date("2026-09-28T00:01:00.000Z");
    expect((await reserveProDailyGeneration("creator_e", monday)).allowed).toBe(true);
    expect((await reserveProDailyGeneration("creator_e", monday)).allowed).toBe(false);
    expect((await reserveProDailyGeneration("creator_e", tuesday)).allowed).toBe(true);
  });

  it("asks a refused caller to wait until the reset, not longer", async () => {
    vi.stubEnv(PRO_USER_DAILY_LIMIT_ENV, "1");
    const noon = new Date("2026-09-27T12:00:00.000Z");
    await reserveProDailyGeneration("creator_f", noon);
    const refused = await reserveProDailyGeneration("creator_f", noon);
    // 12 hours to midnight UTC.
    expect(refused.retryAfterSeconds).toBe(12 * 60 * 60);
  });

  it("gives a unit back when the work it was reserved for did not happen", async () => {
    vi.stubEnv(PRO_USER_DAILY_LIMIT_ENV, "1");
    const first = await reserveProDailyGeneration("creator_g");
    expect(first.allowed).toBe(true);
    await first.release();
    expect((await reserveProDailyGeneration("creator_g")).allowed).toBe(true);
  });

  it("only gives a unit back once, however many times release is called", async () => {
    vi.stubEnv(PRO_USER_DAILY_LIMIT_ENV, "2");
    const r = await reserveProDailyGeneration("creator_h");
    await r.release();
    await r.release();
    await r.release();
    // One unit returned, so one is still spent by the reservation above... which
    // was given back: the next two must both be available, and a third not.
    expect((await reserveProDailyGeneration("creator_h")).allowed).toBe(true);
    expect((await reserveProDailyGeneration("creator_h")).allowed).toBe(true);
    expect((await reserveProDailyGeneration("creator_h")).allowed).toBe(false);
  });
});

describe("rolling the billing period (M8)", () => {
  const sept = new Date("2026-09-01T00:00:00.000Z");
  const oct = new Date("2026-10-01T00:00:00.000Z");

  it("rolls the first time Paddle reports a period at all", () => {
    expect(shouldRollProPeriod(sept, null)).toBe(true);
  });

  it("rolls when Paddle reports a later period than the one counted against", () => {
    expect(shouldRollProPeriod(oct, sept)).toBe(true);
  });

  it("does not roll on the same period reported again", () => {
    // Paddle sends several events inside one period, and each of them must not
    // zero the count accrued in it.
    expect(shouldRollProPeriod(sept, sept)).toBe(false);
  });

  it("does not roll backwards on a retried or out-of-order event", () => {
    // Paddle delivers at least once and retries for three days, so an old
    // event arriving late is ordinary. Rolling on it would wipe the current
    // period's count — the number /refunds is decided on.
    expect(shouldRollProPeriod(sept, oct)).toBe(false);
  });

  it("does not roll when the event reports no period", () => {
    // A cancellation carries none. "No period reported" is not "a new period".
    expect(shouldRollProPeriod(null, sept)).toBe(false);
    expect(shouldRollProPeriod(null, null)).toBe(false);
  });
});
