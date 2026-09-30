import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { PATCH as updateQuestion } from "@/app/api/questions/[id]/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { POST as joinSession } from "@/app/api/sessions/[code]/join/route";
import { POST as advanceSession } from "@/app/api/sessions/[code]/advance/route";
import { POST as submitAnswer } from "@/app/api/sessions/[code]/answers/route";
import { createPackFromGenerated } from "@/lib/create-pack";
import { DEMO_PACK_PROMPT } from "@/lib/demo-pack";
import { db } from "@/lib/db";
import { testOwner } from "./owner-fixture";

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

describe("PATCH /api/questions/[id] — multiple-choice", () => {
  let questionId: string;

  beforeAll(async () => {
    // A dedicated, distinctly-titled pack — see routes.integration.test.ts
    // for why reusing DEMO_PACK's own title would risk a cross-file leak
    // through /api/packs/seed's findFirst-by-title reuse.
    const pack = await createPackFromGenerated(
      {
        title: "Question Types Test Pack (dedicated — not the shared seed pack)",
        rounds: [
          {
            title: "Round 1",
            category: "General",
            questions: [{ text: "What is the capital of Australia?", answer: "Canberra", points: 1, type: "TEXT" }],
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

  it("switches a question to multiple-choice with a valid option set", async () => {
    const res = await updateQuestion(
      jsonRequest(`${BASE}/api/questions/${questionId}`, "PATCH", {
        type: "MULTIPLE_CHOICE",
        options: ["Sydney", "Canberra", "Melbourne"],
      }),
      { params: Promise.resolve({ id: questionId }) }
    );
    expect(res.status).toBe(200);
    const { question } = await json(res);
    expect(question.type).toBe("MULTIPLE_CHOICE");
    expect(question.options).toEqual(["Sydney", "Canberra", "Melbourne"]);
  });

  it("rejects switching to multiple-choice with only 1 option", async () => {
    const res = await updateQuestion(
      jsonRequest(`${BASE}/api/questions/${questionId}`, "PATCH", {
        type: "MULTIPLE_CHOICE",
        options: ["Canberra"],
      }),
      { params: Promise.resolve({ id: questionId }) }
    );
    expect(res.status).toBe(400);
  });

  it("rejects an answer change that would fall outside the current options", async () => {
    // questionId is multiple-choice with options [Sydney, Canberra, Melbourne]
    // from the first test in this file (tests in one describe block share
    // state via questionId, same pattern as session-flow.integration.test.ts).
    const res = await updateQuestion(
      jsonRequest(`${BASE}/api/questions/${questionId}`, "PATCH", { answer: "Perth" }),
      { params: Promise.resolve({ id: questionId }) }
    );
    expect(res.status).toBe(400);
  });

  it("switching back to TEXT clears the options", async () => {
    const res = await updateQuestion(jsonRequest(`${BASE}/api/questions/${questionId}`, "PATCH", { type: "TEXT" }), {
      params: Promise.resolve({ id: questionId }),
    });
    expect(res.status).toBe(200);
    const { question } = await json(res);
    expect(question.type).toBe("TEXT");
    expect(question.options).toEqual([]);
  });
});

/**
 * GH3. ACC7: an all-multiple-choice pack came back typed TEXT with four good
 * options per question, and the save stored the text and dropped the
 * options, so the host got free text without a word. A usable option set is
 * saved as multiple choice; an unusable one is dropped as before.
 */
describe("createPackFromGenerated — options on a question typed TEXT", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("saves a usable option set as a multiple-choice question", async () => {
    const pack = await createPackFromGenerated(
      {
        title: "GH3 options on TEXT (dedicated test pack)",
        rounds: [
          {
            title: "Round 1",
            category: "General",
            questions: [
              { text: "What is the capital of Australia?", answer: "Canberra", points: 1, type: "TEXT", options: ["Sydney", "Canberra", "Perth"] },
              { text: "Which breed of cat has no tail?", answer: "Manx", points: 1, type: "TEXT", options: ["Manx"] },
            ],
          },
        ],
      },
      DEMO_PACK_PROMPT,
      owner.id
    );
    const [usable, unusable] = pack.rounds[0].questions;

    expect(usable.type).toBe("MULTIPLE_CHOICE");
    expect(JSON.parse(usable.options ?? "null")).toEqual(["Sydney", "Canberra", "Perth"]);
    expect(unusable.type).toBe("TEXT");
    expect(unusable.options).toBeNull();
  });
});

describe("answer submission — multiple-choice", () => {
  let packId: string;

  beforeAll(async () => {
    const pack = await createPackFromGenerated(
      {
        title: "MC Answer Submission Test Pack (dedicated — not the shared seed pack)",
        rounds: [
          {
            title: "Round 1",
            category: "General",
            questions: [
              {
                text: "What is the capital of Australia?",
                answer: "Canberra",
                points: 1,
                type: "MULTIPLE_CHOICE",
                options: ["Sydney", "Canberra", "Melbourne"],
              },
            ],
          },
        ],
      },
      DEMO_PACK_PROMPT,
      owner.id
    );
    packId = pack.id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function startedSession() {
    const createRes = await createSession(jsonRequest(`${BASE}/api/sessions`, "POST", { packId }));
    const { session, hostToken } = await json(createRes);
    const joinRes = await joinSession(
      jsonRequest(`${BASE}/api/sessions/${session.code}/join`, "POST", { name: "Quiz Pigs" }),
      { params: Promise.resolve({ code: session.code }) }
    );
    const { token } = await json(joinRes);
    await advanceSession(
      jsonRequest(`${BASE}/api/sessions/${session.code}/advance`, "POST", { action: "start", hostToken }),
      { params: Promise.resolve({ code: session.code }) }
    );
    return { code: session.code as string, token: token as string };
  }

  it("rejects a submission that isn't one of the question's options", async () => {
    const { code, token } = await startedSession();
    const res = await submitAnswer(
      jsonRequest(`${BASE}/api/sessions/${code}/answers`, "POST", { token, text: "Perth" }),
      { params: Promise.resolve({ code }) }
    );
    expect(res.status).toBe(400);
  });

  it("accepts and correctly scores a submission matching one of the options", async () => {
    const { code, token } = await startedSession();
    const res = await submitAnswer(
      jsonRequest(`${BASE}/api/sessions/${code}/answers`, "POST", { token, text: "Canberra" }),
      { params: Promise.resolve({ code }) }
    );
    expect(res.status).toBe(201);
  });
});
