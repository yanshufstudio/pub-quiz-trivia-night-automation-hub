import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";

vi.mock("@/lib/generate-pack", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/generate-pack")>()),
  generateQuizPack: vi.fn(),
}));

import { generateQuizPack } from "@/lib/generate-pack";
import { POST as generate } from "@/app/api/packs/generate/route";
import {
  PRO_PERIOD_LIMIT_ENV,
  PRO_TRIAL_LIMIT_ENV,
  PRO_TRIAL_LIMIT_MESSAGE,
  proFairUseLimitMessage,
  __resetProLimitCounters,
} from "@/lib/pro-limits";
import { __resetMemoryCounters } from "@/lib/daily-ceiling";
import { signInTestHost, type TestHost } from "./auth-fixture";

const BASE = "http://localhost:3000";
const DAY_MS = 24 * 60 * 60 * 1000;

const PACK = {
  pack: {
    title: "Fair Use Test Pack",
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
 * Pro's fair-use cap (PRC5): a rolling 30-day window on the Creator, on top of
 * the ten a day. Not the M8 billing-period count, which rolls yearly on the
 * annual price and never for a comped account.
 */

let testIp = 600;

function generateRequest(host: TestHost) {
  testIp += 1;
  return new NextRequest(`${BASE}/api/packs/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.9.${Math.floor(testIp / 250) % 250}.${testIp % 250}`,
      ...host.cookieHeader,
    },
    body: JSON.stringify({ prompt: "Four rounds of pub trivia." }),
  });
}

async function proHost(data: { subscriptionStatus?: string } = {}): Promise<TestHost> {
  const host = await signInTestHost();
  await db.creator.update({ where: { id: host.id }, data: { plan: "PRO", ...data } });
  return host;
}

async function windowOf(host: TestHost) {
  const row = await db.creator.findUniqueOrThrow({ where: { id: host.id } });
  return { count: row.proWindowCount, startedAt: row.proWindowStartedAt };
}

describe("Pro fair use (PRC5)", () => {
  beforeEach(() => {
    __resetProLimitCounters();
    __resetMemoryCounters();
    vi.mocked(generateQuizPack).mockReset();
    vi.mocked(generateQuizPack).mockResolvedValue(PACK as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __resetProLimitCounters();
    __resetMemoryCounters();
    vi.mocked(generateQuizPack).mockReset();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("serves the allowance, then answers 429 with the reset date and no number", async () => {
    vi.stubEnv(PRO_PERIOD_LIMIT_ENV, "2");
    const host = await proHost({ subscriptionStatus: "active" });

    expect((await generate(generateRequest(host))).status).toBe(201);
    expect((await generate(generateRequest(host))).status).toBe(201);

    const refused = await generate(generateRequest(host));
    expect(refused.status).toBe(429);
    const body = await refused.json();
    const { startedAt } = await windowOf(host);
    expect(body.error).toBe(proFairUseLimitMessage(new Date(startedAt!.getTime() + 30 * DAY_MS)));
    expect(body.proFairUseLimitReached).toBe(true);
    // The number stays unpublished (M12): not in the body at all.
    expect(body).not.toHaveProperty("limit");
    expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0);

    expect(vi.mocked(generateQuizPack)).toHaveBeenCalledTimes(2);
    expect((await windowOf(host)).count).toBe(2);
  });

  it("caps a trialing subscriber at the trial limit, with the trial's words", async () => {
    vi.stubEnv(PRO_TRIAL_LIMIT_ENV, "1");
    const host = await proHost({ subscriptionStatus: "trialing" });

    expect((await generate(generateRequest(host))).status).toBe(201);
    const refused = await generate(generateRequest(host));
    expect(refused.status).toBe(429);
    expect((await refused.json()).error).toBe(PRO_TRIAL_LIMIT_MESSAGE);
  });

  it("lets two concurrent requests take only the last pack once", async () => {
    vi.stubEnv(PRO_PERIOD_LIMIT_ENV, "1");
    const host = await proHost({ subscriptionStatus: "active" });

    const statuses = (
      await Promise.all([generate(generateRequest(host)), generate(generateRequest(host))])
    ).map((r) => r.status);
    expect(statuses.sort()).toEqual([201, 429]);
    expect((await windowOf(host)).count).toBe(1);
  });

  it("starts a fresh window once the last one is 30 days old", async () => {
    vi.stubEnv(PRO_PERIOD_LIMIT_ENV, "2");
    const host = await proHost({ subscriptionStatus: "active" });
    await db.creator.update({
      where: { id: host.id },
      data: { proWindowCount: 2, proWindowStartedAt: new Date(Date.now() - 31 * DAY_MS) },
    });

    expect((await generate(generateRequest(host))).status).toBe(201);
    const after = await windowOf(host);
    expect(after.count).toBe(1);
    expect(Date.now() - after.startedAt!.getTime()).toBeLessThan(60_000);
  });

  it("gives the pack back when generation fails", async () => {
    vi.stubEnv(PRO_PERIOD_LIMIT_ENV, "2");
    const host = await proHost({ subscriptionStatus: "active" });
    vi.mocked(generateQuizPack).mockRejectedValueOnce(new Error("model fell over"));

    expect((await generate(generateRequest(host))).status).toBe(502);
    expect((await windowOf(host)).count).toBe(0);
  });

  it("is off when the limit is 0", async () => {
    vi.stubEnv(PRO_PERIOD_LIMIT_ENV, "0");
    const host = await proHost({ subscriptionStatus: "active" });
    await db.creator.update({
      where: { id: host.id },
      data: { proWindowCount: 500, proWindowStartedAt: new Date() },
    });

    expect((await generate(generateRequest(host))).status).toBe(201);
  });

  it("counts a comped account like any other Pro account", async () => {
    vi.stubEnv(PRO_PERIOD_LIMIT_ENV, "1");
    const host = await signInTestHost();
    vi.stubEnv("PRO_COMP_EMAILS", host.email);

    expect((await generate(generateRequest(host))).status).toBe(201);
    expect((await generate(generateRequest(host))).status).toBe(429);
  });

  it("leaves a FREE creator's window untouched", async () => {
    const free = await signInTestHost();
    expect((await generate(generateRequest(free))).status).toBe(201);
    expect((await windowOf(free)).count).toBe(0);
  });
});
