import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";

vi.mock("@/lib/generate-pack", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/generate-pack")>()),
  generateQuizPack: vi.fn(),
}));

import { generateQuizPack } from "@/lib/generate-pack";
import { POST as generate } from "@/app/api/packs/generate/route";
import { CREDIT_EXHAUSTED_LOG, GENERATION_PAUSED_MESSAGE } from "@/lib/anthropic";
import { FREE_CEILING_ENV, __resetMemoryCounters } from "@/lib/daily-ceiling";
import { __resetFreeAllowanceCounters } from "@/lib/free-allowance";
import { signInTestHost, type TestHost } from "./auth-fixture";

const BASE = "http://localhost:3000";

/**
 * An exhausted Anthropic account, through the real route (H3).
 *
 * It used to come back as the generic 502 "Couldn't generate a quiz pack right
 * now. Please try again." — advice that cannot work, on the one failure that
 * needs somebody to top up an account rather than press a button again.
 */

let ip = 800;
function generateRequest(host: TestHost) {
  ip += 1;
  return new NextRequest(`${BASE}/api/packs/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.6.0.${ip % 250}`,
      ...host.cookieHeader,
    },
    body: JSON.stringify({ prompt: "Four rounds of pub trivia." }),
  });
}

const creditError = () =>
  new Anthropic.APIError(
    400,
    {
      error: {
        type: "invalid_request_error",
        message: "Your credit balance is too low to access the Anthropic API.",
      },
    },
    "Your credit balance is too low to access the Anthropic API.",
    undefined
  );

let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  error = vi.spyOn(console, "error").mockImplementation(() => {});
  __resetMemoryCounters();
  __resetFreeAllowanceCounters();
  vi.mocked(generateQuizPack).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  __resetMemoryCounters();
  __resetFreeAllowanceCounters();
  delete process.env[FREE_CEILING_ENV];
});

afterAll(async () => {
  await db.$disconnect();
});

describe("when the Anthropic account cannot be charged", () => {
  it("answers 503 with the paused message, not the generic retry advice", async () => {
    vi.mocked(generateQuizPack).mockRejectedValue(creditError());
    const host = await signInTestHost();

    const res = await generate(generateRequest(host));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe(GENERATION_PAUSED_MESSAGE);
    expect(body.generationPaused).toBe(true);
    // Not the 502 wording, and not the busy-upstream wording either.
    expect(body.error).not.toMatch(/Couldn't generate/i);
    expect(body.error).not.toMatch(/having problems/i);
  });

  it("logs it with a string worth alerting on", async () => {
    vi.mocked(generateQuizPack).mockRejectedValue(creditError());
    const host = await signInTestHost();

    await generate(generateRequest(host));

    expect(error.mock.calls.flat().join(" ")).toContain(CREDIT_EXHAUSTED_LOG);
  });

  it("does not charge the host a free pack for it", async () => {
    // The model produced nothing, so the allowance comes back — otherwise two of
    // these would lock a free account out for 30 days over our billing problem.
    vi.mocked(generateQuizPack).mockRejectedValue(creditError());
    const host = await signInTestHost();

    await generate(generateRequest(host));

    const creator = await db.creator.findUniqueOrThrow({ where: { id: host.id } });
    expect(creator.packsGeneratedInPeriod).toBe(0);
  });

  it("hands the shared daily unit back, since nothing was generated", async () => {
    process.env[FREE_CEILING_ENV] = "1";
    vi.mocked(generateQuizPack).mockRejectedValue(creditError());
    const failing = await signInTestHost();
    expect((await generate(generateRequest(failing))).status).toBe(503);

    // If the ceiling had kept its unit, this next host would be refused by it
    // rather than served.
    vi.mocked(generateQuizPack).mockResolvedValue({
      pack: {
        title: "Recovered Pack",
        rounds: [
          {
            title: "Round One",
            category: "General Knowledge",
            questions: [{ text: "Q?", answer: "A", points: 1, type: "TEXT" }],
          },
        ],
      },
      droppedQuestions: 0,
      droppedRounds: 0,
      truncated: false,
    } as never);
    const next = await signInTestHost();
    expect((await generate(generateRequest(next))).status).toBe(201);
  });

  it("still answers the busy-upstream message for a rate limit", async () => {
    // The neighbouring case, so the new branch cannot swallow it.
    vi.mocked(generateQuizPack).mockRejectedValue(
      new Anthropic.APIError(429, { error: { type: "rate_limit_error", message: "slow down" } }, "slow down", undefined)
    );
    const host = await signInTestHost();

    const res = await generate(generateRequest(host));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe(UPSTREAM_TROUBLE);
    expect(error.mock.calls.flat().join(" ")).not.toContain(CREDIT_EXHAUSTED_LOG);
  });

  it("says the AI service is having problems when it is down, not that it is busy", async () => {
    // Anthropic had an outage on 2026-09-29; "busy, try again in a moment"
    // told hosts to keep pressing a button that could not work.
    vi.mocked(generateQuizPack).mockRejectedValue(
      new Anthropic.APIError(500, { error: { type: "api_error", message: "internal" } }, "internal", undefined)
    );
    const host = await signInTestHost();

    const res = await generate(generateRequest(host));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe(UPSTREAM_TROUBLE);
  });
});

const UPSTREAM_TROUBLE = "The AI service we use is having problems. Please try again in a few minutes.";

describe("when a spend limit is reached (PRC14)", () => {
  // docs.claude.com/en/api/rate-limits: the owner's own limit is a 400
  // invalid_request_error; the tier's cap is a 429 rate_limit_error carrying
  // error.details.error_code "enforced_spend_limit_reached". Neither clears
  // on retry, so both are "generation paused", with the alert string logged.
  const cases = {
    "the organisation's own spend limit (400)": () =>
      new Anthropic.APIError(
        400,
        {
          error: {
            type: "invalid_request_error",
            message: "You have reached your specified API usage limits. You will regain access on 2026-11-01 at 00:00 UTC.",
          },
        },
        "You have reached your specified API usage limits.",
        undefined
      ),
    "a workspace's own spend limit (400)": () =>
      new Anthropic.APIError(
        400,
        {
          error: {
            type: "invalid_request_error",
            message: "You have reached your specified workspace API usage limits. You will regain access on 2026-11-01 at 00:00 UTC.",
          },
        },
        "You have reached your specified workspace API usage limits.",
        undefined
      ),
    "the tier's spend cap (429 enforced_spend_limit_reached)": () =>
      new Anthropic.APIError(
        429,
        {
          type: "error",
          error: {
            type: "rate_limit_error",
            message: "You have reached your API usage limits: your organization has crossed its monthly API usage threshold.",
            details: { error_code: "enforced_spend_limit_reached" },
          },
        },
        "You have reached your API usage limits.",
        undefined
      ),
  };

  for (const [name, make] of Object.entries(cases)) {
    it(`${name}: the paused message, and the alert string in the log`, async () => {
      vi.mocked(generateQuizPack).mockRejectedValue(make());
      const host = await signInTestHost();

      const res = await generate(generateRequest(host));
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toBe(GENERATION_PAUSED_MESSAGE);
      expect(body.generationPaused).toBe(true);
      expect(error.mock.calls.flat().join(" ")).toContain(CREDIT_EXHAUSTED_LOG);
    });
  }
});
