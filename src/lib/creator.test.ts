import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canGenerate,
  DEFAULT_FREE_LIMIT,
  FREE_LIMIT,
  effectivePlan,
  isProFromAnotherEnvironment,
  parseFreeLimit,
  withRolledPeriod,
} from "@/lib/creator";
import type { Creator } from "@prisma/client";

function makeCreator(overrides: Partial<Creator> = {}): Creator {
  return {
    id: "creator_1",
    deviceKey: "device_1",
    plan: "FREE",
    packsGeneratedInPeriod: 0,
    periodStartedAt: new Date(),
    createdAt: new Date(),
    userId: null,
    paddleCustomerId: null,
    paddleSubscriptionId: null,
    subscriptionStatus: null,
    subscriptionUpdatedAt: null,
    proPacksGeneratedInPeriod: 0,
    proPeriodStartedAt: null,
    proWindowCount: 0,
    proWindowStartedAt: null,
    proEnvironment: null,
    email: null,
    ...overrides,
  };
}

describe("withRolledPeriod", () => {
  it("leaves an in-window creator unchanged", () => {
    const creator = makeCreator({ packsGeneratedInPeriod: 1, periodStartedAt: new Date() });
    const rolled = withRolledPeriod(creator);
    expect(rolled.packsGeneratedInPeriod).toBe(1);
    expect(rolled.periodStartedAt).toBe(creator.periodStartedAt);
  });

  it("resets an expired-period creator", () => {
    const longAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const creator = makeCreator({ packsGeneratedInPeriod: 2, periodStartedAt: longAgo });
    const rolled = withRolledPeriod(creator);
    expect(rolled.packsGeneratedInPeriod).toBe(0);
    expect(rolled.periodStartedAt.getTime()).toBeGreaterThan(longAgo.getTime());
  });

  it("does not reset exactly at the boundary (not yet expired)", () => {
    const justUnderThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000 + 1000);
    const creator = makeCreator({ packsGeneratedInPeriod: 2, periodStartedAt: justUnderThreshold });
    const rolled = withRolledPeriod(creator);
    expect(rolled.packsGeneratedInPeriod).toBe(2);
  });
});

