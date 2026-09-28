import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import type { GeneratedPack } from "@/lib/quiz-schema";
import { signInTestHost, type TestHost } from "./auth-fixture";

/**
 * ACC2 through the route: the review runs on every generated pack, applies
 * its verdicts before the save, and — whatever goes wrong in it — never
 * costs the host the pack or gives back an allowance the generation used.
 *
 * The generation is stubbed at generateQuizPack; the review is stubbed only
 * at the Anthropic transport, so its prompts, parsing, verdicts and failure
 * handling are the real ones.
 */
const create = vi.fn();
vi.mock("@/lib/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/anthropic")>();
  return { ...actual, getAnthropicClient: () => ({ messages: { create } }) };
});

vi.mock("@/lib/generate-pack", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/generate-pack")>()),
  generateQuizPack: vi.fn(),
}));

import { generateQuizPack } from "@/lib/generate-pack";
import { POST as generate } from "@/app/api/packs/generate/route";

const BASE = "http://localhost:3000";
let testIp = 0;
let host: TestHost;

function nineties(): GeneratedPack {
  return {
    title: "Totally 90s",
    rounds: [
      {
        title: "Pop",
        category: "1990s pop",
        questions: [
          { text: "Which British-Irish girl group had a hit with 'Wannabe' in 1996?", answer: "Spice Girls", points: 1, type: "TEXT" },
          { text: "Which US singer released 'Jagged Little Pill' in 1995?", answer: "Alanis Morissette", points: 1, type: "TEXT" },
          { text: "Who sang 'Believe' in 1998?", answer: "Cher", points: 1, type: "TEXT" },
        ],
      },
    ],
  };
}

const USAGE = { model: "claude-sonnet-5", inputTokens: 900, outputTokens: 2000, thinkingTokens: 500, durationMs: 1 };

function generates(pack: GeneratedPack, dropped = 0) {
  vi.mocked(generateQuizPack).mockResolvedValue({
    pack,
    droppedQuestions: dropped,
    droppedRounds: 0,
    truncated: dropped > 0,
    usage: USAGE,
  });
}

function toolReply(name: string, input: unknown) {
  return {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: "tu", name, input }],
    usage: { input_tokens: 800, output_tokens: 400, output_tokens_details: { thinking_tokens: 100 } },
  };
}

function request() {
  return new NextRequest(`${BASE}/api/packs/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.9.0.${testIp}`, ...host.cookieHeader },
    body: JSON.stringify({ prompt: "1 round of 3 questions on 1990s pop music" }),
  });
}

async function saved(id: string) {
  return db.quizPack.findUniqueOrThrow({
    where: { id },
    omit: { reviewNotes: false },
    include: { rounds: { include: { questions: { orderBy: { index: "asc" } } } } },
  });
}

async function packsUsed() {
  return (await db.creator.findUniqueOrThrow({ where: { id: host.id } })).packsGeneratedInPeriod;
}

