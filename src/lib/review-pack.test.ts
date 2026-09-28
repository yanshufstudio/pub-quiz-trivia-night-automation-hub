import { beforeEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";

// Only the transport is stubbed; the prompts, the parsing and the verdict
// rules are the real ones.
const create = vi.fn();
let clientAvailable = true;
vi.mock("@/lib/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/anthropic")>();
  return {
    ...actual,
    getAnthropicClient: () => {
      if (!clientAvailable) throw new actual.MissingApiKeyError();
      return { messages: { create } };
    },
  };
});

import { applyVerdicts, reviewPack, ReviewFailedError, type ReviewerConfig } from "@/lib/review-pack";
import type { GeneratedPack } from "@/lib/quiz-schema";

type Request = Anthropic.MessageCreateParamsNonStreaming;

const BLIND: ReviewerConfig = { model: "claude-sonnet-5", thinking: "default", toolMode: "forced", mode: "blind" };
const SINGLE: ReviewerConfig = { ...BLIND, mode: "single" };

function nineties(): GeneratedPack {
  return {
    title: "Totally 90s",
    rounds: [
      {
        title: "Pop",
        category: "1990s pop music",
        questions: [
          { text: "Which British-Irish girl group had a hit with 'Wannabe' in 1996?", answer: "Spice Girls", points: 1, type: "TEXT" },
          { text: "Which US singer released the album 'Jagged Little Pill' in 1995?", answer: "Alanis Morissette", points: 1, type: "TEXT" },
          { text: "Who sang 'Believe' in 1998?", answer: "Cher", points: 1, type: "TEXT" },
        ],
      },
      {
        title: "Charts",
        category: "Charts",
        questions: [
          {
            text: "Which band released 'Wonderwall'?",
            answer: "Oasis",
            points: 1,
            type: "MULTIPLE_CHOICE",
            options: ["Blur", "Oasis", "Pulp"],
          },
        ],
      },
    ],
  };
}

function reply(name: string, input: unknown, extra: Record<string, unknown> = {}) {
  return {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: "tu", name, input }],
    usage: { input_tokens: 100, output_tokens: 50, output_tokens_details: { thinking_tokens: 20 } },
    ...extra,
  };
}

function blindChecks(checks: Record<string, Partial<{ answer: string; wording_issue: string; more_than_one_answer: boolean; not_a_question: boolean }>>) {
  return reply("emit_blind_check", {
    checks: Object.entries(checks).map(([id, c]) => ({
      id,
      answer: c.answer ?? "",
      more_than_one_answer: c.more_than_one_answer ?? false,
      wording_issue: c.wording_issue ?? "",
      not_a_question: c.not_a_question ?? false,
    })),
  });
}

beforeEach(() => {
  create.mockReset();
  clientAvailable = true;
});

