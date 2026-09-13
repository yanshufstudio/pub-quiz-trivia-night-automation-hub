import { describe, expect, it } from "vitest";
import { computeNextPosition, getCurrentQuestion, type PackWithRounds } from "@/lib/session-state";

function question(index: number) {
  return {
    id: `q${index}`,
    roundId: "r",
    index,
    text: `Q${index}`,
    answer: `A${index}`,
    points: 1,
    type: "TEXT",
    options: null,
    acceptableAnswers: null,
    media: null,
  };
}

function round(index: number, questionCount: number) {
  return {
    id: `r${index}`,
    packId: "p",
    index,
    title: `Round ${index}`,
    category: "General",
    questions: Array.from({ length: questionCount }, (_, i) => question(i)),
  };
}

const pack: PackWithRounds = {
  id: "p",
  title: "Test Pack",
  prompt: "",
  createdAt: new Date(),
  creatorId: null,
  rounds: [round(0, 2), round(1, 1)],
};

describe("getCurrentQuestion", () => {
  it("returns the question at the given position", () => {
    expect(getCurrentQuestion(pack, 0, 1)?.text).toBe("Q1");
  });

  it("returns null past the end", () => {
    expect(getCurrentQuestion(pack, 5, 0)).toBeNull();
  });
});

describe("computeNextPosition", () => {
  it("advances within a round", () => {
    expect(computeNextPosition(pack, 0, 0)).toEqual({ roundIndex: 0, questionIndex: 1 });
  });

  it("rolls over into the next round", () => {
    expect(computeNextPosition(pack, 0, 1)).toEqual({ roundIndex: 1, questionIndex: 0 });
  });

  it("returns null after the last question of the last round", () => {
    expect(computeNextPosition(pack, 1, 0)).toBeNull();
  });
});
