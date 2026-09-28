import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";

vi.mock("@/lib/generate-pack", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/generate-pack")>()),
  generateQuizPack: vi.fn(),
}));

import { generateQuizPack } from "@/lib/generate-pack";
import { POST as generate } from "@/app/api/packs/generate/route";
import { applySubscriptionEvent, type SubscriptionEvent } from "@/lib/paddle/apply-subscription";
import {
  PRO_USER_DAILY_LIMIT_ENV,
  proDailyLimitMessage,
  __resetProLimitCounters,
} from "@/lib/pro-limits";
import { FREE_CEILING_ENV, PRO_CEILING_ENV, __resetMemoryCounters } from "@/lib/daily-ceiling";
import { signInTestHost, type TestHost } from "./auth-fixture";

const BASE = "http://localhost:3000";

const PACK = {
  pack: {
    title: "Pro Cap Test Pack",
    rounds: [
      {
        title: "Round One",
        category: "General Knowledge",
        questions: [{ text: "What is the capital of Australia?", answer: "Canberra", points: 1, type: "TEXT" }],
      },
    ],
  },
  droppedQuestions: 0,
  droppedRounds: 0,
  truncated: false,
};

/**
 * A Pro subscriber's own daily cap, and what a Pro generation records (H2, M8).
 *
 * The shared ceiling bounds the deployment and has no identity in its key, so
 * before this one Pro account could spend the whole day's Pro capacity and lock
 * every other paying customer out. The per-period count is separate, and exists
 * because /refunds' terms are written in terms of it.
 */

// Every request poses as a different visitor: the per-IP limiter's buckets are
// shared across the file and 5-per-10-minutes would otherwise run out.
let testIp = 400;
const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = [PRO_USER_DAILY_LIMIT_ENV, FREE_CEILING_ENV, PRO_CEILING_ENV];

function generateRequest(host: TestHost) {
  testIp += 1;
  return new NextRequest(`${BASE}/api/packs/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.8.0.${testIp % 250}`,
      ...host.cookieHeader,
    },
    body: JSON.stringify({ prompt: "Four rounds of pub trivia." }),
  });
}

async function proHost(): Promise<TestHost> {
  const host = await signInTestHost();
  await db.creator.update({ where: { id: host.id }, data: { plan: "PRO" } });
  return host;
}

describe("the per-subscriber Pro daily cap", () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    __resetProLimitCounters();
    __resetMemoryCounters();
    vi.mocked(generateQuizPack).mockReset();
    vi.mocked(generateQuizPack).mockResolvedValue(PACK as never);
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    __resetProLimitCounters();
    __resetMemoryCounters();
    vi.mocked(generateQuizPack).mockReset();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("lets a subscriber make their allowance, then answers 429 with the number and the reset", async () => {
    process.env[PRO_USER_DAILY_LIMIT_ENV] = "2";
    const host = await proHost();

    expect((await generate(generateRequest(host))).status).toBe(201);
    expect((await generate(generateRequest(host))).status).toBe(201);

    const refused = await generate(generateRequest(host));
    expect(refused.status).toBe(429);
    const body = await refused.json();
    expect(body.error).toBe(proDailyLimitMessage(2));
    expect(body.proDailyLimitReached).toBe(true);
    expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0);

    // And nothing was spent on the refused one.
    expect(vi.mocked(generateQuizPack)).toHaveBeenCalledTimes(2);
  });

  it("does not let one subscriber's exhausted day refuse another's", async () => {
    // This is the whole reason the cap is per-creator rather than only global.
    process.env[PRO_USER_DAILY_LIMIT_ENV] = "1";
    const greedy = await proHost();
    const innocent = await proHost();

    expect((await generate(generateRequest(greedy))).status).toBe(201);
    expect((await generate(generateRequest(greedy))).status).toBe(429);
    expect((await generate(generateRequest(innocent))).status).toBe(201);
  });

  it("gives the shared ceiling's unit back when it refuses", async () => {
    // A refusal must not quietly consume deployment capacity that somebody else
    // could have used.
    process.env[PRO_USER_DAILY_LIMIT_ENV] = "1";
    process.env[PRO_CEILING_ENV] = "2";
    const host = await proHost();

    expect((await generate(generateRequest(host))).status).toBe(201);
    expect((await generate(generateRequest(host))).status).toBe(429);

    // If the 429 had kept the shared unit, this second subscriber would be
    // refused by the shared ceiling instead of served.
    const other = await proHost();
    expect((await generate(generateRequest(other))).status).toBe(201);
  });

  it("leaves a FREE creator's path alone", async () => {
    // FREE callers are bounded by their own allowance and must not pay for a
    // round trip to a cap they are not subject to.
    process.env[PRO_USER_DAILY_LIMIT_ENV] = "0"; // would refuse every Pro request
    const free = await signInTestHost();

    expect((await generate(generateRequest(free))).status).toBe(201);
  });

  it("counts each Pro pack against the billing period, and only on success", async () => {
    process.env[PRO_USER_DAILY_LIMIT_ENV] = "5";
    const host = await proHost();

    expect((await generate(generateRequest(host))).status).toBe(201);
    expect((await generate(generateRequest(host))).status).toBe(201);
    expect(
      (await db.creator.findUniqueOrThrow({ where: { id: host.id } })).proPacksGeneratedInPeriod
    ).toBe(2);

    // A refused request is not a generation.
    process.env[PRO_USER_DAILY_LIMIT_ENV] = "2";
    expect((await generate(generateRequest(host))).status).toBe(429);
    expect(
      (await db.creator.findUniqueOrThrow({ where: { id: host.id } })).proPacksGeneratedInPeriod
    ).toBe(2);
  });

  it("does not count a FREE creator's packs against the Pro period", async () => {
    const free = await signInTestHost();
    expect((await generate(generateRequest(free))).status).toBe(201);
    expect(
      (await db.creator.findUniqueOrThrow({ where: { id: free.id } })).proPacksGeneratedInPeriod
    ).toBe(0);
  });
});