describe("applyVerdicts", () => {
  it("keeps ok, applies a fix, removes a drop", () => {
    const out = applyVerdicts(nineties(), [
      { id: "R1Q1", verdict: "fix", reason: "English, not British-Irish", text: "Which English girl group had a hit with 'Wannabe' in 1996?" },
      { id: "R1Q2", verdict: "drop", reason: "Morissette is Canadian" },
      { id: "R1Q3", verdict: "ok", reason: "" },
      { id: "R2Q1", verdict: "ok", reason: "" },
    ]);

    expect(out.pack.rounds[0].questions.map((q) => q.text)).toEqual([
      "Which English girl group had a hit with 'Wannabe' in 1996?",
      "Who sang 'Believe' in 1998?",
    ]);
    expect(out.fixed).toEqual([
      expect.objectContaining({ id: "R1Q1", after: { text: "Which English girl group had a hit with 'Wannabe' in 1996?", answer: "Spice Girls" } }),
    ]);
    expect(out.dropped.map((d) => d.id)).toEqual(["R1Q2"]);
    expect(out.complete).toBe(true);
  });

  it("keeps a multiple-choice fix valid: the answer is one of the options", () => {
    const out = applyVerdicts(nineties(), [
      { id: "R2Q1", verdict: "fix", reason: "new options", answer: "Oasis", options: ["Oasis", "Suede", "Elastica"] },
    ]);
    const q = out.pack.rounds[1].questions[0];

    expect(q).toMatchObject({ type: "MULTIPLE_CHOICE", answer: "Oasis", options: ["Oasis", "Suede", "Elastica"] });
  });

  it("falls back to free text when a fix leaves the answer out of the options", () => {
    const out = applyVerdicts(nineties(), [
      { id: "R2Q1", verdict: "fix", reason: "answer changed", answer: "Oasis (band)", options: ["Blur", "Pulp"] },
    ]);
    const q = out.pack.rounds[1].questions[0];

    expect(q.type).toBe("TEXT");
    expect(q.options).toBeUndefined();
    expect(q.answer).toBe("Oasis (band)");
  });

  it("treats a fix that corrects nothing as a drop, since the checker said it was wrong", () => {
    const out = applyVerdicts(nineties(), [{ id: "R1Q3", verdict: "fix", reason: "wrong year" }]);

    expect(out.dropped).toEqual([expect.objectContaining({ id: "R1Q3" })]);
    expect(out.fixed).toEqual([]);
  });

  it("treats a multiple-choice fix that returns the same options as a drop too", () => {
    const out = applyVerdicts(nineties(), [
      { id: "R2Q1", verdict: "fix", reason: "wrong band", options: ["Blur", "Oasis", "Pulp"] },
    ]);

    expect(out.dropped).toEqual([expect.objectContaining({ id: "R2Q1" })]);
    expect(out.fixed).toEqual([]);
  });

  it("removes a round left empty", () => {
    const out = applyVerdicts(nineties(), [{ id: "R2Q1", verdict: "drop", reason: "ambiguous" }]);

    expect(out.pack.rounds.map((r) => r.title)).toEqual(["Pop"]);
  });

  it("keeps a question with no verdict, and says the review was incomplete", () => {
    const out = applyVerdicts(nineties(), [{ id: "R1Q1", verdict: "ok", reason: "" }]);

    expect(out.pack.rounds[0].questions).toHaveLength(3);
    expect(out.unreviewed).toEqual(["R1Q2", "R1Q3", "R2Q1"]);
    expect(out.complete).toBe(false);
  });
});

describe("reviewPack — production's checker", () => {
  // ACC5, Paul's pick: C2 caught 73-94% of the errors G1/G1b/G2 left in,
  // against 27-60% for Sonnet 5. Opus 5.5 refuses forced tool choice.
  it("is Opus 5.5 at low effort, blind, asked with auto tool choice and a strict tool", async () => {
    create.mockResolvedValueOnce(
      blindChecks({ R1Q1: { answer: "Spice Girls" }, R1Q2: { answer: "Alanis Morissette" }, R1Q3: { answer: "Cher" }, R2Q1: { answer: "Oasis" } })
    );

    await reviewPack(nineties());
    const req = create.mock.calls[0][0] as Request;

    expect(req.model).toBe("claude-opus-5-5");
    expect(req.output_config).toEqual({ effort: "low" });
    expect(req).not.toHaveProperty("thinking");
    expect(req.tool_choice).toEqual({ type: "auto" });
    expect(req.tools?.[0]).toMatchObject({ name: "emit_blind_check", strict: true });
  });
});

