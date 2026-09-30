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

import {
  generateQuizPack,
  GenerationTimedOutError,
  IncompletePackError,
  UnusableModelOutputError,
} from "@/lib/generate-pack";
import { POST as generate } from "@/app/api/packs/generate/route";
import { signInTestHost } from "./auth-fixture";

const BASE = "http://localhost:3000";

// Same reason as generate-cap.integration.test.ts: the per-IP rate limiter's
// in-memory bucket is shared across every test in a file, so each test poses
// as a different visitor rather than exhausting one visitor's 5-per-10-min.
let testIp = 100;


// Generation needs an account now (src/lib/auth-guard.ts); what this file
// is about is what happens after that, so one host serves every test.
const host = await signInTestHost();

function generateRequest() {
  return new NextRequest(`${BASE}/api/packs/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.7.0.${testIp}`,
      ...host.cookieHeader,
    },
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

  it("502s a pack that came back short twice, with the generator's own words for the host", async () => {
    vi.mocked(generateQuizPack).mockRejectedValue(
      new IncompletePackError(
        "short pack: 9 of 24 questions",
        "The pack came back incomplete (asked for 24 questions, got 9). Please generate again."
      )
    );

    const res = await generate(generateRequest());
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toBe("The pack came back incomplete (asked for 24 questions, got 9). Please generate again.");
  });

  // ACC13: the tokens of a failed generation are still spent, so they are logged.
  it("logs the tokens a failed generation spent", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const err = new IncompletePackError("short pack", "The pack came back incomplete. Please generate again.");
    Object.assign(err, {
      attempts: 2,
      usage: { model: "claude-opus-5-5", inputTokens: 1800, outputTokens: 4200, thinkingTokens: 0, durationMs: 61000 },
    });
    vi.mocked(generateQuizPack).mockRejectedValue(err);

    await generate(generateRequest());

    expect(info).toHaveBeenCalledWith(
      expect.stringMatching(
        /^pack-generation-failed: error=IncompletePackError gen_model=claude-opus-5-5 gen_in=1800 gen_out=4200 gen_thinking=0 gen_ms=61000 gen_attempts=2$/
      )
    );
    info.mockRestore();
  });

  /**
   * GH5. The function has 300s. Generation used to get the SDK's default ten
   * minutes per attempt, so a slow call could outlive the function and lose
   * the pack, the refunds and the cost log together.
   */
  it("gives generation a deadline inside the function's 300s, with room left to save", async () => {
    vi.mocked(generateQuizPack).mockRejectedValue(new UnusableModelOutputError("x", false));
    const before = Date.now();

    await generate(generateRequest());
    const options = vi.mocked(generateQuizPack).mock.calls[0][2];

    expect(options?.deadline).toBeGreaterThan(before);
    expect(options?.deadline).toBeLessThanOrEqual(before + 300_000 - 15_000 + 1_000);
  });

  it("422s a generation that ran out of time, and says what to change", async () => {
    vi.mocked(generateQuizPack).mockRejectedValue(new GenerationTimedOutError());

    const res = await generate(generateRequest());
    const data = await res.json();

    expect(res.status).toBe(422);
    expect(data.error).toMatch(/fewer rounds/i);
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
      usage: { model: "claude-sonnet-5", inputTokens: 1, outputTokens: 1, thinkingTokens: null, durationMs: 1 },
      attempts: 1,
      surplusQuestions: 0,
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
