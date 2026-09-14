import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { FREE_LIMIT } from "@/lib/creator";
import { QUESTION_TYPE } from "@/lib/question-types";
import type { GeneratedPack } from "@/lib/quiz-schema";

const FIXTURE_PACK: GeneratedPack = {
  title: "Cap Test Pack",
  rounds: [
    {
      title: "Round One",
      category: "General",
      questions: [
        { text: "2+2?", answer: "4", points: 1, type: QUESTION_TYPE.TEXT },
      ],
    },
  ],
};

// Only the model call is stubbed. Everything else in the module — notably
// UnusableModelOutputError, which the route branches on with `instanceof` —
// stays real, so a mock can't quietly diverge from the module it stands in for.
vi.mock("@/lib/generate-pack", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/generate-pack")>()),
  generateQuizPack: vi.fn(async () => ({
    pack: FIXTURE_PACK,
    droppedQuestions: 0,
    droppedRounds: 0,
    truncated: false,
  })),
}));

import { generateQuizPack } from "@/lib/generate-pack";
import { POST as generate } from "@/app/api/packs/generate/route";

const BASE = "http://localhost:3000";

// The route's existing per-IP rate limiter (5 requests / 10 min, in-memory in
// tests) shares its bucket across every `it` in this file, since vitest only
// resets module state between test *files*, not between test blocks. Each
// test below simulates a distinct visitor's IP so the 9 total generate calls
// across this suite don't collide on that unrelated rate-limit bucket — the
// cap behavior under test is keyed by the device cookie, not by IP.
let testIp = 0;

function requestWithCookie(cookie?: string) {
  return new NextRequest(`${BASE}/api/packs/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.0.0.${testIp}`,
      ...(cookie ? { cookie: `pq_creator=${cookie}` } : {}),
    },
    body: JSON.stringify({ prompt: "A short pub quiz." }),
  });
}

describe("POST /api/packs/generate — Creator cap", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  beforeEach(() => {
    testIp += 1;
    vi.mocked(generateQuizPack).mockClear();
  });

  afterEach(() => {
    vi.mocked(generateQuizPack).mockClear();
  });

  it("sets a Set-Cookie header for a first-time visitor and succeeds", async () => {
    const res = await generate(requestWithCookie());
    expect(res.status).toBe(201);
    expect(res.headers.get("set-cookie")).toMatch(/pq_creator=/);

    const deviceKey = /pq_creator=([^;]+)/.exec(res.headers.get("set-cookie")!)![1];
    const creator = await db.creator.findUnique({ where: { deviceKey } });
    const body = await res.json();
    const pack = await db.quizPack.findUnique({ where: { id: body.pack.id } });
    expect(pack!.creatorId).not.toBeNull();
    expect(pack!.creatorId).toBe(creator!.id);
  });

  it("does not set a new cookie for a returning creator", async () => {
    const first = await generate(requestWithCookie());
    const setCookie = first.headers.get("set-cookie")!;
    const deviceKey = /pq_creator=([^;]+)/.exec(setCookie)![1];

    const second = await generate(requestWithCookie(deviceKey));
    expect(second.status).toBe(201);
    expect(second.headers.get("set-cookie")).toBeNull();
  });

  it(`blocks the (${FREE_LIMIT + 1})th generation in a 30-day period without calling the model`, async () => {
    const first = await generate(requestWithCookie());
    const deviceKey = /pq_creator=([^;]+)/.exec(first.headers.get("set-cookie")!)![1];

    for (let i = 1; i < FREE_LIMIT; i++) {
      const res = await generate(requestWithCookie(deviceKey));
      expect(res.status).toBe(201);
    }

    vi.mocked(generateQuizPack).mockClear();
    const capped = await generate(requestWithCookie(deviceKey));
    expect(capped.status).toBe(403);
    const body = await capped.json();
    expect(body).toMatchObject({ packsGeneratedInPeriod: FREE_LIMIT, limit: FREE_LIMIT });
    expect(generateQuizPack).not.toHaveBeenCalled();
  });

  it("resets the count for a creator whose period has already expired", async () => {
    const first = await generate(requestWithCookie());
    const deviceKey = /pq_creator=([^;]+)/.exec(first.headers.get("set-cookie")!)![1];
    for (let i = 1; i < FREE_LIMIT; i++) await generate(requestWithCookie(deviceKey));

    // Force this creator's period into the past, as if 31 days had elapsed.
    await db.creator.update({
      where: { deviceKey },
      data: { periodStartedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
    });

    const res = await generate(requestWithCookie(deviceKey));
    expect(res.status).toBe(201);

    const row = await db.creator.findUnique({ where: { deviceKey } });
    expect(row!.packsGeneratedInPeriod).toBe(1);
  });
});
