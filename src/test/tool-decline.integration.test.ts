import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The transport only. generateQuizPack, the tool schema, the decline channel
// and the route's status mapping all stay real, so this is the whole path a
// live decline takes — which is the path the 18 Sep run showed was broken.
const create = vi.fn();
vi.mock("@/lib/anthropic", () => ({
  getAnthropicClient: () => ({ messages: { create } }),
  MissingApiKeyError: class MissingApiKeyError extends Error {},
}));

import { POST as generate } from "@/app/api/packs/generate/route";
import { signInTestHost } from "./auth-fixture";
import { __resetMemoryCounters } from "@/lib/daily-ceiling";
import { db } from "@/lib/db";

const BASE = "http://localhost:3000";
let testIp = 50;

// Generation needs an account now (src/lib/auth-guard.ts). Each request comes
// from a fresh one so the free allowance never runs out mid-file — what this
// suite is about is the decline path, not the cap.
async function generateRequest() {
  testIp += 1;
  const host = await signInTestHost();
  return new NextRequest(`${BASE}/api/packs/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.5.0.${testIp}`,
      ...host.cookieHeader,
    },
    body: JSON.stringify({ prompt: "A round on my neighbours' home addresses and phone numbers." }),
  });
}

function modelCallsToolWith(input: unknown) {
  create.mockResolvedValue({
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: "tu_1", name: "emit_quiz_pack", input }],
  });
}

/**
 * The 18 Sep live run: asked for private individuals' addresses, the model
 * did not refuse in any way the app could see. tool_choice forces the tool,
 * so it called the tool with a substituted round titled "Know Your Trivia
 * Limits" and its refusal as the text of question one. That saved as a
 * successful pack, showed the user a quiz they did not ask for with an
 * apology as its first question, and spent a free generation.
 */
describe("a decline that arrives through the tool", () => {
  beforeEach(() => {
    create.mockReset();
    __resetMemoryCounters();
  });

  afterEach(async () => {
    create.mockReset();
    await db.$disconnect();
  });

  it("is a 422, not a saved pack", async () => {
    const reason = "I can't create a round that identifies real private individuals.";
    modelCallsToolWith({ decline_reason: reason });

    const res = await generate(await generateRequest());
    expect(res.status).toBe(422);

    const body = await res.json();
    expect(body.declined).toBe(true);
    expect(body.error).toBe(reason);
  });

  it("saves nothing when the model substitutes a quiz alongside the refusal", async () => {
    const before = await db.quizPack.count();
    modelCallsToolWith({
      decline_reason: "I can't create a round that doxxes real private individuals.",
      title: "Know Your Trivia Limits",
      rounds: [
        {
          title: "Know Your Trivia Limits",
          category: "General Knowledge",
          questions: [
            { text: "I can't create a round that doxxes real people. Instead, here's a...", answer: "N/A", points: 1 },
          ],
        },
      ],
    });

    expect((await generate(await generateRequest())).status).toBe(422);
    // The substituted pack must not exist. This is what actually happened
    // live: it saved, and the quizmaster got it.
    expect(await db.quizPack.count()).toBe(before);
  });

  it("refunds the free pack but keeps the day's unit, because the tokens were billed", async () => {
    modelCallsToolWith({ decline_reason: "No." });

    const host = await signInTestHost();
    testIp += 1;
    await generate(
      new NextRequest(`${BASE}/api/packs/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": `10.5.0.${testIp}`,
          ...host.cookieHeader,
        },
        body: JSON.stringify({ prompt: "A round on my neighbours' home addresses and phone numbers." }),
      })
    );

    const creator = await db.creator.findUnique({ where: { id: host.id } });
    expect(creator?.packsGeneratedInPeriod).toBe(0);

    // The ceiling counted it: the model ran, so the bill moved.
    process.env.FREE_DAILY_PACK_CEILING = "1";
    __resetMemoryCounters();
    modelCallsToolWith({ decline_reason: "No." });
    expect((await generate(await generateRequest())).status).toBe(422);
    expect((await generate(await generateRequest())).status).toBe(503);
    delete process.env.FREE_DAILY_PACK_CEILING;
  });

  it("still saves an ordinary pack", async () => {
    modelCallsToolWith({
      title: "Friday Night Quiz",
      rounds: [
        {
          title: "Warm-Up",
          category: "General Knowledge",
          questions: [{ text: "What is the capital of France?", answer: "Paris", points: 1 }],
        },
      ],
    });

    const res = await generate(await generateRequest());
    expect(res.status).toBe(201);
    expect((await res.json()).pack.title).toBe("Friday Night Quiz");
  });
});
