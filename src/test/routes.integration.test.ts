import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { PATCH as updateQuestion } from "@/app/api/questions/[id]/route";
import { createPackFromGenerated } from "@/lib/create-pack";
import { DEMO_PACK, DEMO_PACK_PROMPT } from "@/lib/demo-pack";
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

describe("PATCH /api/questions/[id]", () => {
  let questionId: string;

  beforeAll(async () => {
    // A dedicated pack with a distinct title: /api/packs/seed reuses any pack
    // matching DEMO_PACK.title (see its findFirst), so this suite's mutated
    // pack (points changed to 5 below) must not be picked up by other test
    // files' seed calls.
    const pack = await createPackFromGenerated(
      { ...DEMO_PACK, title: "PATCH Question Test Pack (dedicated — not the shared seed pack)" },
      DEMO_PACK_PROMPT,
      owner.id
    );
    questionId = pack.rounds[0].questions[1].id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("404s for a question that doesn't exist", async () => {
    const res = await updateQuestion(
      jsonRequest(`${BASE}/api/questions/does-not-exist`, "PATCH", { text: "New text" }),
      { params: Promise.resolve({ id: "does-not-exist" }) }
    );
    expect(res.status).toBe(404);
  });

  it("rejects an empty text or answer", async () => {
    const res = await updateQuestion(jsonRequest(`${BASE}/api/questions/${questionId}`, "PATCH", { text: "" }), {
      params: Promise.resolve({ id: questionId }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects points outside 1-10", async () => {
    const tooLow = await updateQuestion(
      jsonRequest(`${BASE}/api/questions/${questionId}`, "PATCH", { points: 0 }),
      { params: Promise.resolve({ id: questionId }) }
    );
    expect(tooLow.status).toBe(400);

    const tooHigh = await updateQuestion(
      jsonRequest(`${BASE}/api/questions/${questionId}`, "PATCH", { points: 11 }),
      { params: Promise.resolve({ id: questionId }) }
    );
    expect(tooHigh.status).toBe(400);
  });

  it("updates only the fields provided, leaving the rest untouched", async () => {
    const before = await db.question.findUniqueOrThrow({ where: { id: questionId } });

    const res = await updateQuestion(
      jsonRequest(`${BASE}/api/questions/${questionId}`, "PATCH", { points: 5 }),
      { params: Promise.resolve({ id: questionId }) }
    );
    expect(res.status).toBe(200);
    const { question } = await json(res);
    expect(question.points).toBe(5);
    expect(question.text).toBe(before.text);
    expect(question.answer).toBe(before.answer);
  });
});