describe("reviewPack — blind", () => {
  it("never shows the checker our answers in the blind pass", async () => {
    create.mockResolvedValueOnce(
      blindChecks({ R1Q1: { answer: "Spice Girls" }, R1Q2: { answer: "Alanis Morissette" }, R1Q3: { answer: "Cher" }, R2Q1: { answer: "Oasis" } })
    );

    await reviewPack(nineties(), BLIND);
    const sent = (create.mock.calls[0][0] as Request).messages[0].content as string;

    expect(sent).toContain("Wannabe");
    expect(sent).not.toContain("Spice Girls");
    expect(sent).not.toContain("setter_answer");
    // The options are the question; they go, unmarked.
    expect(sent).toContain('"options":["Blur","Oasis","Pulp"]');
  });

  it("stops after one call when every independent answer agrees and nothing is flagged", async () => {
    create.mockResolvedValueOnce(
      blindChecks({ R1Q1: { answer: "The Spice Girls" }, R1Q2: { answer: "alanis morissette" }, R1Q3: { answer: "Cher" }, R2Q1: { answer: "Oasis" } })
    );

    const out = await reviewPack(nineties(), BLIND);

    expect(create).toHaveBeenCalledTimes(1);
    expect(out.complete).toBe(true);
    expect(out.fixed).toEqual([]);
    expect(out.usage).toHaveLength(1);
  });

  it("sends only flagged questions to the verdict call, with both answers", async () => {
    create
      .mockResolvedValueOnce(
        blindChecks({
          R1Q1: { answer: "Spice Girls", wording_issue: "'British-Irish': they were English" },
          R1Q2: { answer: "Alanis Morissette", wording_issue: "'US singer': she is Canadian" },
          R1Q3: { answer: "Cher" },
          R2Q1: { answer: "Oasis" },
        })
      )
      .mockResolvedValueOnce(
        reply("emit_review", {
          reviews: [
            { id: "R1Q1", verdict: "fix", reason: "English", text: "Which English girl group had a hit with 'Wannabe' in 1996?" },
            { id: "R1Q2", verdict: "fix", reason: "Canadian", text: "Which Canadian singer released the album 'Jagged Little Pill' in 1995?" },
          ],
        })
      );

    const out = await reviewPack(nineties(), BLIND);
    const second = JSON.parse((create.mock.calls[1][0] as Request).messages[0].content as string) as { id: string; setter_answer: string; checker_answer: string }[];

    expect(second.map((q) => q.id)).toEqual(["R1Q1", "R1Q2"]);
    expect(second[0]).toMatchObject({ setter_answer: "Spice Girls", checker_answer: "Spice Girls" });
    expect(out.fixed.map((f) => f.id)).toEqual(["R1Q1", "R1Q2"]);
    expect(out.pack.rounds[0].questions[1].text).toMatch(/Canadian singer/);
    expect(out.complete).toBe(true);
    expect(out.usage).toHaveLength(2);
  });

  it("drops a refusal that was written as a question", async () => {
    const pack = nineties();
    pack.rounds[0].questions[2] = { text: "I'm sorry, I can't write questions about that topic.", answer: "N/A", points: 1, type: "TEXT" };
    create
      .mockResolvedValueOnce(
        blindChecks({ R1Q1: { answer: "Spice Girls" }, R1Q2: { answer: "Alanis Morissette" }, R1Q3: { answer: "", not_a_question: true }, R2Q1: { answer: "Oasis" } })
      )
      .mockResolvedValueOnce(reply("emit_review", { reviews: [{ id: "R1Q3", verdict: "drop", reason: "an apology, not a question" }] }));

    const out = await reviewPack(pack, BLIND);

    expect(out.dropped.map((d) => d.id)).toEqual(["R1Q3"]);
    expect(out.pack.rounds[0].questions.map((q) => q.text).join()).not.toMatch(/sorry/i);
  });

  it("carries a Hebrew pack through intact, and applies a Hebrew fix", async () => {
    const pack: GeneratedPack = {
      title: "חידון",
      rounds: [
        {
          title: "היסטוריה",
          category: "היסטוריה של ישראל",
          questions: [
            { text: "באיזו שנה הוכרזה מדינת ישראל?", answer: "1948", points: 1, type: "TEXT" },
            { text: "מי היה ראש הממשלה הראשון של ישראל?", answer: "דוד בן-גוריון", points: 1, type: "TEXT" },
          ],
        },
      ],
    };
    create
      .mockResolvedValueOnce(blindChecks({ R1Q1: { answer: "1948" }, R1Q2: { answer: "דוד בן-גוריון", wording_issue: "בדיקה" } }))
      .mockResolvedValueOnce(
        reply("emit_review", { reviews: [{ id: "R1Q2", verdict: "fix", reason: "ניסוח", text: "מי היה ראש הממשלה הראשון של מדינת ישראל?" }] })
      );

    const out = await reviewPack(pack, BLIND);

    // Hebrew survives the comparison (the old ASCII-only normaliser matched
    // every Hebrew answer to every other), and a flagged wording still goes on
    // to a verdict even when the answers agree.
    expect(out.blindAnswers.R1Q1.agreed).toBe(true);
    expect(out.blindAnswers.R1Q2).toMatchObject({ agreed: true, flags: ["wording: בדיקה"] });
    expect(out.pack.title).toBe("חידון");
    expect(out.pack.rounds[0].questions[0].text).toBe("באיזו שנה הוכרזה מדינת ישראל?");
    expect(out.pack.rounds[0].questions[1]).toMatchObject({ text: "מי היה ראש הממשלה הראשון של מדינת ישראל?", answer: "דוד בן-גוריון" });
  });
});

