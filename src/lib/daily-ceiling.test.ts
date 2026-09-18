import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_FREE_DAILY_CEILING,
  DEFAULT_PRO_DAILY_CEILING,
  FREE_CEILING_ENV,
  PRO_CEILING_ENV,
  __resetMemoryCounters,
  dailyCeilingFor,
  parseCeiling,
  reserveDailyGeneration,
} from "@/lib/daily-ceiling";

const ENV_KEYS = [FREE_CEILING_ENV, PRO_CEILING_ENV] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  __resetMemoryCounters();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  __resetMemoryCounters();
});

describe("parseCeiling", () => {
  it("falls back on anything that isn't a non-negative integer", () => {
    // A blank or typo'd value must not become a ceiling of zero — that would
    // take generation down for everybody, silently.
    for (const raw of [undefined, "", "   ", "fifty", "-1", "2.5", "NaN", "1e3x"]) {
      expect(parseCeiling(raw, 50)).toBe(50);
    }
  });

  it("takes a real value, including an explicit zero kill switch", () => {
    expect(parseCeiling("120", 50)).toBe(120);
    expect(parseCeiling("0", 50)).toBe(0);
  });
});

describe("dailyCeilingFor", () => {
  it("defaults each plan to its own documented ceiling", () => {
    expect(dailyCeilingFor("FREE")).toBe(DEFAULT_FREE_DAILY_CEILING);
    expect(dailyCeilingFor("PRO")).toBe(DEFAULT_PRO_DAILY_CEILING);
  });

  it("reads the environment per call, so a change needs no rebuild", () => {
    process.env[FREE_CEILING_ENV] = "7";
    process.env[PRO_CEILING_ENV] = "9";
    expect(dailyCeilingFor("FREE")).toBe(7);
    expect(dailyCeilingFor("PRO")).toBe(9);

    // Same process, no module reload — the point of reading it per call.
    process.env[FREE_CEILING_ENV] = "8";
    expect(dailyCeilingFor("FREE")).toBe(8);
  });

  it("treats an unknown plan as FREE", () => {
    process.env[FREE_CEILING_ENV] = "3";
    expect(dailyCeilingFor("LEGENDARY")).toBe(3);
  });
});

describe("reserveDailyGeneration", () => {
  const noon = new Date("2026-09-18T12:00:00.000Z");

  it("allows up to the ceiling and refuses past it", async () => {
    process.env[FREE_CEILING_ENV] = "3";
    for (let i = 1; i <= 3; i++) {
      const r = await reserveDailyGeneration("FREE", noon);
      expect(r.allowed).toBe(true);
      expect(r.used).toBe(i);
    }

    const refused = await reserveDailyGeneration("FREE", noon);
    expect(refused.allowed).toBe(false);
    expect(refused.limit).toBe(3);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("does not let refused attempts push the counter away from the ceiling", async () => {
    process.env[FREE_CEILING_ENV] = "1";
    const held = await reserveDailyGeneration("FREE", noon);
    expect(held.allowed).toBe(true);

    // Five refusals. Each one INCRs before it can compare against the
    // ceiling, so each must hand that unit straight back.
    for (let i = 0; i < 5; i++) {
      expect((await reserveDailyGeneration("FREE", noon)).allowed).toBe(false);
    }

    // The proof: release the one real reservation and the day is open again.
    // If the refusals had kept their units the counter would sit at 6, and
    // this would still be refused. (The earlier version of this test never
    // called release at all, so it passed whether or not refusals gave
    // anything back — it asserted nothing about its own name.)
    await held.release();
    expect((await reserveDailyGeneration("FREE", noon)).allowed).toBe(true);
  });

  it("counts FREE and PRO in separate buckets", async () => {
    process.env[FREE_CEILING_ENV] = "1";
    process.env[PRO_CEILING_ENV] = "1";

    expect((await reserveDailyGeneration("FREE", noon)).allowed).toBe(true);
    expect((await reserveDailyGeneration("FREE", noon)).allowed).toBe(false);
    // Free traffic exhausting its ceiling must never lock out a paying user.
    expect((await reserveDailyGeneration("PRO", noon)).allowed).toBe(true);
  });

  it("hands an unspent reservation back", async () => {
    process.env[FREE_CEILING_ENV] = "1";
    const first = await reserveDailyGeneration("FREE", noon);
    expect(first.allowed).toBe(true);
    expect((await reserveDailyGeneration("FREE", noon)).allowed).toBe(false);

    await first.release();
    expect((await reserveDailyGeneration("FREE", noon)).allowed).toBe(true);
  });

  it("releases at most once, however many times it is called", async () => {
    process.env[FREE_CEILING_ENV] = "2";
    const r = await reserveDailyGeneration("FREE", noon);
    await r.release();
    await r.release();
    await r.release();

    // One reservation, released once: exactly two must remain available.
    expect((await reserveDailyGeneration("FREE", noon)).allowed).toBe(true);
    expect((await reserveDailyGeneration("FREE", noon)).allowed).toBe(true);
    expect((await reserveDailyGeneration("FREE", noon)).allowed).toBe(false);
  });

  it("starts a fresh allowance on the next UTC day", async () => {
    process.env[FREE_CEILING_ENV] = "1";
    const lateYesterday = new Date("2026-09-18T23:59:00.000Z");
    expect((await reserveDailyGeneration("FREE", lateYesterday)).allowed).toBe(true);
    expect((await reserveDailyGeneration("FREE", lateYesterday)).allowed).toBe(false);

    const justAfterMidnight = new Date("2026-09-19T00:01:00.000Z");
    expect((await reserveDailyGeneration("FREE", justAfterMidnight)).allowed).toBe(true);
  });

  it("refuses everything at a ceiling of zero", async () => {
    process.env[FREE_CEILING_ENV] = "0";
    const r = await reserveDailyGeneration("FREE", noon);
    expect(r.allowed).toBe(false);
    expect(r.limit).toBe(0);
  });
});
