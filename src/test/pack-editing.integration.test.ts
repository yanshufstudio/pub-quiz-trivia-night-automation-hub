import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as createQuestion } from "@/app/api/questions/route";
import { DELETE as deleteQuestion, PATCH as patchQuestion } from "@/app/api/questions/[id]/route";
import { DELETE as deleteRound } from "@/app/api/rounds/[id]/route";
import { POST as moveRound } from "@/app/api/rounds/[id]/move/route";
import { createPackFromGenerated } from "@/lib/create-pack";
import { DEMO_PACK_PROMPT } from "@/lib/demo-pack";
import { db } from "@/lib/db";
import { PACK_LIMITS } from "@/lib/pack-file";
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

/** A fresh 3-round, 2-question-per-round pack for each test, so add/delete/
 * reorder in one test can never bleed into another (unlike the shared-fixture
 * pattern other integration files use for read-only or purely additive
 * checks — these mutate round/question indexes, which must stay isolated). */
async function freshPack() {
  return createPackFromGenerated(
    {
      title: `Pack Editing Test Pack ${Math.random().toString(36).slice(2)}`,
      rounds: [
        {
          title: "Round A",
          category: "General",
          questions: [
            { text: "A1?", answer: "a1", points: 1, type: "TEXT" },
            { text: "A2?", answer: "a2", points: 1, type: "TEXT" },
          ],
        },
        {
          title: "Round B",
          category: "General",
          questions: [
            { text: "B1?", answer: "b1", points: 1, type: "TEXT" },
            { text: "B2?", answer: "b2", points: 1, type: "TEXT" },
          ],
        },
        {
          title: "Round C",
          category: "General",
          questions: [{ text: "C1?", answer: "c1", points: 1, type: "TEXT" }],
        },
      ],
    },
    DEMO_PACK_PROMPT,
    owner.id
  );
}

async function reload(packId: string) {
  return db.quizPack.findUniqueOrThrow({
    where: { id: packId },
    include: { rounds: { include: { questions: { orderBy: { index: "asc" } } }, orderBy: { index: "asc" } } },
  });
}