describe("parseFreeLimit", () => {
  it("falls back to the default when the env var is unset", () => {
    expect(parseFreeLimit(undefined)).toBe(DEFAULT_FREE_LIMIT);
  });

  it("reads a raised ceiling, so a preview deploy can be tested past the cap", () => {
    expect(parseFreeLimit("500")).toBe(500);
  });

  it("accepts 0, which disables free generation outright", () => {
    expect(parseFreeLimit("0")).toBe(0);
  });

  // A blank or malformed value must not become NaN: NaN loses every `<`
  // comparison in canGenerate, so it would lock out every free creator
  // rather than raising the cap. Falling back keeps production's limit.
  it.each(["", "   ", "two", "2.5", "-1", "1e3x"])(
    "falls back to the default rather than NaN or a fractional cap for %o",
    (raw) => {
      expect(parseFreeLimit(raw)).toBe(DEFAULT_FREE_LIMIT);
    }
  );

  it("never yields a value that would block a creator who has generated nothing", () => {
    for (const raw of [undefined, "", "two", "-1", "2.5", "0", "5"]) {
      const limit = parseFreeLimit(raw);
      expect(Number.isInteger(limit)).toBe(true);
      expect(limit).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("FREE_LIMIT wiring", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // Guards the wiring, not just the parser: FREE_LIMIT is read at module
  // load, so this re-imports the module under a stubbed env to prove the
  // override actually reaches the exported constant the routes consume.
  async function freshCreatorModule() {
    vi.resetModules();
    return import("@/lib/creator");
  }

  it("defaults to 2 when FREE_PACK_LIMIT is unset", async () => {
    vi.stubEnv("FREE_PACK_LIMIT", undefined);
    const mod = await freshCreatorModule();
    expect(mod.FREE_LIMIT).toBe(2);
  });

  it("takes the override from FREE_PACK_LIMIT", async () => {
    vi.stubEnv("FREE_PACK_LIMIT", "50");
    const mod = await freshCreatorModule();
    expect(mod.FREE_LIMIT).toBe(50);
  });

  it("lets a FREE creator past the old cap once the override is raised", async () => {
    vi.stubEnv("FREE_PACK_LIMIT", "50");
    const mod = await freshCreatorModule();
    // Would be blocked under the default limit of 2.
    expect(mod.canGenerate(makeCreator({ packsGeneratedInPeriod: 10 }))).toBe(true);
  });

  it("still blocks a FREE creator at the raised ceiling", async () => {
    vi.stubEnv("FREE_PACK_LIMIT", "3");
    const mod = await freshCreatorModule();
    expect(mod.canGenerate(makeCreator({ packsGeneratedInPeriod: 3 }))).toBe(false);
  });

  it("keeps production's limit when the env var is malformed", async () => {
    vi.stubEnv("FREE_PACK_LIMIT", "unlimited");
    const mod = await freshCreatorModule();
    expect(mod.FREE_LIMIT).toBe(2);
    expect(mod.canGenerate(makeCreator({ packsGeneratedInPeriod: 0 }))).toBe(true);
    expect(mod.canGenerate(makeCreator({ packsGeneratedInPeriod: 2 }))).toBe(false);
  });
});

describe("canGenerate", () => {
  it("allows a FREE creator under the limit", () => {
    expect(canGenerate(makeCreator({ packsGeneratedInPeriod: FREE_LIMIT - 1 }))).toBe(true);
  });

  it("blocks a FREE creator at the limit", () => {
    expect(canGenerate(makeCreator({ packsGeneratedInPeriod: FREE_LIMIT }))).toBe(false);
  });

  it("blocks a FREE creator over the limit", () => {
    expect(canGenerate(makeCreator({ packsGeneratedInPeriod: FREE_LIMIT + 1 }))).toBe(false);
  });

  it("always allows a PRO creator, even over the limit", () => {
    expect(canGenerate(makeCreator({ plan: "PRO", packsGeneratedInPeriod: FREE_LIMIT + 5 }))).toBe(true);
  });

  it("allows a FREE creator whose period has expired, even if it was previously at the limit", () => {
    const longAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    expect(canGenerate(makeCreator({ packsGeneratedInPeriod: FREE_LIMIT, periodStartedAt: longAgo }))).toBe(true);
  });
});

/**
 * Which environment's Pro this deployment will act on (C1).
 *
 * Preview deployments share the production database and talk to Paddle's
 * sandbox, so a sandbox checkout on a preview writes plan: "PRO" to the very row
 * production reads. A test purchase that costs nothing could hand out real Pro.
 */
describe("Pro from another Paddle environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("honours a production grant on production", () => {
    vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "production");
    expect(effectivePlan({ plan: "PRO", proEnvironment: "production" })).toBe("PRO");
  });

  it("refuses a sandbox grant on production", () => {
    // The whole point. A free sandbox subscription must not be real Pro.
    vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "production");
    expect(effectivePlan({ plan: "PRO", proEnvironment: "sandbox" })).toBe("FREE");
    expect(isProFromAnotherEnvironment({ plan: "PRO", proEnvironment: "sandbox" })).toBe(true);
  });

  it("refuses a production grant on a preview, so a sandbox walk tests the sandbox", () => {
    // The other direction matters too: a preview exercising Pro should be
    // exercising the grant the preview made, not a real customer's.
    vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "sandbox");
    expect(effectivePlan({ plan: "PRO", proEnvironment: "production" })).toBe("FREE");
  });

  it("treats a row written before the column existed as production", () => {
    // Every Pro row that exists today was granted by production and has no value
    // here, so nobody paying for anything changes state when this ships.
    vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "production");
    expect(effectivePlan({ plan: "PRO", proEnvironment: null })).toBe("PRO");
    expect(isProFromAnotherEnvironment({ plan: "PRO", proEnvironment: null })).toBe(false);
  });

  it("never invents Pro from an environment match", () => {
    // A FREE row is FREE however well its environment matches.
    vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "production");
    expect(effectivePlan({ plan: "FREE", proEnvironment: "production" })).toBe("FREE");
    expect(isProFromAnotherEnvironment({ plan: "FREE", proEnvironment: "sandbox" })).toBe(false);
  });

  it("gates canGenerate and the free reservation, not just the readout", () => {
    // A sandbox-Pro row must be subject to the free cap like any other FREE row,
    // or the refusal would only be cosmetic.
    vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "production");
    const sandboxPro = makeCreator({
      plan: "PRO",
      proEnvironment: "sandbox",
      packsGeneratedInPeriod: FREE_LIMIT,
    });
    expect(canGenerate(sandboxPro)).toBe(false);

    const realPro = makeCreator({
      plan: "PRO",
      proEnvironment: "production",
      packsGeneratedInPeriod: FREE_LIMIT,
    });
    expect(canGenerate(realPro)).toBe(true);
  });
});
