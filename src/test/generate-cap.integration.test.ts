import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { FREE_LIMIT } from "@/lib/creator";
import { signInTestHost, type TestHost } from "./auth-fixture";
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
// test below simulates a distinct visitor's IP so the generate calls across
// this suite don't collide on that unrelated rate-limit bucket — the cap
// behavior under test is keyed by the account, not by IP.
let testIp = 0;

function requestFrom(host?: TestHost) {
  return new NextRequest(`${BASE}/api/packs/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.0.0.${testIp}`,
      ...(host?.cookieHeader ?? {}),
    },
    body: JSON.stringify({ prompt: "A short pub quiz." }),
  });
}

describe("POST /api/packs/generate — free allowance, per account", () => {
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

  it("refuses a caller with no account, without calling the model", async () => {
    vi.mocked(generateQuizPack).mockClear();
    const res = await generate(requestFrom());
    expect(res.status).toBe(401);
    expect(generateQuizPack).not.toHaveBeenCalled();
  });

  it("files the pack under the signed-in account's creator, and sets no cookie", async () => {
    const host = await signInTestHost();
    const res = await generate(requestFrom(host));
    expect(res.status).toBe(201);
    // The identity cookie is not minted any more — the account is identity.
    expect(res.headers.get("set-cookie")).toBeNull();

    const body = await res.json();
    const pack = await db.quizPack.findUnique({ where: { id: body.pack.id } });
    expect(pack!.creatorId).toBe(host.id);
  });

  it(`blocks the (${FREE_LIMIT + 1})th generation in a 30-day period without calling the model`, async () => {
    const host = await signInTestHost();

    for (let i = 0; i < FREE_LIMIT; i++) {
      const res = await generate(requestFrom(host));
      expect(res.status).toBe(201);
    }

    vi.mocked(generateQuizPack).mockClear();
    const capped = await generate(requestFrom(host));
    expect(capped.status).toBe(403);
    const body = await capped.json();
    expect(body).toMatchObject({ packsGeneratedInPeriod: FREE_LIMIT, limit: FREE_LIMIT });
    expect(generateQuizPack).not.toHaveBeenCalled();
  });

  it("resets the count for an account whose period has already expired", async () => {
    const host = await signInTestHost();
    for (let i = 0; i < FREE_LIMIT; i++) await generate(requestFrom(host));

    // Force this account's period into the past, as if 31 days had elapsed.
    await db.creator.update({
      where: { id: host.id },
      data: { periodStartedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
    });

    const res = await generate(requestFrom(host));
    expect(res.status).toBe(201);

    const row = await db.creator.findUnique({ where: { id: host.id } });
    expect(row!.packsGeneratedInPeriod).toBe(1);
  });

  it("does not hand the allowance back when the browser drops every cookie", async () => {
    // The requirement this whole change exists for. Spend the allowance,
    // throw away every cookie the browser holds, sign in again as the same
    // person: the count is still spent, and generation is still refused.
    const email = `clears-cookies-${Math.random().toString(36).slice(2)}@example.test`;
    const before = await signInTestHost(email);
    for (let i = 0; i < FREE_LIMIT; i++) {
      expect((await generate(requestFrom(before))).status).toBe(201);
    }

    const after = await signInTestHost(email);
    // Same account, same creator row — a new browser, not a new identity.
    expect(after.id).toBe(before.id);
    expect(after.cookie).not.toBe(before.cookie);

    vi.mocked(generateQuizPack).mockClear();
    const refused = await generate(requestFrom(after));
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({
      packsGeneratedInPeriod: FREE_LIMIT,
      limit: FREE_LIMIT,
    });
    expect(generateQuizPack).not.toHaveBeenCalled();
  });
});
