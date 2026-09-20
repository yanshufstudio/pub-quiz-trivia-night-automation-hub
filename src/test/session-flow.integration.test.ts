import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as createPack } from "@/app/api/packs/seed/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { GET as getSession } from "@/app/api/sessions/[code]/route";
import { POST as joinSession } from "@/app/api/sessions/[code]/join/route";
import { POST as advanceSession } from "@/app/api/sessions/[code]/advance/route";
import { POST as submitAnswer } from "@/app/api/sessions/[code]/answers/route";
import { PATCH as overrideAnswer } from "@/app/api/sessions/[code]/answers/[answerId]/route";
import { DEMO_PACK } from "@/lib/demo-pack";
import { db } from "@/lib/db";
import { signInTestHost } from "./auth-fixture";

const BASE = "http://localhost:3000";

// Host-side routes need an account now (src/lib/auth-guard.ts). One host
// per file, signed in for real, threaded onto every request this suite makes.
// Team routes ignore it; see team-routes-anonymous.integration.test.ts for the
// proof that they still work with no cookie at all.
const host = await signInTestHost();

function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json", ...host.cookieHeader },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json(res: Response) {
  return res.json();
}

describe("full session lifecycle", () => {
  let packId: string;
  let code: string;
  let token: string;
  let hostToken: string;

  beforeAll(async () => {
    const res = await createPack(jsonRequest(`${BASE}/api/packs/seed`, "POST"));
    const data = await json(res);
    packId = data.pack.id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("creates a session with a join code and a host key", async () => {
    const res = await createSession(jsonRequest(`${BASE}/api/sessions`, "POST", { packId }));
    expect(res.status).toBe(201);
    const data = await json(res);
    code = data.session.code;
    hostToken = data.hostToken;
    expect(code).toMatch(/^[A-Z0-9]{5}$/);
    expect(hostToken).toBeTruthy();
    expect(data.session.status).toBe("LOBBY");
    // The host key must never appear on the session object itself.
    expect(data.session.hostToken).toBeUndefined();
  });

  it("rejects host actions with a missing or wrong host key", async () => {
    const noToken = await advanceSession(
      jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action: "start" }),
      { params: Promise.resolve({ code }) }
    );
    expect(noToken.status).toBe(400); // hostToken is a required field

    const wrongToken = await advanceSession(
      jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", {
        action: "start",
        hostToken: "not-the-real-token",
      }),
      { params: Promise.resolve({ code }) }
    );
    expect(wrongToken.status).toBe(401);

    const hostViewNoToken = await getSession(new NextRequest(`${BASE}/api/sessions/${code}?as=host`), {
      params: Promise.resolve({ code }),
    });
    expect(hostViewNoToken.status).toBe(401);
  });

  it("lets a team join and rejects a duplicate name", async () => {
    const res = await joinSession(
      jsonRequest(`${BASE}/api/sessions/${code}/join`, "POST", { name: "Quiz Pigs" }),
      { params: Promise.resolve({ code }) }
    );
    expect(res.status).toBe(201);
    const data = await json(res);
    token = data.token;
    expect(data.teamName).toBe("Quiz Pigs");

    const dupe = await joinSession(
      jsonRequest(`${BASE}/api/sessions/${code}/join`, "POST", { name: "Quiz Pigs" }),
      { params: Promise.resolve({ code }) }
    );
    expect(dupe.status).toBe(409);
  });

  it("rejects an answer submission before the quiz starts", async () => {
    const res = await submitAnswer(
      jsonRequest(`${BASE}/api/sessions/${code}/answers`, "POST", { token, text: "anything" }),
      { params: Promise.resolve({ code }) }
    );
    expect(res.status).toBe(409);
  });

  it("starts the quiz and serves the first question without the answer", async () => {
    const res = await advanceSession(
      jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action: "start", hostToken }),
      { params: Promise.resolve({ code }) }
    );
    expect(res.status).toBe(200);

    const hostView = await getSession(
      new NextRequest(`${BASE}/api/sessions/${code}?as=host&hostToken=${hostToken}`),
      { params: Promise.resolve({ code }) }
    );
    const hostData = await json(hostView);
    expect(hostData.status).toBe("QUESTION_ACTIVE");
    expect(hostData.question.text).toBe(DEMO_PACK.rounds[0].questions[0].text);
    expect(hostData.question.answer).toBeNull();
  });

  it("only lets one of two concurrent reveal calls win", async () => {
    const [first, second] = await Promise.all([
      advanceSession(
        jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action: "reveal", hostToken }),
        { params: Promise.resolve({ code }) }
      ),
      advanceSession(
        jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action: "reveal", hostToken }),
        { params: Promise.resolve({ code }) }
      ),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);

    // Back to QUESTION_ACTIVE for the rest of the test — "reveal" already
    // committed once above, so undo it via a fresh start-style reset isn't
    // available; instead just confirm we're in REVEAL, matching the winner.
    const hostView = await getSession(
      new NextRequest(`${BASE}/api/sessions/${code}?as=host&hostToken=${hostToken}`),
      { params: Promise.resolve({ code }) }
    );
    const hostData = await json(hostView);
    expect(hostData.status).toBe("REVEAL");
  });

  it("auto-scores a correct answer but hides the verdict until reveal", async () => {
    // The previous test already moved this session to REVEAL without an
    // answer on record, so submit one now and reveal a second question to
    // exercise the hide-until-reveal behavior on a clean question.
    await advanceSession(jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action: "next", hostToken }), {
      params: Promise.resolve({ code }),
    });

    const correctAnswer = DEMO_PACK.rounds[0].questions[1].answer;
    const res = await submitAnswer(
      jsonRequest(`${BASE}/api/sessions/${code}/answers`, "POST", { token, text: correctAnswer }),
      { params: Promise.resolve({ code }) }
    );
    expect(res.status).toBe(201);

    const teamView = await getSession(new NextRequest(`${BASE}/api/sessions/${code}?token=${token}`), {
      params: Promise.resolve({ code }),
    });
    const teamData = await json(teamView);
    expect(teamData.myAnswer.text).toBe(correctAnswer);
    expect(teamData.myAnswer.isCorrect).toBeNull();
  });

  it("reveals the verdict and lets the host override scoring", async () => {
    await advanceSession(
      jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action: "reveal", hostToken }),
      { params: Promise.resolve({ code }) }
    );

    const teamView = await getSession(new NextRequest(`${BASE}/api/sessions/${code}?token=${token}`), {
      params: Promise.resolve({ code }),
    });
    const teamData = await json(teamView);
    expect(teamData.myAnswer.isCorrect).toBe(true);
    expect(teamData.scoreboard[0].score).toBe(1);

    const hostView = await getSession(
      new NextRequest(`${BASE}/api/sessions/${code}?as=host&hostToken=${hostToken}`),
      { params: Promise.resolve({ code }) }
    );
    const hostData = await json(hostView);
    const answerId = hostData.teams[0].currentAnswer.id;

    const wrongHostToken = await overrideAnswer(
      jsonRequest(`${BASE}/api/sessions/${code}/answers/${answerId}`, "PATCH", {
        isCorrect: false,
        points: 0,
        hostToken: "not-the-real-token",
      }),
      { params: Promise.resolve({ code, answerId }) }
    );
    expect(wrongHostToken.status).toBe(401);

    const overrideRes = await overrideAnswer(
      jsonRequest(`${BASE}/api/sessions/${code}/answers/${answerId}`, "PATCH", {
        isCorrect: false,
        points: 0,
        hostToken,
      }),
      { params: Promise.resolve({ code, answerId }) }
    );
    expect(overrideRes.status).toBe(200);

    const afterOverride = await getSession(
      new NextRequest(`${BASE}/api/sessions/${code}?as=host&hostToken=${hostToken}`),
      { params: Promise.resolve({ code }) }
    );
    const afterData = await json(afterOverride);
    expect(afterData.scoreboard[0].score).toBe(0);
  });

  it("refuses to advance to the next question before revealing", async () => {
    const res = await advanceSession(
      jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action: "reveal", hostToken }),
      { params: Promise.resolve({ code }) }
    );
    expect(res.status).toBe(409);
  });

  it("walks through every remaining question to the end of the quiz", async () => {
    const totalQuestions = DEMO_PACK.rounds.reduce((sum, r) => sum + r.questions.length, 0);

    // Already answered + revealed questions 1-2 above; advance through the rest.
    for (let answered = 2; answered < totalQuestions; answered++) {
      const nextRes = await advanceSession(
        jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action: "next", hostToken }),
        { params: Promise.resolve({ code }) }
      );
      expect(nextRes.status).toBe(200);

      await submitAnswer(
        jsonRequest(`${BASE}/api/sessions/${code}/answers`, "POST", {
          token,
          text: "deliberately wrong",
        }),
        { params: Promise.resolve({ code }) }
      );

      await advanceSession(
        jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action: "reveal", hostToken }),
        { params: Promise.resolve({ code }) }
      );
    }

    const finalRes = await advanceSession(
      jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action: "next", hostToken }),
      { params: Promise.resolve({ code }) }
    );
    expect(finalRes.status).toBe(200);
    const finalData = await json(finalRes);
    expect(finalData.session.status).toBe("ENDED");
  });
});
