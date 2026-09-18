import { beforeEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";

// Only the transport is stubbed. The prompt, the tool schema and the
// salvage path all stay real, so these assert what generateQuizPack
// actually sends and what it makes of what comes back.
const create = vi.fn();
vi.mock("@/lib/anthropic", () => ({
  getAnthropicClient: () => ({ messages: { create } }),
  MissingApiKeyError: class MissingApiKeyError extends Error {},
}));

import { generateQuizPack, MAX_DECLINE_REASON_CHARS, ModelDeclinedError, UnusableModelOutputError } from "@/lib/generate-pack";

type Request = Anthropic.MessageCreateParamsNonStreaming;

function packInput() {
  return {
    title: "Friday Night Quiz",
    rounds: [
      {
        title: "Warm-Up",
        category: "General Knowledge",
        questions: [{ text: "What is the capital of France?", answer: "Paris", points: 1 }],
      },
    ],
  };
}

function modelReplies(input: unknown, stopReason = "end_turn") {
  create.mockResolvedValue({
    stop_reason: stopReason,
    content: [{ type: "tool_use", id: "tu_1", name: "emit_quiz_pack", input }],
  });
}

/** The request generateQuizPack actually put on the wire. */
async function captureRequest(): Promise<Request> {
  modelReplies(packInput());
  await generateQuizPack("Four rounds of pub trivia.");
  return create.mock.calls[0][0] as Request;
}

beforeEach(() => {
  create.mockReset();
});

describe("generateQuizPack — the brief sent to the model", () => {
  /**
   * The app renders question text and nothing else: no audio player, no
   * image. Nothing downstream can catch a question that needs media —
   * validation only checks the fields are non-empty, so "Listen to the clip.
   * Which band is playing?" passes every check and reaches the table
   * unanswerable, with every team scoring zero. Until the app can carry
   * media, this instruction is the only thing standing between the model and
   * that pack, so assert it survives in the prompt that is really sent
   * rather than in a constant someone could stop passing.
   */
  it("requires questions to be answerable from their own text", async () => {
    const system = (await captureRequest()).system as string;

    expect(system).toMatch(/answerable\s+from\s+its\s+own\s+text\s+alone/i);
    expect(system).toMatch(/no audio, image, video or map/i);
  });

  it("tells the model what to do with a brief that asks for a picture round", async () => {
    // The wizard's own default brief asks for a "picture-round-style"
    // closer, so "don't need media" alone would leave the model stuck.
    const system = (await captureRequest()).system as string;

    expect(system).toMatch(/picture or music round/i);
    expect(system).toMatch(/in words instead/i);
  });

  it("forces exactly one call to the pack tool", async () => {
    const req = await captureRequest();

    expect(req.tool_choice).toEqual({ type: "tool", name: "emit_quiz_pack" });
    expect(req.tools?.[0]).toMatchObject({ name: "emit_quiz_pack" });
  });

  /**
   * The 502 this pass was opened for: at 8000, a brief like "eight rounds of
   * fifteen questions" ran the model out of budget mid-tool-call and the
   * truncated response collapsed into a blanket 502. The ceiling is the fix,
   * so pin it — a later edit trimming it back reopens that bug.
   */
  it("allows enough output budget for a large brief", async () => {
    expect((await captureRequest()).max_tokens).toBeGreaterThanOrEqual(16000);
  });
});

describe("generateQuizPack — reading the response", () => {
  it("returns a clean pack with nothing dropped", async () => {
    modelReplies(packInput());

    const result = await generateQuizPack("Four rounds.");

    expect(result.pack.title).toBe("Friday Night Quiz");
    expect(result).toMatchObject({ droppedQuestions: 0, droppedRounds: 0, truncated: false });
  });

  it("flags a pack cut short at max_tokens, so the caller can say why", async () => {
    modelReplies(packInput(), "max_tokens");

    expect((await generateQuizPack("Eight rounds of fifteen.")).truncated).toBe(true);
  });
});

/**
 * Every other test of the decline path mocks generateQuizPack itself and
 * hands the route a ModelDeclinedError built by hand, so none of them ever
 * executed the detection below. That gap is exactly how the first version
 * shipped watching only for "end_turn": the request forces the tool, so a
 * safety classifier declining a brief reports "refusal" and the common case
 * fell through to a generic retryable 502.
 */
function modelDeclines({
  stopReason,
  text,
  explanation,
}: {
  stopReason: string;
  text?: string[];
  explanation?: string;
}) {
  create.mockResolvedValue({
    stop_reason: stopReason,
    stop_details: explanation === undefined ? null : { type: "refusal", explanation },
    content: (text ?? []).map((t) => ({ type: "text", text: t })),
  });
}

describe("generateQuizPack — a brief the model declines", () => {
  it("reads a refusal, which is the shape a forced-tool request actually gets", async () => {
    modelDeclines({ stopReason: "refusal", explanation: "I can't write questions about that." });

    await expect(generateQuizPack("something disallowed")).rejects.toBeInstanceOf(ModelDeclinedError);
    await expect(generateQuizPack("something disallowed")).rejects.toMatchObject({
      reason: "I can't write questions about that.",
    });
  });

  it("reads an ordinary end_turn decline out of the text blocks", async () => {
    modelDeclines({ stopReason: "end_turn", text: ["I'd rather not write that quiz."] });

    await expect(generateQuizPack("something odd")).rejects.toMatchObject({
      reason: "I'd rather not write that quiz.",
    });
  });

  it("joins several text blocks rather than reporting only the first", async () => {
    modelDeclines({ stopReason: "end_turn", text: ["I can't help with that.", "Try another topic."] });

    await expect(generateQuizPack("x")).rejects.toMatchObject({
      reason: "I can't help with that. Try another topic.",
    });
  });

  it("prefers the structured explanation over any prose alongside it", async () => {
    modelDeclines({
      stopReason: "refusal",
      explanation: "Policy: weapons synthesis.",
      text: ["Some other chatter."],
    });

    await expect(generateQuizPack("x")).rejects.toMatchObject({ reason: "Policy: weapons synthesis." });
  });

  it("caps the reason, because it is model output going onto a page", async () => {
    modelDeclines({ stopReason: "refusal", explanation: "n".repeat(MAX_DECLINE_REASON_CHARS + 500) });

    await expect(generateQuizPack("x")).rejects.toMatchObject({
      reason: "n".repeat(MAX_DECLINE_REASON_CHARS),
    });
  });

  it("declines with an empty reason rather than inventing one", async () => {
    modelDeclines({ stopReason: "refusal" });

    const err = await generateQuizPack("x").catch((e) => e);
    expect(err).toBeInstanceOf(ModelDeclinedError);
    expect(err.reason).toBe("");
  });

  it("still calls a cut-off turn a size problem, not a decline", async () => {
    // max_tokens means it *was* writing the pack and ran out of room. That
    // wants "ask for less", not "the model said no".
    modelDeclines({ stopReason: "max_tokens", text: ["partial"] });

    const err = await generateQuizPack("forty rounds").catch((e) => e);
    expect(err).toBeInstanceOf(UnusableModelOutputError);
    expect(err.truncated).toBe(true);
  });

  it("treats a blown context window as the same size problem", async () => {
    modelDeclines({ stopReason: "model_context_window_exceeded" });

    const err = await generateQuizPack("forty rounds").catch((e) => e);
    expect(err).toBeInstanceOf(UnusableModelOutputError);
    expect(err.truncated).toBe(true);
  });
});

/**
 * The route that actually fires. A real run on 18 Sep, against a brief asking
 * for private individuals' home addresses and phone numbers, did not reach
 * any of the stop_reason paths above: tool_choice forces the tool, so the
 * model satisfied the contract it was given. It called the tool with a
 * substituted general-knowledge round titled "Know Your Trivia Limits" and
 * wrote its refusal as the text of question one — "I can't create a round
 * that doxxes real private individuals... Instead, here's a..." — which saved
 * as a successful pack and spent the user's free generation.
 *
 * The stop_reason detection is correct and stays as a second route. This is
 * the first one: give the tool an explicit way to say no, so refusing is
 * cheaper for the model than complying wrongly.
 */
function modelCallsToolWith(input: unknown) {
  create.mockResolvedValue({
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: "tu_1", name: "emit_quiz_pack", input }],
  });
}