describe("the billing period rolls the Pro count (M8)", () => {
  let n = 0;

  function event(creatorId: string, overrides: Partial<SubscriptionEvent> = {}): SubscriptionEvent {
    n += 1;
    return {
      eventId: `evt_m8_${Date.now()}_${n}`,
      eventType: "subscription.updated",
      occurredAt: new Date(`2026-09-${String(10 + n).padStart(2, "0")}T10:00:00Z`),
      subscriptionId: `sub_m8_${creatorId}`,
      customerId: `ctm_m8_${creatorId}`,
      status: "active",
      currentBillingPeriodStartsAt: null,
    // No prices named, which priceOwnership reads as "cannot tell" rather than
    // "not ours" — so these cases keep the handling they had before C2. The
    // foreign-price cases name prices explicitly.
    priceIds: [],
      verifiedCreatorId: creatorId,
      ...overrides,
    };
  }

  async function subscriber(packs: number) {
    const host = await signInTestHost();
    await db.creator.update({
      where: { id: host.id },
      data: { plan: "PRO", proPacksGeneratedInPeriod: packs },
    });
    return host;
  }

  it("zeroes the count the first time Paddle reports a period", async () => {
    const host = await subscriber(7);
    const start = new Date("2026-09-01T00:00:00Z");

    expect(await applySubscriptionEvent(event(host.id, { currentBillingPeriodStartsAt: start }))).toBe(
      "applied"
    );

    const after = await db.creator.findUniqueOrThrow({ where: { id: host.id } });
    expect(after.proPacksGeneratedInPeriod).toBe(0);
    expect(after.proPeriodStartedAt?.toISOString()).toBe(start.toISOString());
  });

  it("does not zero the count for another event inside the same period", async () => {
    // Paddle sends several events within one period. Each one wiping the count
    // would make the number /refunds is decided on meaningless.
    const host = await subscriber(0);
    const start = new Date("2026-09-01T00:00:00Z");
    await applySubscriptionEvent(event(host.id, { currentBillingPeriodStartsAt: start }));
    await db.creator.update({ where: { id: host.id }, data: { proPacksGeneratedInPeriod: 4 } });

    await applySubscriptionEvent(event(host.id, { currentBillingPeriodStartsAt: start }));

    expect(
      (await db.creator.findUniqueOrThrow({ where: { id: host.id } })).proPacksGeneratedInPeriod
    ).toBe(4);
  });

  it("zeroes it again when a new period starts", async () => {
    const host = await subscriber(0);
    await applySubscriptionEvent(
      event(host.id, { currentBillingPeriodStartsAt: new Date("2026-09-01T00:00:00Z") })
    );
    await db.creator.update({ where: { id: host.id }, data: { proPacksGeneratedInPeriod: 6 } });

    await applySubscriptionEvent(
      event(host.id, { currentBillingPeriodStartsAt: new Date("2026-10-01T00:00:00Z") })
    );

    const after = await db.creator.findUniqueOrThrow({ where: { id: host.id } });
    expect(after.proPacksGeneratedInPeriod).toBe(0);
    expect(after.proPeriodStartedAt?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("does not roll backwards on an event carrying an older period", async () => {
    // Paddle retries for three days, so a late delivery of an old event is
    // ordinary — and must not wipe the current period's count.
    const host = await subscriber(0);
    await applySubscriptionEvent(
      event(host.id, { currentBillingPeriodStartsAt: new Date("2026-10-01T00:00:00Z") })
    );
    await db.creator.update({ where: { id: host.id }, data: { proPacksGeneratedInPeriod: 3 } });

    await applySubscriptionEvent(
      event(host.id, { currentBillingPeriodStartsAt: new Date("2026-09-01T00:00:00Z") })
    );

    const after = await db.creator.findUniqueOrThrow({ where: { id: host.id } });
    expect(after.proPacksGeneratedInPeriod).toBe(3);
    expect(after.proPeriodStartedAt?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("leaves the count alone for an event that reports no period at all", async () => {
    const host = await subscriber(5);
    await applySubscriptionEvent(event(host.id, { currentBillingPeriodStartsAt: null }));
    expect(
      (await db.creator.findUniqueOrThrow({ where: { id: host.id } })).proPacksGeneratedInPeriod
    ).toBe(5);
  });
});
