import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as createPack } from "@/app/api/packs/seed/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { GET as getSession } from "@/app/api/sessions/[code]/route";
import { POST as joinSession } from "@/app/api/sessions/[code]/join/route";
import { POST as advanceSession } from "@/app/api/sessions/[code]/advance/route";
import { POST as submitAnswer } from "@/app/api/sessions/[code]/answers/route";
import { db } from "@/lib/db";

const BASE = "http://localhost:3000";

function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * The live scoreboard used to answer the question for you. Answers are scored
 * at submit time and a team may resubmit, so a team could submit a guess,
 * poll GET /api/sessions/[code], and read off its own running total whether
 * that guess was right — while the question was still open. The route already
 * withheld myAnswer.isCorrect and myAnswer.pointsAwarded before the reveal;
 * the total leaked the identical fact.
 *
 * The demo pack's first question is "What is the capital of Australia?",
 * answer "Canberra", worth 1 point.
 */
describe("the scoreboard does not leak the open question", () => {
  let code: string;
  let hostToken: string;
  let teamToken: string;
  let teamId: string;

  beforeAll(async () => {
    const pack = await (await createPack(jsonRequest(`${BASE}/api/packs/seed`, "POST"))).json();
    const created = await (
      await createSession(jsonRequest(`${BASE}/api/sessions`, "POST", { packId: pack.pack.id }))
    ).json();
    code = created.session.code;
    hostToken = created.hostToken;

    const joined = await (
      await joinSession(jsonRequest(`${BASE}/api/sessions/${code}/join`, "POST", { name: "Alpha" }), {
        params: Promise.resolve({ code }),
      })
    ).json();
    teamToken = joined.token;
    teamId = joined.teamId;

    await advanceSession(jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action: "start", hostToken }), {
      params: Promise.resolve({ code }),
    });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function scoreFor(as: "team" | "host") {
    const url =
      as === "host"
        ? `${BASE}/api/sessions/${code}?as=host&hostToken=${hostToken}`
        : `${BASE}/api/sessions/${code}?token=${teamToken}`;
    const body = await (await getSession(new NextRequest(url), { params: Promise.resolve({ code }) })).json();
    return body.scoreboard.find((row: { teamId: string }) => row.teamId === teamId)!.score;
  }

  it("holds the score at zero after a correct answer while the question is open", async () => {
    const res = await submitAnswer(
      jsonRequest(`${BASE}/api/sessions/${code}/answers`, "POST", { token: teamToken, text: "Canberra" }),
      { params: Promise.resolve({ code }) }
    );
    expect(res.status).toBe(201);

    // The answer is stored and scored — this is not about refusing to score.
    const stored = await db.answer.findFirst({ where: { teamId, roundIndex: 0, questionIndex: 0 } });
    expect(stored?.isCorrect).toBe(true);
    expect(stored?.pointsAwarded).toBe(1);

    // ...but neither payload may show it yet.
    expect(await scoreFor("team")).toBe(0);
    // The host screen is on the pub TV, so it is withheld there too.
    expect(await scoreFor("host")).toBe(0);
  });

  it("still holds at zero after a team resubmits, which is how the oracle was worked", async () => {
    for (const guess of ["Sydney", "Melbourne", "Canberra"]) {
      await submitAnswer(
        jsonRequest(`${BASE}/api/sessions/${code}/answers`, "POST", { token: teamToken, text: guess }),
        { params: Promise.resolve({ code }) }
      );
      expect(await scoreFor("team")).toBe(0);
    }
  });

  it("shows the score once the host reveals", async () => {
    await advanceSession(
      jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action: "reveal", hostToken }),
      { params: Promise.resolve({ code }) }
    );
    expect(await scoreFor("team")).toBe(1);
    expect(await scoreFor("host")).toBe(1);
  });

  it("carries that score forward once the next question opens", async () => {
    await advanceSession(jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action: "next", hostToken }), {
      params: Promise.resolve({ code }),
    });
    // Question 2 is open and unanswered; question 1's point is banked.
    expect(await scoreFor("team")).toBe(1);
  });
});
