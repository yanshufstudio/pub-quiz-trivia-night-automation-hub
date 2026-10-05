import { describe, expect, it } from "vitest";
import { computeRoundScoreboard, countedRounds, roundTotals } from "@/lib/round-scoreboard";

const teams = [
  { id: "phone", name: "Phones", isPaper: false },
  { id: "paper", name: "Paper", isPaper: true },
];

const answers = [
  { teamId: "phone", roundIndex: 0, pointsAwarded: 1 },
  { teamId: "phone", roundIndex: 0, pointsAwarded: 1 },
  { teamId: "phone", roundIndex: 1, pointsAwarded: 2 },
];

describe("round totals (RM3)", () => {
  it("adds up a team's marks for the round", () => {
    expect(roundTotals(teams, answers, [], 0)).toEqual([
      { teamId: "phone", name: "Phones", isPaper: false, auto: 2, typed: null, total: 2 },
      { teamId: "paper", name: "Paper", isPaper: true, auto: 0, typed: null, total: 0 },
    ]);
  });

  it("a typed total replaces the auto total for that team and round", () => {
    const typed = [
      { teamId: "phone", roundIndex: 0, points: 3 },
      { teamId: "paper", roundIndex: 0, points: 5 },
    ];
    const rows = roundTotals(teams, answers, typed, 0);
    expect(rows[0]).toMatchObject({ auto: 2, typed: 3, total: 3 });
    expect(rows[1]).toMatchObject({ auto: 0, typed: 5, total: 5 });
  });

  it("a typed total for another round does not touch this one", () => {
    const rows = roundTotals(teams, answers, [{ teamId: "phone", roundIndex: 1, points: 9 }], 0);
    expect(rows[0]).toMatchObject({ typed: null, total: 2 });
  });
});

describe("the scoreboard sums round totals over the rounds that count", () => {
  const typed = [{ teamId: "paper", roundIndex: 0, points: 3 }];

  it("counts nothing before the first round is fully revealed", () => {
    expect(computeRoundScoreboard(teams, answers, typed, 0).map((r) => r.score)).toEqual([0, 0]);
  });

  it("counts the rounds given, highest first", () => {
    expect(computeRoundScoreboard(teams, answers, typed, 1)).toEqual([
      { teamId: "paper", name: "Paper", score: 3 },
      { teamId: "phone", name: "Phones", score: 2 },
    ]);
    expect(computeRoundScoreboard(teams, answers, typed, 2)).toEqual([
      { teamId: "phone", name: "Phones", score: 4 },
      { teamId: "paper", name: "Paper", score: 3 },
    ]);
  });

  it("clearing a typed total brings the auto total back", () => {
    const withTyped = computeRoundScoreboard(teams, answers, [{ teamId: "phone", roundIndex: 0, points: 0 }], 1);
    expect(withTyped.find((r) => r.teamId === "phone")!.score).toBe(0);
    const cleared = computeRoundScoreboard(teams, answers, [], 1);
    expect(cleared.find((r) => r.teamId === "phone")!.score).toBe(2);
  });
});

describe("which rounds count", () => {
  const S = (status: string, currentRoundIndex: number, revealedCount: number) => ({
    status,
    currentRoundIndex,
    revealedCount,
  });

  it("a round counts only once every answer in it is revealed", () => {
    const lengths = [3, 2];
    expect(countedRounds(S("LOBBY", 0, 0), lengths)).toBe(0);
    expect(countedRounds(S("ROUND_OPEN", 0, 0), lengths)).toBe(0);
    expect(countedRounds(S("ROUND_MARKING", 0, 0), lengths)).toBe(0);
    expect(countedRounds(S("ROUND_REVEAL", 0, 2), lengths)).toBe(0);
    expect(countedRounds(S("ROUND_REVEAL", 0, 3), lengths)).toBe(1);
    expect(countedRounds(S("ROUND_OPEN", 1, 0), lengths)).toBe(1);
    expect(countedRounds(S("ROUND_REVEAL", 1, 2), lengths)).toBe(2);
    expect(countedRounds(S("ENDED", 1, 2), lengths)).toBe(2);
  });

  it("a game ended mid-round counts the rounds that were finished, not the one in progress", () => {
    expect(countedRounds(S("ENDED", 1, 0), [3, 2])).toBe(1);
  });
});
