import { describe, expect, it } from "vitest";
import {
  generatedPackSchema,
  generatedQuestionSchema,
  salvageGeneratedPack,
  wizardRequestSchema,
} from "@/lib/quiz-schema";

describe("wizardRequestSchema", () => {
  it("rejects an empty prompt", () => {
    expect(wizardRequestSchema.safeParse({ prompt: "" }).success).toBe(false);
  });

  it("rejects a whitespace-only prompt", () => {
    // Regression: .min(1) alone passes on "   " (length 3), and the
    // wizard would spend a real Anthropic API call generating from
    // nothing. Trimming before the length check is what makes this fail.
    expect(wizardRequestSchema.safeParse({ prompt: "   \n\t  " }).success).toBe(false);
  });

  it("trims leading/trailing whitespace from an otherwise-valid prompt", () => {
    const result = wizardRequestSchema.safeParse({ prompt: "  Four rounds of trivia  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.prompt).toBe("Four rounds of trivia");
  });

  it("accepts exactly 2000 characters", () => {
    expect(wizardRequestSchema.safeParse({ prompt: "a".repeat(2000) }).success).toBe(true);
  });

  it("rejects 2001 characters", () => {
    expect(wizardRequestSchema.safeParse({ prompt: "a".repeat(2001) }).success).toBe(false);
  });

  it("rejects a missing prompt field", () => {
    expect(wizardRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("generatedQuestionSchema", () => {
  it("defaults to type TEXT when omitted, requiring no options", () => {
    const result = generatedQuestionSchema.safeParse({ text: "Q?", answer: "A" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.type).toBe("TEXT");
  });

  it("accepts a well-formed multiple-choice question", () => {
    const result = generatedQuestionSchema.safeParse({
      text: "Capital of Australia?",
      answer: "Canberra",
      type: "MULTIPLE_CHOICE",
      options: ["Sydney", "Canberra", "Melbourne"],
    });
    expect(result.success).toBe(true);
  });

  // A multiple-choice question with a broken option set is still a usable
  // question: the answer is known, so it degrades to free-text instead of
  // sinking the whole generated pack. (Observed in production: one such
  // question made every "1990s pop music" prompt 502 deterministically.)
  it("falls back to TEXT for multiple-choice with fewer than 2 options", () => {
    const result = generatedQuestionSchema.safeParse({
      text: "Q?",
      answer: "A",
      type: "MULTIPLE_CHOICE",
      options: ["A"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("TEXT");
      expect(result.data.options).toBeUndefined();
      expect(result.data.answer).toBe("A");
    }
  });

  it("falls back to TEXT for multiple-choice whose options don't include the answer", () => {
    const result = generatedQuestionSchema.safeParse({
      text: "Q?",
      answer: "A",
      type: "MULTIPLE_CHOICE",
      options: ["B", "C"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("TEXT");
      expect(result.data.options).toBeUndefined();
    }
  });

  it("falls back to TEXT for multiple-choice with no options at all", () => {
    const result = generatedQuestionSchema.safeParse({ text: "Q?", answer: "A", type: "MULTIPLE_CHOICE" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.type).toBe("TEXT");
  });

  it("keeps a well-formed multiple-choice question whose answer has stray whitespace", () => {
    const result = generatedQuestionSchema.safeParse({
      text: "Which band released Nevermind?",
      answer: "Nirvana ",
      type: "MULTIPLE_CHOICE",
      options: ["Nirvana", "Oasis", "Blur"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("MULTIPLE_CHOICE");
      expect(result.data.options).toEqual(["Nirvana", "Oasis", "Blur"]);
    }
  });
});

describe("generatedPackSchema", () => {
  it("keeps the rest of the pack when one question's option set is malformed", () => {
    const result = generatedPackSchema.safeParse({
      title: "Pack",
      rounds: [
        {
          title: "Music",
          category: "Music",
          questions: [
            { text: "Q1?", answer: "A1" },
            { text: "Q2?", answer: "A2", type: "MULTIPLE_CHOICE", options: ["B", "C"] },
            { text: "Q3?", answer: "A3", type: "MULTIPLE_CHOICE", options: ["A3", "X"] },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const types = result.data.rounds[0].questions.map((q) => q.type);
      expect(types).toEqual(["TEXT", "TEXT", "MULTIPLE_CHOICE"]);
    }
  });

  // Observed in production 2026-09-08: roughly two in five generations
  // (default four-round brief and one-round prompts alike) arrived without
  // the top-level `title`, and the whole pack was rejected with a 502 for
  // a field that is purely cosmetic. Derive one from the rounds instead.
  it("derives a title from the round titles when the model omits it", () => {
    const result = generatedPackSchema.safeParse({
      rounds: [
        { title: "90s Music", category: "Music", questions: [{ text: "Q?", answer: "A" }] },
        { title: "UK Geography", category: "Geography", questions: [{ text: "Q?", answer: "A" }] },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe("90s Music · UK Geography");
  });

  it("derives a title when the model sends an empty one", () => {
    const result = generatedPackSchema.safeParse({
      title: "   ",
      rounds: [{ title: "Rivers", category: "Geography", questions: [{ text: "Q?", answer: "A" }] }],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe("Rivers");
  });

  it("keeps a title the model did provide", () => {
    const result = generatedPackSchema.safeParse({
      title: "Friday Night Lights",
      rounds: [{ title: "Rivers", category: "Geography", questions: [{ text: "Q?", answer: "A" }] }],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe("Friday Night Lights");
  });
});

describe("salvageGeneratedPack", () => {
  const goodQuestion = (n: number) => ({ text: `Q${n}?`, answer: `A${n}`, points: 1 });

  // The truncation shape: the model hit max_tokens part-way through the last
  // question, so it arrives with an empty answer. Strict parsing throws away
  // all 3 usable questions with it; salvaging keeps them.
  it("keeps the complete questions when the response is cut off mid-question", () => {
    const truncated = {
      title: "Friday Night",
      rounds: [
        {
          title: "Rivers",
          category: "Geography",
          questions: [goodQuestion(1), goodQuestion(2), goodQuestion(3), { text: "Which river runs thro", answer: "" }],
        },
      ],
    };

    expect(generatedPackSchema.safeParse(truncated).success).toBe(false);

    const salvaged = salvageGeneratedPack(truncated);
    expect(salvaged).not.toBeNull();
    expect(salvaged!.pack.rounds).toHaveLength(1);
    expect(salvaged!.pack.rounds[0].questions.map((q) => q.answer)).toEqual(["A1", "A2", "A3"]);
    expect(salvaged!.droppedQuestions).toBe(1);
    expect(salvaged!.droppedRounds).toBe(0);
  });

  it("drops a round left with no usable questions and keeps the rest", () => {
    const salvaged = salvageGeneratedPack({
      rounds: [
        { title: "Rivers", category: "Geography", questions: [goodQuestion(1)] },
        { title: "Cut off here", category: "Music", questions: [{ text: "Half a quest" }] },
      ],
    });

    expect(salvaged).not.toBeNull();
    expect(salvaged!.pack.rounds.map((r) => r.title)).toEqual(["Rivers"]);
    expect(salvaged!.droppedQuestions).toBe(1);
    expect(salvaged!.droppedRounds).toBe(1);
  });

  it("fills in a missing round title and category rather than dropping the round", () => {
    const salvaged = salvageGeneratedPack({ rounds: [{ questions: [goodQuestion(1)] }] });

    expect(salvaged).not.toBeNull();
    expect(salvaged!.pack.rounds[0].title).toBe("Round 1");
    expect(salvaged!.pack.rounds[0].category).toBe("Round 1");
    expect(salvaged!.droppedRounds).toBe(0);
  });

  it("derives a pack title from the surviving rounds, same as strict parsing", () => {
    const salvaged = salvageGeneratedPack({
      rounds: [
        { title: "Rivers", category: "Geography", questions: [goodQuestion(1)] },
        { title: "Britpop", category: "Music", questions: [goodQuestion(2)] },
      ],
    });

    expect(salvaged!.pack.title).toBe("Rivers · Britpop");
  });

  it("still degrades a broken multiple-choice question to TEXT instead of dropping it", () => {
    const salvaged = salvageGeneratedPack({
      rounds: [
        {
          title: "Music",
          category: "Music",
          questions: [{ text: "Which band?", answer: "Nirvana", type: "MULTIPLE_CHOICE", options: ["Nirvana"] }],
        },
      ],
    });

    expect(salvaged!.droppedQuestions).toBe(0);
    expect(salvaged!.pack.rounds[0].questions[0].type).toBe("TEXT");
  });

  // The one case the caller must still fail on — there is no pack here to
  // hand a quizmaster, so a salvaged "empty" pack would be worse than an error.
  it("returns null when nothing is recoverable", () => {
    expect(salvageGeneratedPack({})).toBeNull();
    expect(salvageGeneratedPack({ rounds: [] })).toBeNull();
    expect(salvageGeneratedPack({ rounds: [{ title: "R", category: "C", questions: [] }] })).toBeNull();
    expect(salvageGeneratedPack(null)).toBeNull();
    expect(salvageGeneratedPack("nope")).toBeNull();
  });
});