describe("POST /api/packs/generate — the accuracy review (ACC2)", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  beforeEach(async () => {
    testIp += 1;
    host = await signInTestHost();
    create.mockReset();
    vi.mocked(generateQuizPack).mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("applies the review's fixes and drops, and records the pack as checked", async () => {
    generates(nineties());
    create
      .mockResolvedValueOnce(
        toolReply("emit_blind_check", {
          checks: [
            { id: "R1Q1", answer: "Spice Girls", more_than_one_answer: false, wording_issue: "'British-Irish': English", not_a_question: false },
            { id: "R1Q2", answer: "Alanis Morissette", more_than_one_answer: false, wording_issue: "'US': Canadian", not_a_question: false },
            { id: "R1Q3", answer: "Cher", more_than_one_answer: false, wording_issue: "", not_a_question: false },
          ],
        })
      )
      .mockResolvedValueOnce(
        toolReply("emit_review", {
          reviews: [
            { id: "R1Q1", verdict: "fix", reason: "English", text: "Which English girl group had a hit with 'Wannabe' in 1996?" },
            { id: "R1Q2", verdict: "drop", reason: "Canadian, not US" },
          ],
        })
      );

    const res = await generate(request());
    const body = (await res.json()) as { pack: { id: string } & Record<string, unknown> };

    expect(res.status).toBe(201);
    const pack = await saved(body.pack.id);
    expect(pack.rounds[0].questions.map((q) => q.text)).toEqual([
      "Which English girl group had a hit with 'Wannabe' in 1996?",
      "Who sang 'Believe' in 1998?",
    ]);
    expect(pack).toMatchObject({ reviewStatus: "checked", reviewFixed: 1, reviewDropped: 1 });
    expect(JSON.parse(pack.reviewNotes!).dropped[0]).toMatchObject({ id: "R1Q2", reason: "Canadian, not US" });
    // Support data, not the host's: it never leaves the server.
    expect(body.pack).not.toHaveProperty("reviewNotes");
    expect(generateQuizPack).toHaveBeenCalledTimes(1);
  });

  const failures: [string, () => void][] = [
    ["a timeout", () => create.mockRejectedValue(new Anthropic.APIConnectionTimeoutError())],
    ["a 5xx", () => create.mockRejectedValue(new Anthropic.APIError(529, { type: "error" }, "overloaded", undefined))],
    ["a 429", () => create.mockRejectedValue(new Anthropic.APIError(429, { type: "error" }, "rate limited", undefined))],
    [
      "an exhausted account",
      () =>
        create.mockRejectedValue(
          new Anthropic.APIError(400, { error: { type: "invalid_request_error", message: "Your credit balance is too low" } }, "400", undefined)
        ),
    ],
    ["a decline", () => create.mockResolvedValue({ stop_reason: "refusal", content: [], usage: { input_tokens: 1, output_tokens: 0 } })],
    ["unusable output", () => create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "fine" }], usage: { input_tokens: 1, output_tokens: 1 } })],
  ];

  for (const [name, fail] of failures) {
    it(`saves the unreviewed pack as not checked after ${name}, and keeps the allowance spent`, async () => {
      generates(nineties());
      fail();
      const before = await packsUsed();

      const res = await generate(request());
      const body = (await res.json()) as { pack: { id: string } };

      expect(res.status).toBe(201);
      const pack = await saved(body.pack.id);
      expect(pack.reviewStatus).toBe("not_checked");
      expect(pack.rounds[0].questions.map((q) => q.text)).toEqual(nineties().rounds[0].questions.map((q) => q.text));
      // The generation happened and counts: the review failing gives nothing back.
      expect(await packsUsed()).toBe(before + 1);
      expect(generateQuizPack).toHaveBeenCalledTimes(1);
    });
  }

  it("skips the review entirely when PACK_REVIEW=off, and says so on the pack", async () => {
    vi.stubEnv("PACK_REVIEW", "off");
    generates(nineties());

    const res = await generate(request());
    const body = (await res.json()) as { pack: { id: string } };

    expect(create).not.toHaveBeenCalled();
    const pack = await saved(body.pack.id);
    expect(pack.reviewStatus).toBe("not_checked");
    expect(JSON.parse(pack.reviewNotes!)).toEqual({ failure: "disabled" });
  });

  it("reviews a salvaged pack too", async () => {
    const salvaged = nineties();
    salvaged.rounds[0].questions = salvaged.rounds[0].questions.slice(0, 2);
    generates(salvaged, 1);
    create.mockResolvedValueOnce(
      toolReply("emit_blind_check", {
        checks: [
          { id: "R1Q1", answer: "Spice Girls", more_than_one_answer: false, wording_issue: "", not_a_question: false },
          { id: "R1Q2", answer: "Alanis Morissette", more_than_one_answer: false, wording_issue: "", not_a_question: false },
        ],
      })
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await generate(request());
    const body = (await res.json()) as { pack: { id: string } };

    expect(create).toHaveBeenCalledTimes(1);
    expect((await saved(body.pack.id)).reviewStatus).toBe("checked");
  });

  it("logs tokens for both calls, and no brief text", async () => {
    generates(nineties());
    create.mockResolvedValueOnce(
      toolReply("emit_blind_check", {
        checks: ["Spice Girls", "Alanis Morissette", "Cher"].map((answer, i) => ({
          id: `R1Q${i + 1}`,
          answer,
          more_than_one_answer: false,
          wording_issue: "",
          not_a_question: false,
        })),
      })
    );
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await generate(request());
    const line = info.mock.calls.map((c) => String(c[0])).find((l) => l.startsWith("pack-generated:"));

    expect(line).toMatch(/review=checked/);
    expect(line).toMatch(/gen_in=900 gen_out=2000 gen_thinking=500/);
    expect(line).toMatch(/review_calls=1 .*review_in=800 review_out=400 review_thinking=100/);
    expect(line).not.toMatch(/1990s pop/);
  });
});