describe("reviewPack — request options", () => {
  // The SDK rejects `timeout: undefined` and a fractional timeout before
  // sending anything, which made every harness review fail. The stubbed
  // transport used to ignore this argument, so nothing noticed.
  it("sends no timeout when none is given, and a whole number when one is", async () => {
    const allAgree = blindChecks({ R1Q1: { answer: "Spice Girls" }, R1Q2: { answer: "Alanis Morissette" }, R1Q3: { answer: "Cher" }, R2Q1: { answer: "Oasis" } });
    create.mockResolvedValue(allAgree);

    await reviewPack(nineties(), BLIND);
    await reviewPack(nineties(), BLIND, { timeoutMs: 12_345.6 });

    expect(create.mock.calls[0][1]).toEqual({ maxRetries: 1 });
    expect(create.mock.calls[1][1]).toEqual({ maxRetries: 1, timeout: 12_345 });
  });
});

describe("reviewPack — single", () => {
  it("is one call that sees the answers", async () => {
    create.mockResolvedValueOnce(
      reply("emit_review", {
        reviews: ["R1Q1", "R1Q2", "R1Q3", "R2Q1"].map((id) => ({ id, verdict: "ok", reason: "" })),
      })
    );

    const out = await reviewPack(nineties(), SINGLE);
    const sent = (create.mock.calls[0][0] as Request).messages[0].content as string;

    expect(create).toHaveBeenCalledTimes(1);
    expect(sent).toContain('"setter_answer":"Spice Girls"');
    expect(out.complete).toBe(true);
  });
});

describe("reviewPack — failures are ReviewFailedError, never a thrown pack", () => {
  async function failureKind(): Promise<string> {
    const err = await reviewPack(nineties(), BLIND).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ReviewFailedError);
    return (err as ReviewFailedError).kind;
  }

  it("a timeout", async () => {
    create.mockRejectedValue(new Anthropic.APIConnectionTimeoutError());
    expect(await failureKind()).toBe("timeout");
  });

  it("a 429 or 5xx", async () => {
    create.mockRejectedValue(new Anthropic.APIError(529, { type: "error" }, "overloaded", undefined));
    expect(await failureKind()).toBe("api_error");
  });

  it("an exhausted account", async () => {
    create.mockRejectedValue(
      new Anthropic.APIError(400, { error: { type: "invalid_request_error", message: "Your credit balance is too low" } }, "400", undefined)
    );
    expect(await failureKind()).toBe("credit_exhausted");
  });

  it("no API key", async () => {
    clientAvailable = false;
    expect(await failureKind()).toBe("not_configured");
  });

  it("a refusal", async () => {
    create.mockResolvedValue({ stop_reason: "refusal", content: [], usage: { input_tokens: 1, output_tokens: 0 } });
    expect(await failureKind()).toBe("declined");
  });

  it("no tool call", async () => {
    create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "Looks fine." }], usage: { input_tokens: 1, output_tokens: 1 } });
    expect(await failureKind()).toBe("unusable_output");
  });

  it("a cut-off review", async () => {
    create.mockResolvedValue({ ...blindChecks({}), stop_reason: "max_tokens" });
    expect(await failureKind()).toBe("unusable_output");
  });

  it("a review that drops everything", async () => {
    create
      .mockResolvedValueOnce(blindChecks({ R1Q1: { answer: "x" }, R1Q2: { answer: "x" }, R1Q3: { answer: "x" }, R2Q1: { answer: "Blur" } }))
      .mockResolvedValueOnce(
        reply("emit_review", { reviews: ["R1Q1", "R1Q2", "R1Q3", "R2Q1"].map((id) => ({ id, verdict: "drop", reason: "" })) })
      );
    expect(await failureKind()).toBe("nothing_left");
  });
});
