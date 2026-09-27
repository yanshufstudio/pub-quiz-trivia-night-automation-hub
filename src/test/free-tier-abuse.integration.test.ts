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
  FREE_IP_DAILY_LIMIT_ENV,
  FREE_IP_LIMIT_MESSAGE,
  __resetFreeAllowanceCounters,
} from "@/lib/free-allowance";
import { __resetMemoryCounters } from "@/lib/daily-ceiling";
import { __resetProLimitCounters } from "@/lib/pro-limits";
import { signInTestHost, type TestHost } from "./auth-fixture";

const BASE = "http://localhost:3000";

const PACK = {
  pack: {
    title: "Abuse Test Pack",
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
 * The free-tier hole that needs no cookie (H1a), through the real route.
 *
 * Accounts stopped a caller dropping `pq_creator` for a fresh allowance. They did
 * not stop the same person signing up again with any address at all, and the
 * per-IP limiter on this route (5 per 10 minutes, ~720 a day) is a throttle
 * rather than a cap. This is the cap.
 *
 * H1(b) — aliases of one mailbox sharing one allowance — is not enforced yet and
 * so is not tested here; see the note on normaliseForFreeAllowance for why the
 * cheap substrate was wrong and what the decision is.
 */

const savedEnv: Record<string, string | undefined> = {};
let ipCounter = 600;

/** A distinct address unless one is given, so the per-IP caps do not collide
 * between tests that are not about them. */
function generateRequest(host: TestHost, ip?: string) {
  ipCounter += 1;
  return new NextRequest(`${BASE}/api/packs/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip ?? `10.7.0.${ipCounter % 250}`,
      ...host.cookieHeader,
    },
    body: JSON.stringify({ prompt: "Four rounds of pub trivia." }),
  });
}

beforeEach(() => {
  savedEnv[FREE_IP_DAILY_LIMIT_ENV] = process.env[FREE_IP_DAILY_LIMIT_ENV];
  delete process.env[FREE_IP_DAILY_LIMIT_ENV];
  __resetFreeAllowanceCounters();
  __resetMemoryCounters();
  __resetProLimitCounters();
  vi.mocked(generateQuizPack).mockReset();
  vi.mocked(generateQuizPack).mockResolvedValue(PACK as never);
});

afterEach(() => {
  if (savedEnv[FREE_IP_DAILY_LIMIT_ENV] === undefined) delete process.env[FREE_IP_DAILY_LIMIT_ENV];
  else process.env[FREE_IP_DAILY_LIMIT_ENV] = savedEnv[FREE_IP_DAILY_LIMIT_ENV];
  __resetFreeAllowanceCounters();
  __resetMemoryCounters();
  __resetProLimitCounters();
  vi.mocked(generateQuizPack).mockReset();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("one address's free packs for a day (H1a)", () => {
  it("refuses a caller past the day's allowance, whatever account they use", async () => {
    process.env[FREE_IP_DAILY_LIMIT_ENV] = "2";
    const ip = "10.7.9.1";

    // Two packs from two fresh accounts — so nothing else is refusing this.
    for (let i = 0; i < 2; i++) {
      const host = await signInTestHost();
      expect((await generate(generateRequest(host, ip))).status).toBe(201);
    }

    const third = await signInTestHost();
    const refused = await generate(generateRequest(third, ip));
    expect(refused.status).toBe(429);
    const body = await refused.json();
    expect(body.error).toBe(FREE_IP_LIMIT_MESSAGE);
    expect(body.freeIpLimitReached).toBe(true);
    expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("does not refuse a different network", async () => {
    process.env[FREE_IP_DAILY_LIMIT_ENV] = "1";
    const first = await signInTestHost();
    expect((await generate(generateRequest(first, "10.7.9.2"))).status).toBe(201);

    const elsewhere = await signInTestHost();
    expect((await generate(generateRequest(elsewhere, "10.7.9.3"))).status).toBe(201);
  });

  it("does not apply to a Pro subscriber on a shared address", async () => {
    // A pub's wifi is one address and the person running the quiz on it has
    // paid. Throttling them because the free tier was busy would be the worst
    // possible place for this cap to bite.
    process.env[FREE_IP_DAILY_LIMIT_ENV] = "1";
    const ip = "10.7.9.4";
    const freeHost = await signInTestHost();
    expect((await generate(generateRequest(freeHost, ip))).status).toBe(201);

    const pro = await signInTestHost();
    await db.creator.update({ where: { id: pro.id }, data: { plan: "PRO" } });
    expect((await generate(generateRequest(pro, ip))).status).toBe(201);
  });

  it("does not consume the shared ceiling when it refuses", async () => {
    process.env[FREE_IP_DAILY_LIMIT_ENV] = "1";
    const ip = "10.7.9.5";
    const first = await signInTestHost();
    expect((await generate(generateRequest(first, ip))).status).toBe(201);

    const refused = await signInTestHost();
    expect((await generate(generateRequest(refused, ip))).status).toBe(429);

    // The ceiling is untouched, so somebody elsewhere is still served.
    const elsewhere = await signInTestHost();
    expect((await generate(generateRequest(elsewhere, "10.7.9.6"))).status).toBe(201);
  });
});