describe("POST /api/questions", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("appends a new placeholder question at the end of the round", async () => {
    const pack = await freshPack();
    const roundId = pack.rounds[0].id;

    const res = await createQuestion(jsonRequest(`${BASE}/api/questions`, "POST", { roundId }));
    expect(res.status).toBe(201);
    const { question } = await json(res);
    expect(question.index).toBe(2); // Round A already had questions at 0, 1
    expect(question.type).toBe("TEXT");
    expect(question.options).toEqual([]);

    const reloaded = await reload(pack.id);
    expect(reloaded.rounds[0].questions).toHaveLength(3);
    expect(reloaded.rounds[0].questions[2].id).toBe(question.id);
  });

  it("404s for a round that doesn't exist", async () => {
    const res = await createQuestion(jsonRequest(`${BASE}/api/questions`, "POST", { roundId: "not-a-real-round" }));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/questions/[id]: how long a question and answer may be (M4)", () => {
  const patch = (id: string, body: unknown) =>
    patchQuestion(jsonRequest(`${BASE}/api/questions/${id}`, "PATCH", body), { params: Promise.resolve({ id }) });

  it("refuses text or an answer longer than a pack file may carry, and stores nothing", async () => {
    // These two were the only fields with no bound: a million characters saved.
    const question = (await freshPack()).rounds[0].questions[0];
    const tooLongText = await patch(question.id, { text: "x".repeat(PACK_LIMITS.questionText + 1) });
    const tooLongAnswer = await patch(question.id, { answer: "x".repeat(PACK_LIMITS.answer + 1) });
    expect(tooLongText.status).toBe(400);
    expect(tooLongAnswer.status).toBe(400);
    const stored = await db.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(stored.text).toBe("A1?");
    expect(stored.answer).toBe("a1");
  });

  it("takes both at exactly the limit, the same limit an import has", async () => {
    const question = (await freshPack()).rounds[0].questions[0];
    const text = "x".repeat(PACK_LIMITS.questionText);
    const answer = "y".repeat(PACK_LIMITS.answer);
    expect((await patch(question.id, { text, answer })).status).toBe(200);
    const stored = await db.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(stored.text).toBe(text);
    expect(stored.answer).toBe(answer);
  });
});

describe("PATCH /api/questions/[id]: a question that is already over the limit", () => {
  const patch = (id: string, body: unknown) =>
    patchQuestion(jsonRequest(`${BASE}/api/questions/${id}`, "PATCH", body), { params: Promise.resolve({ id }) });

  it("still saves when the long text and answer are sent back unchanged, as the editor does", async () => {
    // Generation and the old editor had no limit, so such questions exist.
    const question = (await freshPack()).rounds[0].questions[0];
    const text = "x".repeat(PACK_LIMITS.questionText + 50);
    const answer = "y".repeat(PACK_LIMITS.answer + 50);
    await db.question.update({ where: { id: question.id }, data: { text, answer } });

    expect((await patch(question.id, { text, answer, points: 3 })).status).toBe(200);
    const stored = await db.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(stored.points).toBe(3);
    expect(stored.text).toBe(text);

    // Changing it is held to the limit like any other edit, and shortening works.
    const longer = await patch(question.id, { text: `${text}!` });
    expect(longer.status).toBe(400);
    expect((await longer.json()).error).toMatch(/at most 2000 characters/);
    expect((await patch(question.id, { text: "Short now?" })).status).toBe(200);
  });
});

describe("DELETE /api/questions/[id]", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("deletes a question and shifts later questions down to close the index gap", async () => {
    const pack = await freshPack();
    const round = pack.rounds[0]; // 2 questions: index 0, 1
    const firstId = round.questions[0].id;
    const secondId = round.questions[1].id;

    const res = await deleteQuestion(jsonRequest(`${BASE}/api/questions/${firstId}`, "DELETE"), {
      params: Promise.resolve({ id: firstId }),
    });
    expect(res.status).toBe(200);

    const reloaded = await reload(pack.id);
    expect(reloaded.rounds[0].questions).toHaveLength(1);
    expect(reloaded.rounds[0].questions[0].id).toBe(secondId);
    expect(reloaded.rounds[0].questions[0].index).toBe(0);
  });

  it("refuses to delete a round's last remaining question", async () => {
    const pack = await freshPack();
    const round = pack.rounds[2]; // Round C has exactly 1 question
    const onlyId = round.questions[0].id;

    const res = await deleteQuestion(jsonRequest(`${BASE}/api/questions/${onlyId}`, "DELETE"), {
      params: Promise.resolve({ id: onlyId }),
    });
    expect(res.status).toBe(400);

    const reloaded = await reload(pack.id);
    expect(reloaded.rounds[2].questions).toHaveLength(1);
  });

  it("404s for a question that doesn't exist", async () => {
    const res = await deleteQuestion(jsonRequest(`${BASE}/api/questions/not-a-real-id`, "DELETE"), {
      params: Promise.resolve({ id: "not-a-real-id" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/rounds/[id]", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("deletes a round, its questions, and shifts later rounds down", async () => {
    const pack = await freshPack();
    const roundAId = pack.rounds[0].id;
    const roundBId = pack.rounds[1].id;
    const roundCId = pack.rounds[2].id;

    const res = await deleteRound(jsonRequest(`${BASE}/api/rounds/${roundAId}`, "DELETE"), {
      params: Promise.resolve({ id: roundAId }),
    });
    expect(res.status).toBe(200);

    const reloaded = await reload(pack.id);
    expect(reloaded.rounds).toHaveLength(2);
    expect(reloaded.rounds[0].id).toBe(roundBId);
    expect(reloaded.rounds[0].index).toBe(0);
    expect(reloaded.rounds[1].id).toBe(roundCId);
    expect(reloaded.rounds[1].index).toBe(1);

    // Cascade actually removed Round A's own questions, not just the round row.
    const orphaned = await db.question.findMany({ where: { roundId: roundAId } });
    expect(orphaned).toHaveLength(0);
  });

  it("refuses to delete a pack's last remaining round", async () => {
    const pack = await freshPack();
    const roundAId = pack.rounds[0].id;
    const roundBId = pack.rounds[1].id;
    const roundCId = pack.rounds[2].id;
    await deleteRound(jsonRequest(`${BASE}/api/rounds/${roundAId}`, "DELETE"), {
      params: Promise.resolve({ id: roundAId }),
    });
    await deleteRound(jsonRequest(`${BASE}/api/rounds/${roundBId}`, "DELETE"), {
      params: Promise.resolve({ id: roundBId }),
    });

    const res = await deleteRound(jsonRequest(`${BASE}/api/rounds/${roundCId}`, "DELETE"), {
      params: Promise.resolve({ id: roundCId }),
    });
    expect(res.status).toBe(400);

    const reloaded = await reload(pack.id);
    expect(reloaded.rounds).toHaveLength(1);
  });

  it("404s for a round that doesn't exist", async () => {
    const res = await deleteRound(jsonRequest(`${BASE}/api/rounds/not-a-real-id`, "DELETE"), {
      params: Promise.resolve({ id: "not-a-real-id" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/rounds/[id]/move", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("swaps a round with its predecessor on direction 'up'", async () => {
    const pack = await freshPack();
    const [roundA, roundB, roundC] = pack.rounds;

    const res = await moveRound(jsonRequest(`${BASE}/api/rounds/${roundB.id}/move`, "POST", { direction: "up" }), {
      params: Promise.resolve({ id: roundB.id }),
    });
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.moved).toBe(true);

    const reloaded = await reload(pack.id);
    expect(reloaded.rounds.map((r) => r.id)).toEqual([roundB.id, roundA.id, roundC.id]);
    expect(reloaded.rounds.map((r) => r.index)).toEqual([0, 1, 2]);
  });

  it("swaps a round with its successor on direction 'down'", async () => {
    const pack = await freshPack();
    const [roundA, roundB, roundC] = pack.rounds;

    await moveRound(jsonRequest(`${BASE}/api/rounds/${roundA.id}/move`, "POST", { direction: "down" }), {
      params: Promise.resolve({ id: roundA.id }),
    });

    const reloaded = await reload(pack.id);
    expect(reloaded.rounds.map((r) => r.id)).toEqual([roundB.id, roundA.id, roundC.id]);
  });

  it("is a no-op (not an error) when already at the top", async () => {
    const pack = await freshPack();
    const roundA = pack.rounds[0];

    const res = await moveRound(jsonRequest(`${BASE}/api/rounds/${roundA.id}/move`, "POST", { direction: "up" }), {
      params: Promise.resolve({ id: roundA.id }),
    });
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.moved).toBe(false);

    const reloaded = await reload(pack.id);
    expect(reloaded.rounds.map((r) => r.id)).toEqual(pack.rounds.map((r) => r.id));
  });

  it("is a no-op (not an error) when already at the bottom", async () => {
    const pack = await freshPack();
    const roundC = pack.rounds[2];

    const res = await moveRound(jsonRequest(`${BASE}/api/rounds/${roundC.id}/move`, "POST", { direction: "down" }), {
      params: Promise.resolve({ id: roundC.id }),
    });
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.moved).toBe(false);
  });

  it("404s for a round that doesn't exist", async () => {
    const res = await moveRound(
      jsonRequest(`${BASE}/api/rounds/not-a-real-id/move`, "POST", { direction: "up" }),
      { params: Promise.resolve({ id: "not-a-real-id" }) }
    );
    expect(res.status).toBe(404);
  });
});
