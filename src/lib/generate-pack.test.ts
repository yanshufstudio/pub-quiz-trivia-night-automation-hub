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

import {
  generateQuizPack,
  IncompletePackError,
  MAX_DECLINE_REASON_CHARS,
  ModelDeclinedError,
  UnusableModelOutputError,
} from "@/lib/generate-pack";

type Request = Anthropic.MessageCreateParamsNonStreaming;

function packInput() {
  return {
    requested_rounds: 1,
    requested_questions_per_round: [1],
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

  /**
   * ACC1. A production pack on 28 Sep called the Spice Girls "British-Irish"
   * and Alanis Morissette "US" — both answers right, both questions wrong,
   * both from a nationality nobody needed. The review pass catches what gets
   * through; this is the instruction that stops most of it being written.
   */
  it("asks for certain facts only, in the question as well as the answer", async () => {
    const system = (await captureRequest()).system as string;

    expect(system).toMatch(/only facts you are\s+certain of, in the question as well as in the answer/i);
    expect(system).toMatch(/fewest\s+descriptors needed for one unambiguous answer/i);
    expect(system).toMatch(/incidental\s+nationality, year, number or 'first', 'only' or 'largest'/i);
    expect(system).toMatch(/unsure of a detail, leave it out rather than guess/i);
    // Additions, not replacements: the rules that were there stay.
    expect(system).toMatch(/single unambiguous factual answer/i);
    expect(system).toMatch(/decline_reason/);
  });

  it("asks for exactly one call to the pack tool", async () => {
    // Auto tool choice (Opus 5.5 refuses forced), so the prompt is what asks.
    const req = await captureRequest();

    expect(req.tools?.[0]).toMatchObject({ name: "emit_quiz_pack" });
    expect(req.system as string).toMatch(/Call the emit_quiz_pack tool exactly once/);
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
 * ACC8. ACC5's G3 history pack came back as one round of 9 where three rounds
 * of 8 were asked, with a stray "][0:0]" among its options, and nothing
 * flagged it: not truncated, nothing dropped, saved as a good pack. The model
 * now states the counts it was asked for before it writes a round, and a pack
 * short of them, or with a broken option set, gets one more attempt.
 */
function question(n: number, extra: Record<string, unknown> = {}) {
  return { text: `Question ${n}?`, answer: `Answer ${n}`, points: 1, ...extra };
}

function roundOf(size: number, title = "Rome") {
  return { title, category: "History", questions: Array.from({ length: size }, (_, i) => question(i + 1)) };
}

function packWith(requested: number[], sizes: number[], title = "History Night") {
  return {
    requested_rounds: requested.length,
    requested_questions_per_round: requested,
    title,
    rounds: sizes.map((size, i) => roundOf(size, `Round ${String.fromCharCode(65 + i)}`)),
  };
}

function modelRepliesInTurn(...inputs: unknown[]) {
  for (const input of inputs) {
    create.mockResolvedValueOnce({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "tu_1", name: "emit_quiz_pack", input }],
      usage: { input_tokens: 100, output_tokens: 1000, output_tokens_details: { thinking_tokens: 0 } },
    });
  }
}

function withChoices(options: unknown, answer = "Answer 1") {
  const pack = packWith([2], [2]);
  pack.rounds[0].questions[0] = question(1, { type: "MULTIPLE_CHOICE", answer, options }) as never;
  return pack;
}

describe("generateQuizPack — the pack it was asked for (ACC8)", () => {
  it("asks for the requested counts first, before the title and the rounds", async () => {
    const schema = (await captureRequest()).tools?.[0] as Anthropic.Tool;
    const keys = Object.keys(schema.input_schema.properties as object);

    expect(keys.slice(0, 2)).toEqual(["requested_rounds", "requested_questions_per_round"]);
    expect(keys.indexOf("title")).toBeGreaterThan(1);
    expect(JSON.stringify(schema)).toMatch(/before (you write )?any round/i);
  });

  it("tries once more when the pack is short of what was asked, and keeps the second", async () => {
    modelRepliesInTurn(packWith([8, 8, 8], [9]), packWith([8, 8, 8], [8, 8, 8]));

    const result = await generateQuizPack("3 rounds of 8 questions.");

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.pack.rounds.map((r) => r.questions.length)).toEqual([8, 8, 8]);
    expect(result.attempts).toBe(2);
    // Both calls were paid for, so both are in the cost log.
    expect(result.usage).toMatchObject({ inputTokens: 200, outputTokens: 2000 });
  });

  it("fails with a message the host can act on when the second attempt is short too", async () => {
    modelRepliesInTurn(packWith([8, 8, 8], [9]), packWith([8, 8, 8], [9]));

    const err = await generateQuizPack("3 rounds of 8 questions.").catch((e) => e);

    expect(create).toHaveBeenCalledTimes(2);
    expect(err).toBeInstanceOf(IncompletePackError);
    expect(err.truncated).toBe(false);
    expect(err.hostMessage).toMatch(/asked for 24 questions, got 9/);
    expect(err.hostMessage).toMatch(/generate again/i);
  });

  it("counts a short round even when the total is right", async () => {
    modelRepliesInTurn(packWith([5, 5], [7, 3]), packWith([5, 5], [7, 3]));

    await expect(generateQuizPack("Two rounds of five.")).rejects.toBeInstanceOf(IncompletePackError);
  });

  it("treats a pack with no counts stated as malformed, not as a decline", async () => {
    const noCounts: Record<string, unknown> = packWith([2], [2]);
    delete noCounts.requested_rounds;
    delete noCounts.requested_questions_per_round;
    modelRepliesInTurn(noCounts, noCounts);

    await expect(generateQuizPack("A round.")).rejects.toBeInstanceOf(IncompletePackError);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("keeps extra questions, and says how many there were", async () => {
    modelRepliesInTurn(packWith([5], [6]));

    const result = await generateQuizPack("One round of five.");

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.pack.rounds[0].questions).toHaveLength(6);
    expect(result.surplusQuestions).toBe(1);
  });

  it("does not retry a truncated pack: asking for less is the fix, as before", async () => {
    create.mockResolvedValueOnce({
      stop_reason: "max_tokens",
      content: [{ type: "tool_use", id: "tu_1", name: "emit_quiz_pack", input: packWith([15, 15, 15], [15, 4]) }],
    });

    const result = await generateQuizPack("Three rounds of fifteen.");

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.truncated).toBe(true);
  });

  it("repairs blank and duplicate options without another attempt", async () => {
    modelRepliesInTurn(withChoices(["Answer 1", " ", "answer 1 ", "Rome", "Rome"]));

    const q = (await generateQuizPack("x")).pack.rounds[0].questions[0];

    expect(create).toHaveBeenCalledTimes(1);
    expect(q).toMatchObject({ type: "MULTIPLE_CHOICE", options: ["Answer 1", "Rome"] });
  });

  it("keeps options whose colons, quotes or brackets are just punctuation", async () => {
    const options = ["Star Wars: A New Hope", 'The "Iron Lady"', "Hey Jude [Remastered]", "Answer 1"];
    modelRepliesInTurn(withChoices(options));

    const q = (await generateQuizPack("x")).pack.rounds[0].questions[0];

    expect(create).toHaveBeenCalledTimes(1);
    expect(q).toMatchObject({ type: "MULTIPLE_CHOICE", options });
  });

  it.each(["][0:0]", "[0:0]", 'Rome":', '{"text"', 'Nero"}', "{", "}", 'Nero\\"'])(
    "tries once more on the leaked fragment %s in an option, then fails",
    async (leak) => {
      const options = ["Augustus", "Nero", leak, "Answer 1"];
      modelRepliesInTurn(withChoices(options), withChoices(options));

      await expect(generateQuizPack("x")).rejects.toBeInstanceOf(IncompletePackError);
      expect(create).toHaveBeenCalledTimes(2);
    }
  );

  it.each([
    ["leaked syntax in an option", ["Augustus", "Nero", "][0:0]", "Answer 1"]],
    ["the answer missing from the options", ["Augustus", "Nero"]],
    ["fewer than two distinct options once repaired", ["Answer 1", "answer 1", " "]],
    ["no options at all", undefined],
  ])("tries once more on %s, then fails", async (_case, options) => {
    modelRepliesInTurn(withChoices(options), withChoices(options));

    const err = await generateQuizPack("x").catch((e) => e);

    expect(create).toHaveBeenCalledTimes(2);
    expect(err).toBeInstanceOf(IncompletePackError);
    expect(err.hostMessage).toMatch(/generate again/i);
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

/**
 * ACC6. The generator takes a configuration so the accuracy harness can
 * measure other models and settings through this same code.
 */
describe("generateQuizPack — configuration (ACC6)", () => {
  // ACC5, Paul's pick: G3 made 2.6 errors per 100 questions against 12-17 for
  // the Sonnet 5 configurations. Opus 5.5 refuses forced tool choice, so the
  // model and the tool mode go together.
  it("sends production Opus 5.5 at low effort: auto tool choice with a strict tool", async () => {
    const req = await captureRequest();

    expect(req.model).toBe("claude-opus-5-5");
    expect(req.tool_choice).toEqual({ type: "auto" });
    expect(req.tools?.[0]).toMatchObject({ name: "emit_quiz_pack", strict: true });
    expect(req.output_config).toEqual({ effort: "low" });
    expect(req).not.toHaveProperty("thinking");
    // Strict schemas refuse numeric and length bounds; zod still enforces them.
    const schema = JSON.stringify(req.tools?.[0]);
    expect(schema).not.toMatch(/"(minimum|maximum|maxItems)"/);
    expect(schema).toContain('"additionalProperties":false');
  });

  it("still sends Sonnet 5's forced way when told to, for the harness", async () => {
    modelReplies(packInput());
    await generateQuizPack("Four rounds.", { model: "claude-sonnet-5", thinking: "default", toolMode: "forced" });
    const req = create.mock.calls[0][0] as Request;

    expect(req.model).toBe("claude-sonnet-5");
    expect(req.tool_choice).toEqual({ type: "tool", name: "emit_quiz_pack" });
    expect(req).not.toHaveProperty("thinking");
    expect(req).not.toHaveProperty("output_config");
    expect(req.tools?.[0]).not.toHaveProperty("strict");
    expect(JSON.stringify(req.tools?.[0])).toContain('"maximum":10');
  });

  it("sends a thinking setting only when one is chosen", async () => {
    modelReplies(packInput());
    await generateQuizPack("Four rounds.", { model: "claude-sonnet-5", thinking: "disabled", toolMode: "forced" });

    expect((create.mock.calls[0][0] as Request).thinking).toEqual({ type: "disabled" });
  });

  it("returns the call's tokens, thinking included, for cost logging", async () => {
    create.mockResolvedValue({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "tu_1", name: "emit_quiz_pack", input: packInput() }],
      usage: { input_tokens: 900, output_tokens: 2500, output_tokens_details: { thinking_tokens: 1200 } },
    });

    const { usage } = await generateQuizPack("Four rounds.");

    expect(usage).toMatchObject({ model: "claude-opus-5-5", inputTokens: 900, outputTokens: 2500, thinkingTokens: 1200 });
    expect(usage.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("can leave ACC1's rules out, for the harness's before/after measurement only", async () => {
    modelReplies(packInput());
    await generateQuizPack("Four rounds.", { ...{ model: "claude-sonnet-5", thinking: "default", toolMode: "forced" }, promptRules: "before-acc1" });
    const system = (create.mock.calls[0][0] as Request).system as string;

    expect(system).not.toMatch(/certain of/);
    expect(system).toMatch(/single unambiguous factual answer/);
  });
});