describe("generateQuizPack — a decline delivered through the tool", () => {
  it("treats a decline_reason as a refusal, not a pack", async () => {
    modelCallsToolWith({ decline_reason: "I won't write questions that identify private individuals." });

    await expect(generateQuizPack("home addresses of my neighbours")).rejects.toMatchObject({
      reason: "I won't write questions that identify private individuals.",
    });
  });

  it("throws away a substituted quiz that arrives alongside the reason", async () => {
    // The exact shape the live run produced: a refusal *and* a replacement
    // pack. The pack is the part that must not reach the user.
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

    const err = await generateQuizPack("home addresses of my neighbours").catch((e) => e);
    expect(err).toBeInstanceOf(ModelDeclinedError);
    expect(err.reason).toBe("I can't create a round that doxxes real private individuals.");
  });

  it("caps a long reason from the tool the same way", async () => {
    modelCallsToolWith({ decline_reason: "n".repeat(MAX_DECLINE_REASON_CHARS + 200) });

    await expect(generateQuizPack("x")).rejects.toMatchObject({
      reason: "n".repeat(MAX_DECLINE_REASON_CHARS),
    });
  });

  it("leaves an ordinary pack alone", async () => {
    modelCallsToolWith(packInput());

    const result = await generateQuizPack("Four rounds of pub trivia.");
    expect(result.pack.title).toBe("Friday Night Quiz");
    expect(result.pack.rounds).toHaveLength(1);
  });

  it("does not read a blank or non-string decline_reason as a decline", async () => {
    for (const value of ["", "   ", null, 42, {}]) {
      modelCallsToolWith({ ...packInput(), decline_reason: value });
      const result = await generateQuizPack("Four rounds of pub trivia.");
      expect(result.pack.rounds).toHaveLength(1);
    }
  });
});
