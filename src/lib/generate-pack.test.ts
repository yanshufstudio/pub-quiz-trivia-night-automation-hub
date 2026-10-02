import { beforeEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";

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

  /**
   * ACC10. ACC5's sport round named Klose as the World Cup's top scorer, true
   * until July 2026, and no checker caught it: neither model knew the date.
   */
  it("gives the model today's date and asks it to date or avoid current records", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
    try {
      const system = (await captureRequest()).system as string;

      expect(system).toContain("Today's date is 2026-09-28.");
      expect(system).toMatch(/current record or a current holder/i);
      expect(system).toMatch(/state the year it is true for/i);
    } finally {
      vi.useRealTimers();
    }
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

  /**
   * ACC13. The 29 Sep smoke test: asked for 3 rounds of 8, Opus 5.5 returned
   * a correct [8,8,8] pack twice without stating the counts, and ACC8 failed
   * it as malformed. The counts are now required in the schema; if they are
   * still missing, the pack is kept and the gap is logged.
   */
  it("requires the counts in the schema, so a decline states them too", async () => {
    const schema = (await captureRequest()).tools?.[0] as Anthropic.Tool;

    expect(schema.input_schema.required).toEqual(["requested_rounds", "requested_questions_per_round"]);
  });

  it("keeps a correct pack that states no counts, and warns so it shows in the logs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const noCounts: Record<string, unknown> = packWith([8, 8, 8], [8, 8, 8]);
    delete noCounts.requested_rounds;
    delete noCounts.requested_questions_per_round;
    modelRepliesInTurn(noCounts);

    const result = await generateQuizPack("3 rounds of 8 questions.");

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.pack.rounds.map((r) => r.questions.length)).toEqual([8, 8, 8]);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/stated no requested counts/));
    warn.mockRestore();
  });

  it("still checks the options of a pack that states no counts", async () => {
    const pack: Record<string, unknown> = withChoices(["Augustus", "Nero"]);
    delete pack.requested_rounds;
    delete pack.requested_questions_per_round;
    modelRepliesInTurn(pack, pack);

    await expect(generateQuizPack("x")).rejects.toBeInstanceOf(IncompletePackError);
  });

  it("reads a decline that also states counts as a decline", async () => {
    modelRepliesInTurn({ requested_rounds: 3, requested_questions_per_round: [8, 8, 8], decline_reason: "Not writing that." });

    const err = await generateQuizPack("x").catch((e) => e);

    expect(err).toBeInstanceOf(ModelDeclinedError);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("carries the tokens of every attempt on a failure, so the cost is not lost", async () => {
    modelRepliesInTurn(packWith([8, 8, 8], [9]), packWith([8, 8, 8], [9]));

    const err = await generateQuizPack("3 rounds of 8 questions.").catch((e) => e);

    expect(err).toBeInstanceOf(IncompletePackError);
    expect(err.usage).toMatchObject({ model: "claude-opus-5-5", inputTokens: 200, outputTokens: 2000 });
    expect(err.attempts).toBe(2);
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

/** A two-question pack, one round, whose first question is `first`. */
function packWithFirst(first: Record<string, unknown>) {
  const pack = packWith([2], [2]);
  pack.rounds[0].questions[0] = question(1, first) as never;
  return pack;
}

/**
 * GH1. ACC7: question 1 of half the awkward-brief packs carried an `options`
 * array on a TEXT question — [], ["s?"], ["Manx"] — and when it held "", the
 * strict schema rejected the whole pack (hebrew-israel, quantum#3). Another
 * three responses sent `rounds` as a JSON string. Both are cleaned up before
 * validation now, so neither costs a pack.
 */
describe("generateQuizPack — the response is tidied before it is validated (GH1)", () => {
  it.each([[[""]], [["s?"]], [["Answer 1"]], [[]], [[" ", "Answer 1"]]])(
    "drops options %j from a TEXT question and keeps it, with no second attempt",
    async (options) => {
      modelRepliesInTurn(packWithFirst({ type: "TEXT", options }));

      const result = await generateQuizPack("x");
      const q = result.pack.rounds[0].questions[0];

      expect(create).toHaveBeenCalledTimes(1);
      expect(result.droppedQuestions).toBe(0);
      expect(q.type).toBe("TEXT");
      expect(q.options).toBeUndefined();
    }
  );

  it("drops stray options from a question that states no type at all", async () => {
    modelRepliesInTurn(packWithFirst({ options: [""] }));

    const q = (await generateQuizPack("x")).pack.rounds[0].questions[0];

    expect(create).toHaveBeenCalledTimes(1);
    expect(q).toMatchObject({ type: "TEXT" });
    expect(q.options).toBeUndefined();
  });

  it("reads rounds that arrive as a JSON string", async () => {
    const pack = packWith([2, 2], [2, 2]);
    modelRepliesInTurn({ ...pack, rounds: JSON.stringify(pack.rounds) });

    const result = await generateQuizPack("x");

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.pack.rounds.map((r) => r.questions.length)).toEqual([2, 2]);
  });

  it("tidies a truncated response too, so salvage does not lose the question", async () => {
    create.mockResolvedValueOnce({
      stop_reason: "max_tokens",
      content: [{ type: "tool_use", id: "tu_1", name: "emit_quiz_pack", input: packWithFirst({ type: "TEXT", options: [""] }) }],
    });

    const result = await generateQuizPack("x");

    expect(result.truncated).toBe(true);
    expect(result.droppedQuestions).toBe(0);
    expect(result.pack.rounds[0].questions).toHaveLength(2);
  });
});

/**
 * GH2. The 19:03 failure and three of ACC7's: a response that is not
 * truncated but can't be read at all (salvage finds nothing, or there is no
 * tool call and no decline) was a generic 502 with no second attempt. Like a
 * short pack, it now gets ACC8's one retry. Truncation keeps its own answer.
 */
describe("generateQuizPack — an unreadable response gets the one retry (GH2)", () => {
  it("tries once more when an untruncated response has no usable rounds, and keeps the second", async () => {
    modelRepliesInTurn({ requested_rounds: 1, requested_questions_per_round: [2], rounds: "not a list" }, packWith([2], [2]));

    const result = await generateQuizPack("x");

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.attempts).toBe(2);
    expect(result.pack.rounds[0].questions).toHaveLength(2);
  });

  it("fails as an incomplete pack, with words for the host, when the second is unreadable too", async () => {
    const unreadable = { requested_rounds: 1, requested_questions_per_round: [2], rounds: [{ title: "", questions: [{}] }] };
    modelRepliesInTurn(unreadable, unreadable);

    const err = await generateQuizPack("x").catch((e) => e);

    expect(create).toHaveBeenCalledTimes(2);
    expect(err).toBeInstanceOf(IncompletePackError);
    expect(err.truncated).toBe(false);
    expect(err.hostMessage).toMatch(/generate again/i);
  });

  it("tries once more on a turn with no tool call that is neither a decline nor cut off", async () => {
    create.mockResolvedValueOnce({ stop_reason: "stop_sequence", content: [] });
    modelRepliesInTurn(packWith([2], [2]));

    const result = await generateQuizPack("x");

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.attempts).toBe(2);
  });

  it("still answers a truncated, unreadable response with 'ask for less', without retrying", async () => {
    create.mockResolvedValueOnce({
      stop_reason: "max_tokens",
      content: [{ type: "tool_use", id: "tu_1", name: "emit_quiz_pack", input: { rounds: "[{" } }],
    });

    const err = await generateQuizPack("x").catch((e) => e);

    expect(create).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(UnusableModelOutputError);
    expect(err).not.toBeInstanceOf(IncompletePackError);
    expect(err.truncated).toBe(true);
  });
});

/**
 * GH3. ACC7's "All multiple choice, 4 rounds of 10": one pack came back as 40
 * TEXT questions, each with four good options, and the save kept the text
 * and threw the options away. A usable option set makes it multiple choice.
 */
describe("generateQuizPack — a usable option set is multiple choice (GH3)", () => {
  it("makes a TEXT question with a usable option set a multiple-choice question", async () => {
    modelRepliesInTurn(packWithFirst({ type: "TEXT", options: ["Rome", "Answer 1", " answer 1", "Paris", ""] }));

    const q = (await generateQuizPack("x")).pack.rounds[0].questions[0];

    expect(create).toHaveBeenCalledTimes(1);
    expect(q).toMatchObject({ type: "MULTIPLE_CHOICE", options: ["Rome", "Answer 1", "Paris"] });
  });
});

/**
 * GH5. The route has 300s. Generation used the SDK's 10-minute default per
 * attempt, two SDK retries and ACC8's second attempt, so a slow call could
 * outlive the function and lose everything, refunds included.
 */
describe("generateQuizPack — the time budget (GH5)", () => {
  it("bounds the call, SDK retries included, by the deadline it is given", async () => {
    modelRepliesInTurn(packWith([2], [2]));
    const before = Date.now();

    await generateQuizPack("x", undefined, { deadline: before + 100_000 });
    const opts = create.mock.calls[0][1] as { timeout: number; signal: AbortSignal };

    expect(opts.timeout).toBeGreaterThan(0);
    expect(opts.timeout).toBeLessThanOrEqual(100_000);
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends no deadline options when none is given, for the harness", async () => {
    modelRepliesInTurn(packWith([2], [2]));

    await generateQuizPack("x");

    expect(create.mock.calls[0][1]).toBeUndefined();
  });

  it("does not start the second attempt when there isn't time for it", async () => {
    modelRepliesInTurn(packWith([8, 8, 8], [1]), packWith([8, 8, 8], [8, 8, 8]));

    const err = await generateQuizPack("3 rounds of 8.", undefined, { deadline: Date.now() + 20_000 }).catch((e) => e);

    expect(create).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(IncompletePackError);
    expect(err.hostMessage).toMatch(/asked for 24 questions, got 1/);
  });

  it.each([
    ["the deadline's abort", () => new Anthropic.APIUserAbortError()],
    ["the SDK's own timeout", () => new Anthropic.APIConnectionTimeoutError()],
  ])("calls running out of time on %s a size problem, not a retryable glitch", async (_case, error) => {
    create.mockRejectedValueOnce(error());

    const err = await generateQuizPack("x", undefined, { deadline: Date.now() + 100_000 }).catch((e) => e);

    expect(err).toBeInstanceOf(UnusableModelOutputError);
    expect(err.truncated).toBe(true);
    expect(err.message).toMatch(/time/i);
  });

  it("gives up with the first attempt's own words when the second runs out of time", async () => {
    modelRepliesInTurn(packWith([8, 8, 8], [1]));
    create.mockRejectedValueOnce(new Anthropic.APIUserAbortError());

    const err = await generateQuizPack("3 rounds of 8.", undefined, { deadline: Date.now() + 200_000 }).catch((e) => e);

    expect(create).toHaveBeenCalledTimes(2);
    expect(err).toBeInstanceOf(IncompletePackError);
    expect(err.hostMessage).toMatch(/asked for 24 questions, got 1/);
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

/**
 * GH4. ACC7's three declines all came back as a refusal whose
 * stop_details.explanation was the API's note to integrators ("API
 * integrators: you can reduce refusals for your users by configuring a
 * fallback model — see https://platform.claude.com/..."), and that was the
 * reason shown to the host. Only the tool's own decline_reason is the
 * model's word to the quizmaster; a refusal or a prose turn gets the route's
 * own plain message, and what the API said is kept for the logs.
 */
const INTEGRATOR_NOTE =
  "API integrators: you can reduce refusals for your users by configuring a fallback model — see " +
  "https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback";

describe("generateQuizPack — a brief the model declines", () => {
  it("reads a refusal as a decline, which is the shape a blocked brief actually gets", async () => {
    modelDeclines({ stopReason: "refusal", explanation: INTEGRATOR_NOTE });

    await expect(generateQuizPack("something disallowed")).rejects.toBeInstanceOf(ModelDeclinedError);
  });

  it("never passes the API's refusal explanation on as the reason, and keeps it for the logs", async () => {
    modelDeclines({ stopReason: "refusal", explanation: INTEGRATOR_NOTE, text: ["Some other chatter."] });

    const err = await generateQuizPack("x").catch((e) => e);

    expect(err).toBeInstanceOf(ModelDeclinedError);
    expect(err.reason).toBe("");
    expect(err.detail).toContain("API integrators");
  });

  it("does not pass on an end_turn's prose as the reason either", async () => {
    modelDeclines({ stopReason: "end_turn", text: ["I'd rather not write that quiz.", "Try another topic."] });

    const err = await generateQuizPack("something odd").catch((e) => e);

    expect(err).toBeInstanceOf(ModelDeclinedError);
    expect(err.reason).toBe("");
    expect(err.detail).toBe("I'd rather not write that quiz. Try another topic.");
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
