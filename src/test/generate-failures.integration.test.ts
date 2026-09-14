import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";

// Only the model call is stubbed; UnusableModelOutputError stays real,
// because the route's status mapping branches on it with `instanceof`.
vi.mock("@/lib/generate-pack", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/generate-pack")>()),
  generateQuizPack: vi.fn(),
}));

import { generateQuizPack, UnusableModelOutputError } from "@/lib/generate-pack";
import { POST as generate } from "@/app/api/packs/generate/route";

const BASE = "http://localhost:3000";

// Same reason as generate-cap.integration.test.ts: the per-IP rate limiter's
// in-memory bucket is shared across every test in a file, so each test poses
// as a different visitor rather than exhausting one visitor's 5-per-10-min.
let testIp = 100;

function generateRequest() {
  return new NextRequest(`${BASE}/api/packs/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.7.0.${testIp}` },
    body: JSON.stringify({ prompt: "Four rounds of pub trivia." }),
  });
}

function apiError(status: number) {
  // The SDK's own constructor, so `instanceof Anthropic.APIError` in the
  // route matches for the same reason it does against a real API failure.
  return new Anthropic.APIError(status, { type: "error" }, "upstream said no", undefined);
}

/**
 * Every generation failure used to return one 502 saying "Please try again",
 * including on a truncated brief, where trying again cannot help. These
 * assert the failure the caller is told about matches the one that happened.
 */
describe("POST /api/packs/generate — failure mapping", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  beforeEach(() => {
    testIp += 1;
    vi.mocked(generateQuizPack).mockReset();
  });

  afterEach(() => {
    vi.mocked(generateQuizPack).mockReset();
  });

  it("422s a brief too big to generate in one go, and says what to change", async () => {
    vi.mocked(generateQuizPack).mockRejectedValue(
      new UnusableModelOutputError("Generated quiz pack failed validation: …", true)
    );

    const res = await generate(generateRequest());
    const data = await res.json();

    expect(res.status).toBe(422);
    expect(data.error).toMatch(/fewer rounds/i);
    // "Please try again" is the one thing this message must not say: the
    // brief produces the same truncation every time.
    expect(data.error).not.toMatch(/try again\.?$/i);
  });

  it("503s when the upstream model API is overloaded", async () => {
    vi.mocked(generateQuizPack).mockRejectedValue(apiError(529));

    const res = await generate(generateRequest());
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.error).toMatch(/busy/i);
  });

  it("503s when the upstream model API rate-limits us", async () => {
    vi.mocked(generateQuizPack).mockRejectedValue(apiError(429));

    const res = await generate(generateRequest());
    expect(res.status).toBe(503);
  });

  it("502s an unusable response that isn't attributable to the brief or upstream", async () => {
    vi.mocked(generateQuizPack).mockRejectedValue(
      new UnusableModelOutputError("Model did not return structured quiz data", false)
    );

    const res = await generate(generateRequest());
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toMatch(/try again/i);
  });

  it("201s with the questions that survived a truncated generation", async () => {
    vi.mocked(generateQuizPack).mockResolvedValue({
      pack: {
        title: "Salvaged Pack",
        rounds: [
          {
            title: "Rivers",
            category: "Geography",
            questions: [
              { text: "Q1?", answer: "A1", points: 1, type: "TEXT" as const },
              { text: "Q2?", answer: "A2", points: 1, type: "TEXT" as const },
            ],
          },
        ],
      },
      droppedQuestions: 1,
      droppedRounds: 0,
      truncated: true,
    });

    const res = await generate(generateRequest());
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.pack.rounds[0].questions).toHaveLength(2);

    // The pack is really in the database, not just echoed back.
    const stored = await db.quizPack.findUniqueOrThrow({
      where: { id: data.pack.id },
      include: { rounds: { include: { questions: true } } },
    });
    expect(stored.rounds[0].questions).toHaveLength(2);
  });
});
