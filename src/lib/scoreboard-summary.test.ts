import { describe, expect, it } from "vitest";
import { rankOf, topScorers, winningNames } from "@/lib/scoreboard-summary";

function row(teamId: string, name: string, score: number) {
  return { teamId, name, score };
}

describe("topScorers", () => {
  it("picks the single leader when there's no tie", () => {
    const board = [row("1", "Quiz Pigs", 5), row("2", "Trivia Titans", 3)];
    expect(topScorers(board)).toEqual({ winners: [row("1", "Quiz Pigs", 5)], topScore: 5 });
  });

  it("returns every team tied for first", () => {
    const board = [row("1", "Quiz Pigs", 5), row("2", "Trivia Titans", 5), row("3", "Last Place", 1)];
    const { winners, topScore } = topScorers(board);
    expect(topScore).toBe(5);
    expect(winners.map((w) => w.teamId)).toEqual(["1", "2"]);
  });

  it("handles an empty scoreboard", () => {
    expect(topScorers([])).toEqual({ winners: [], topScore: 0 });
  });
});

describe("winningNames", () => {
  it("formats a single winner", () => {
    expect(winningNames([row("1", "Quiz Pigs", 5)])).toBe("Quiz Pigs");
  });

  it("formats two winners with an ampersand, no comma", () => {
    expect(winningNames([row("1", "Quiz Pigs", 5), row("2", "Trivia Titans", 5)])).toBe(
      "Quiz Pigs & Trivia Titans"
    );
  });

  it("formats three or more with a serial comma before the final ampersand", () => {
    expect(
      winningNames([row("1", "A", 5), row("2", "B", 5), row("3", "C", 5)])
    ).toBe("A, B & C");
  });

  it("falls back to a plain message when nobody played", () => {
    expect(winningNames([])).toBe("No teams played");
  });
});

describe("rankOf", () => {
  const board = [row("a", "A", 32), row("b", "B", 32), row("c", "C", 32), row("d", "D", 10), row("e", "E", 0)];

  it("gives every team tied for a place the same rank", () => {
    expect(rankOf(board, "a")).toBe(1);
    expect(rankOf(board, "b")).toBe(1);
    expect(rankOf(board, "c")).toBe(1);
  });

  it("skips the places a tie occupies (1, 1, 1, 4, 5)", () => {
    expect(rankOf(board, "d")).toBe(4);
    expect(rankOf(board, "e")).toBe(5);
  });

  it("returns null for a team that is not on the board", () => {
    expect(rankOf(board, "zzz")).toBeNull();
  });
});
