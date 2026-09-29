import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { PATCH as overrideAnswer } from "@/app/api/sessions/[code]/answers/[answerId]/route";
import { db } from "@/lib/db";
import { signInTestHost } from "./auth-fixture";
import { ROUND_ANSWERS, roundGame } from "./round-fixture";

const host = await signInTestHost();
const game = roundGame(host);

afterAll(async () => {
  await db.$disconnect();
});

async function openRound() {
  const { code, hostToken, packId } = await game.create();
  const team = await game.join(code, `Team ${Math.random().toString(36).slice(2, 8)}`);
  await game.advance(code, hostToken, "start");
  return { code, hostToken, packId, team };
}

async function answerRow(code: string, token: string, questionIndex: number) {
  const team = await db.team.findUniqueOrThrow({ where: { token } });
  return db.answer.findUnique({
    where: { teamId_roundIndex_questionIndex: { teamId: team.id, roundIndex: 0, questionIndex } },
  });
}

describe("answering in round mode (RM2)", () => {
  it("accepts an answer to an asked question and refuses one to a question not yet asked", async () => {
    const { code, team } = await openRound();
    expect((await game.answer(code, team, 0, "Canberra")).status).toBe(201);
    expect((await game.answer(code, team, 1, "Seven")).status).toBe(409);
    expect(await answerRow(code, team, 1)).toBeNull();
  });

  it("needs to know which question the answer is for", async () => {
    const { code, team } = await openRound();
    const res = await game.request(`/api/sessions/${code}/answers`, "POST", { token: team, text: "Canberra" }, false);
    const { POST } = await import("@/app/api/sessions/[code]/answers/route");
    expect((await POST(res, { params: Promise.resolve({ code }) })).status).toBe(400);
  });

  it("lets a team answer any asked question, in any order, and change its mind until the round closes", async () => {
    const { code, hostToken, team } = await openRound();
    await game.advance(code, hostToken, "ask_next");
    await game.advance(code, hostToken, "ask_next");
    expect((await game.answer(code, team, 2, "Mars")).status).toBe(201);
    expect((await game.answer(code, team, 0, "Sydney")).status).toBe(201);
    expect((await game.answer(code, team, 0, "Canberra")).status).toBe(201);
    expect((await answerRow(code, team, 0))!.text).toBe("Canberra");
    expect(await db.answer.count({ where: { team: { token: team } } })).toBe(2);
  });

  it("locks every answer once the round is closed", async () => {
    const { code, hostToken, team } = await openRound();
    await game.answer(code, team, 0, "Canberra");
    await game.advance(code, hostToken, "ask_next");
    await game.advance(code, hostToken, "ask_next");
    await game.advance(code, hostToken, "close_round");
    expect((await game.answer(code, team, 0, "Sydney")).status).toBe(409);
    expect((await game.answer(code, team, 1, "Seven")).status).toBe(409);
    expect((await answerRow(code, team, 0))!.text).toBe("Canberra");
  });

  it("a team that joins mid-round can answer every question already asked", async () => {
    const { code, hostToken } = await openRound();
    await game.advance(code, hostToken, "ask_next");
    const late = await game.join(code, "Late Arrivals");
    expect((await game.answer(code, late, 0, "Canberra")).status).toBe(201);
    expect((await game.answer(code, late, 1, "Seven")).status).toBe(201);
  });

  it("the change allowance is per question", async () => {
    const { code, hostToken, team } = await openRound();
    await game.advance(code, hostToken, "ask_next");
    for (let i = 0; i < 5; i++) expect((await game.answer(code, team, 0, `Try ${i}`)).status).toBe(201);
    expect((await game.answer(code, team, 0, "One too many")).status).toBe(429);
    expect((await game.answer(code, team, 1, "Seven")).status).toBe(201);
  });

  it("a paper team cannot answer from a phone", async () => {
    const { code } = await openRound();
    const session = await db.session.findUniqueOrThrow({ where: { code } });
    const paper = await db.team.create({
      data: { sessionId: session.id, name: "Paper", token: `paper-${Math.random()}`, isPaper: true },
    });
    expect((await game.answer(code, paper.token, 0, "Canberra")).status).toBe(403);
  });
});

describe("marking at close_round", () => {
  async function playRound(answers: string[]) {
    const { code, hostToken, packId, team } = await openRound();
    await game.advance(code, hostToken, "ask_next");
    await game.advance(code, hostToken, "ask_next");
    for (let q = 0; q < answers.length; q++) await game.answer(code, team, q, answers[q]);
    return { code, hostToken, packId, team };
  }

  it("marks every answer of the round", async () => {
    const { code, hostToken, team } = await playRound(["Canberra", "Six", "Mars"]);
    await game.advance(code, hostToken, "close_round");
    const marks = await Promise.all([0, 1, 2].map((q) => answerRow(code, team, q)));
    expect(marks.map((a) => a!.isCorrect)).toEqual([true, false, true]);
    expect(marks.map((a) => a!.pointsAwarded)).toEqual([1, 0, 1]);
  });

  it("marks against the answer key as it stands at the close", async () => {
    const answers = [...ROUND_ANSWERS[0]];
    answers[2] = "The fourth planet";
    const { code, hostToken, packId, team } = await playRound(answers);
    expect((await answerRow(code, team, 2))!.isCorrect).toBe(false);
    // The host adds an acceptable answer to question 3 while the round is open.
    const q = await db.question.findFirstOrThrow({ where: { round: { packId, index: 0 }, index: 2 } });
    await db.question.update({ where: { id: q.id }, data: { acceptableAnswers: JSON.stringify(["The fourth planet"]) } });
    await game.advance(code, hostToken, "close_round");
    expect((await answerRow(code, team, 2))!.isCorrect).toBe(true);
  });

  it("leaves a mark the host set by hand alone", async () => {
    // The key says Sydney is wrong; the host marks it right anyway.
    const { code, hostToken, team } = await playRound(["Sydney", "Seven", "Mars"]);
    const row = await answerRow(code, team, 0);
    const res = await overrideAnswer(
      new NextRequest(`http://localhost:3000/api/sessions/${code}/answers/${row!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...host.cookieHeader },
        body: JSON.stringify({ isCorrect: true, points: 1, hostToken }),
      }),
      { params: Promise.resolve({ code, answerId: row!.id }) }
    );
    expect(res.status).toBe(200);
    await game.advance(code, hostToken, "close_round");
    const after = await answerRow(code, team, 0);
    expect(after).toMatchObject({ isCorrect: true, pointsAwarded: 1, hostOverride: true });
  });
});
