import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { PATCH as updateQuestion } from "@/app/api/questions/[id]/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { GET as getSession } from "@/app/api/sessions/[code]/route";
import { POST as joinSession } from "@/app/api/sessions/[code]/join/route";
import { POST as advanceSession } from "@/app/api/sessions/[code]/advance/route";
import { POST as submitAnswer } from "@/app/api/sessions/[code]/answers/route";
import { createPackFromGenerated } from "@/lib/create-pack";
import { DEMO_PACK_PROMPT } from "@/lib/demo-pack";
import { db } from "@/lib/db";
import { testOwner } from "./owner-fixture";
import { switchToQuestionMode } from "./question-mode-fixture";

const BASE = "http://localhost:3000";
const owner = await testOwner();

function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json", ...owner.cookieHeader },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json(res: Response) {
  return res.json();
}

describe("PATCH /api/questions/[id] — acceptable answers", () => {
  let questionId: string;

  beforeAll(async () => {
    // A dedicated, distinctly-titled pack — see routes.integration.test.ts
    // for why reusing DEMO_PACK's own title would risk a cross-file leak
    // through /api/packs/seed's findFirst-by-title reuse.
    const pack = await createPackFromGenerated(
      {
        title: "Acceptable Answers Test Pack (dedicated — not the shared seed pack)",
        rounds: [
          {
            title: "Round 1",
            category: "General",
            questions: [{ text: "How many continents are there?", answer: "Seven", points: 1, type: "TEXT" }],
          },
        ],
      },
      DEMO_PACK_PROMPT,
      owner.id
    );
    questionId = pack.rounds[0].questions[0].id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("saves a set of alternate answers", async () => {
    const res = await updateQuestion(
      jsonRequest(`${BASE}/api/questions/${questionId}`, "PATCH", { acceptableAnswers: ["7", "VII", "7"] }),
      { params: Promise.resolve({ id: questionId }) }
    );
    expect(res.status).toBe(200);
    const { question } = await json(res);
    // Deduplicated ("7" appeared twice).
    expect(question.acceptableAnswers).toEqual(["7", "VII"]);
  });

  it("drops blank entries and clears the column back to null when the list ends up empty", async () => {
    // Whitespace-only strings pass the schema's min(1) length check but are
    // trimmed away by the route's cleanup, leaving an empty list.
    const res = await updateQuestion(
      jsonRequest(`${BASE}/api/questions/${questionId}`, "PATCH", { acceptableAnswers: ["   ", "  "] }),
      { params: Promise.resolve({ id: questionId }) }
    );
    expect(res.status).toBe(200);
    const { question } = await json(res);
    expect(question.acceptableAnswers).toEqual([]);
  });

  it("clears acceptable answers when the question switches to multiple-choice", async () => {
    await updateQuestion(
      jsonRequest(`${BASE}/api/questions/${questionId}`, "PATCH", { acceptableAnswers: ["7", "VII"] }),
      { params: Promise.resolve({ id: questionId }) }
    );

    const res = await updateQuestion(
      jsonRequest(`${BASE}/api/questions/${questionId}`, "PATCH", {
        type: "MULTIPLE_CHOICE",
        options: ["Six", "Seven", "Eight"],
      }),
      { params: Promise.resolve({ id: questionId }) }
    );
    expect(res.status).toBe(200);
    const { question } = await json(res);
    expect(question.type).toBe("MULTIPLE_CHOICE");
    // "VII" being left over here could later coincidentally match a wrong
    // option and score it correct — see the comment in the route handler.
    expect(question.acceptableAnswers).toEqual([]);

    // Back to TEXT for any test that might reuse this fixture in the future.
    await updateQuestion(jsonRequest(`${BASE}/api/questions/${questionId}`, "PATCH", { type: "TEXT" }), {
      params: Promise.resolve({ id: questionId }),
    });
  });
});

describe("answer submission — acceptable answers", () => {
  let packId: string;
  let questionId: string;

  beforeAll(async () => {
    const pack = await createPackFromGenerated(
      {
        title: "Acceptable Answers Submission Test Pack (dedicated — not the shared seed pack)",
        rounds: [
          {
            title: "Round 1",
            category: "General",
            questions: [{ text: "How many continents are there?", answer: "Seven", points: 2, type: "TEXT" }],
          },
        ],
      },
      DEMO_PACK_PROMPT,
      owner.id
    );
    packId = pack.id;
    questionId = pack.rounds[0].questions[0].id;

    await updateQuestion(
      jsonRequest(`${BASE}/api/questions/${questionId}`, "PATCH", { acceptableAnswers: ["7", "VII"] }),
      { params: Promise.resolve({ id: questionId }) }
    );
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("scores a submission matching an acceptable answer (not the primary answer) as correct", async () => {
    const createRes = await createSession(jsonRequest(`${BASE}/api/sessions`, "POST", { packId }));
    const { session, hostToken } = await json(createRes);
    await switchToQuestionMode(session.code);
    const joinRes = await joinSession(
      jsonRequest(`${BASE}/api/sessions/${session.code}/join`, "POST", { name: "Numeral Knights" }),
      { params: Promise.resolve({ code: session.code }) }
    );
    const { token } = await json(joinRes);
    await advanceSession(
      jsonRequest(`${BASE}/api/sessions/${session.code}/advance`, "POST", { action: "start", hostToken }),
      { params: Promise.resolve({ code: session.code }) }
    );

    // "7" isn't the primary answer ("Seven") but is an approved alternate.
    const submitRes = await submitAnswer(
      jsonRequest(`${BASE}/api/sessions/${session.code}/answers`, "POST", { token, text: "7" }),
      { params: Promise.resolve({ code: session.code }) }
    );
    expect(submitRes.status).toBe(201);

    await advanceSession(
      jsonRequest(`${BASE}/api/sessions/${session.code}/advance`, "POST", { action: "reveal", hostToken }),
      { params: Promise.resolve({ code: session.code }) }
    );

    const teamView = await getSession(new NextRequest(`${BASE}/api/sessions/${session.code}?token=${token}`), {
      params: Promise.resolve({ code: session.code }),
    });
    const teamData = await json(teamView);
    expect(teamData.myAnswer.text).toBe("7");
    expect(teamData.myAnswer.isCorrect).toBe(true);
    expect(teamData.myAnswer.pointsAwarded).toBe(2);
    expect(teamData.scoreboard[0].score).toBe(2);
  });

  it("still rejects a submission matching neither the primary nor any acceptable answer", async () => {
    const createRes = await createSession(jsonRequest(`${BASE}/api/sessions`, "POST", { packId }));
    const { session, hostToken } = await json(createRes);
    await switchToQuestionMode(session.code);
    const joinRes = await joinSession(
      jsonRequest(`${BASE}/api/sessions/${session.code}/join`, "POST", { name: "Off By One" }),
      { params: Promise.resolve({ code: session.code }) }
    );
    const { token } = await json(joinRes);
    await advanceSession(
      jsonRequest(`${BASE}/api/sessions/${session.code}/advance`, "POST", { action: "start", hostToken }),
      { params: Promise.resolve({ code: session.code }) }
    );

    await submitAnswer(jsonRequest(`${BASE}/api/sessions/${session.code}/answers`, "POST", { token, text: "8" }), {
      params: Promise.resolve({ code: session.code }),
    });
    await advanceSession(
      jsonRequest(`${BASE}/api/sessions/${session.code}/advance`, "POST", { action: "reveal", hostToken }),
      { params: Promise.resolve({ code: session.code }) }
    );

    const teamView = await getSession(new NextRequest(`${BASE}/api/sessions/${session.code}?token=${token}`), {
      params: Promise.resolve({ code: session.code }),
    });
    const teamData = await json(teamView);
    expect(teamData.myAnswer.isCorrect).toBe(false);
    expect(teamData.scoreboard[0].score).toBe(0);
  });
});
