import { describe, expect, it } from "vitest";
import { computeScoreboard } from "@/lib/scoreboard";
import type { Answer, Team } from "@prisma/client";

function team(id: string, name: string): Team {
  return { id, name, sessionId: "s1", token: `tok-${id}`, createdAt: new Date() };
}

function answer(teamId: string, points: number, roundIndex = 0, questionIndex = 0): Answer {
  return {
    id: `a-${teamId}-${points}-${Math.random()}`,
    sessionId: "s1",
    teamId,
    roundIndex,
    questionIndex,
    text: "x",
    isCorrect: points > 0,
    pointsAwarded: points,
    submittedAt: new Date(),
  };
}

/** Nothing in play — every answer in the fixture is at an earlier question
 * than this, so these cases read as "count everything". */
const NOTHING_IN_PLAY = { roundIndex: 99, questionIndex: 99, revealed: false };

describe("computeScoreboard", () => {
  it("sums points per team and sorts descending", () => {
    const teams = [team("t1", "Alpha"), team("t2", "Beta")];
    const answers = [answer("t1", 1), answer("t1", 2), answer("t2", 5)];

    const board = computeScoreboard(teams, answers, NOTHING_IN_PLAY);

    expect(board).toEqual([
      { teamId: "t2", name: "Beta", score: 5 },
      { teamId: "t1", name: "Alpha", score: 3 },
    ]);
  });

  it("includes teams with zero answers", () => {
    const teams = [team("t1", "Alpha")];
    const board = computeScoreboard(teams, [], NOTHING_IN_PLAY);
    expect(board).toEqual([{ teamId: "t1", name: "Alpha", score: 0 }]);
  });
});

// The scoreboard was an answer oracle: a team submits, polls, and reads
// whether it scored off its own running total, all while the question is
// still open and the answer still secret.
describe("computeScoreboard withholds the question in play", () => {
  const teams = [team("t1", "Alpha"), team("t2", "Beta")];
  const inPlay = { roundIndex: 1, questionIndex: 3 };

  it("does not count a correct answer to the open question", () => {
    const answers = [answer("t1", 1, 1, 3)];
    const board = computeScoreboard(teams, answers, { ...inPlay, revealed: false });
    expect(board.find((r) => r.teamId === "t1")!.score).toBe(0);
  });

  it("counts it once the question is revealed", () => {
    const answers = [answer("t1", 1, 1, 3)];
    const board = computeScoreboard(teams, answers, { ...inPlay, revealed: true });
    expect(board.find((r) => r.teamId === "t1")!.score).toBe(1);
  });

  it("keeps counting every earlier question while the open one is hidden", () => {
    const answers = [
      answer("t1", 2, 0, 0),
      answer("t1", 3, 1, 2),
      // The open question: worth 5, and must not show up yet.
      answer("t1", 5, 1, 3),
    ];
    const board = computeScoreboard(teams, answers, { ...inPlay, revealed: false });
    expect(board.find((r) => r.teamId === "t1")!.score).toBe(5);

    const revealed = computeScoreboard(teams, answers, { ...inPlay, revealed: true });
    expect(revealed.find((r) => r.teamId === "t1")!.score).toBe(10);
  });

  it("hides the open question from every team, not just the one that answered", () => {
    const answers = [answer("t1", 4, 1, 3), answer("t2", 4, 1, 3)];
    const board = computeScoreboard(teams, answers, { ...inPlay, revealed: false });
    expect(board.map((r) => r.score)).toEqual([0, 0]);
  });
});
