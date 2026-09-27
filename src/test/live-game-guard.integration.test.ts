import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as createQuestion } from "@/app/api/questions/route";
import { PATCH as patchQuestion, DELETE as deleteQuestion } from "@/app/api/questions/[id]/route";
import { DELETE as deleteRound } from "@/app/api/rounds/[id]/route";
import { POST as moveRound } from "@/app/api/rounds/[id]/move/route";
import { DELETE as deletePack } from "@/app/api/packs/[id]/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { POST as advanceSession } from "@/app/api/sessions/[code]/advance/route";

import { createPackFromGenerated } from "@/lib/create-pack";
import { db } from "@/lib/db";
import { LIVE_GAME_MESSAGE, STALE_SESSION_HOURS } from "@/lib/live-game-guard";
import { SESSION_STATUS } from "@/lib/session-state";
import { signInTestHost, type TestHost } from "./auth-fixture";

const BASE = "http://localhost:3000";
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });
const codeParams = (code: string) => ({ params: Promise.resolve({ code }) });

/**
 * A pack being played cannot be restructured underneath the game (H5/H6), and
 * the host has a way to say the game is over (L9).
 *
 * The damage these guard against is not a crash: a live session addresses its
 * position by index, and every answer already submitted is stored against the
 * (roundIndex, questionIndex) it was asked at. Delete question 2 and the shift
 * that closes the index gap re-points every later answer at a different
 * question, so scores change after the fact and nothing says so. That is why
 * the refusal is worth a test per operation rather than one for the helper.
 */

let owner: TestHost;

function ownedRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(`${BASE}${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...owner.cookieHeader },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function makePack() {
  return createPackFromGenerated(
    {
      title: `Live Guard Pack ${Math.random().toString(36).slice(2)}`,
      rounds: [
        {
          title: "Round One",
          category: "General Knowledge",
          questions: [
            { text: "Q1?", answer: "A1", points: 1, type: "TEXT" },
            { text: "Q2?", answer: "A2", points: 1, type: "TEXT" },
          ],
        },
        {
          title: "Round Two",
          category: "General Knowledge",
          questions: [{ text: "Q3?", answer: "A3", points: 1, type: "TEXT" }],
        },
      ],
    },
    "live guard fixture",
    owner.id
  );
}

/** A session on the pack, in the lobby, exactly as the editor starts one. */
async function startSession(packId: string) {
  const res = await createSession(ownedRequest("/api/sessions", "POST", { packId }));
  expect(res.status).toBe(201);
  const body = await res.json();
  return { code: body.session.code as string, hostToken: body.hostToken as string };
}

type PackFixture = Awaited<ReturnType<typeof makePack>>;

function firstRound(pack: PackFixture) {
  return pack.rounds[0];
}

/** Every structural write the guard covers. A list rather than a test each,
 * because a route added to the app and forgotten here is the failure worth
 * catching. */
const STRUCTURAL_WRITES = [
  "add a question",
  "delete a question",
  "delete a round",
  "move a round",
  "delete the pack",
] as const;

function performWrite(name: (typeof STRUCTURAL_WRITES)[number], pack: PackFixture) {
  const round = firstRound(pack);
  const question = round.questions[0];
  switch (name) {
    case "add a question":
      return createQuestion(ownedRequest("/api/questions", "POST", { roundId: round.id }));
    case "delete a question":
      return deleteQuestion(ownedRequest(`/api/questions/${question.id}`, "DELETE"), idParams(question.id));
    case "delete a round":
      return deleteRound(ownedRequest(`/api/rounds/${round.id}`, "DELETE"), idParams(round.id));
    case "move a round":
      return moveRound(
        ownedRequest(`/api/rounds/${round.id}/move`, "POST", { direction: "down" }),
        idParams(round.id)
      );
    case "delete the pack":
      return deletePack(ownedRequest(`/api/packs/${pack.id}`, "DELETE"), idParams(pack.id));
  }
}

describe("structural edits while a game is live", () => {
  beforeEach(async () => {
    owner = await signInTestHost();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it.each(STRUCTURAL_WRITES)("refuses to %s, with 409 and the same sentence", async (name) => {
    // A fresh pack and session per operation, so the first refusal is never
    // the reason the next one is refused.
    const pack = await makePack();
    await startSession(pack.id);

    const res = await performWrite(name, pack);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe(LIVE_GAME_MESSAGE);
    expect(body.liveGame).toBe(true);
  });

  it("still lets the host fix a question's wording and its answer key", async () => {
    // The whole point of scoping the guard to *structure*: a typo found while
    // the room is waiting is the most ordinary thing a host does, and changing
    // text or an answer moves no index, so no stored answer changes meaning.
    const pack = await makePack();
    await startSession(pack.id);
    const question = firstRound(pack).questions[0];

    const res = await patchQuestion(
      ownedRequest(`/api/questions/${question.id}`, "PATCH", {
        text: "Corrected wording?",
        answer: "Corrected answer",
      }),
      idParams(question.id)
    );

    expect(res.status).toBe(200);
    const after = await db.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(after.text).toBe("Corrected wording?");
    expect(after.answer).toBe("Corrected answer");
  });

  it("allows everything again once the host ends the game", async () => {
    const pack = await makePack();
    const { code, hostToken } = await startSession(pack.id);

    expect(
      (await createQuestion(ownedRequest("/api/questions", "POST", { roundId: firstRound(pack).id }))).status
    ).toBe(409);

    const ended = await advanceSession(
      ownedRequest(`/api/sessions/${code}/advance`, "POST", { action: "end", hostToken }),
      codeParams(code)
    );
    expect(ended.status).toBe(200);

    expect(
      (await createQuestion(ownedRequest("/api/questions", "POST", { roundId: firstRound(pack).id }))).status
    ).toBe(201);
  });

  it("ignores a session that has been silent longer than the staleness window", async () => {
    // Otherwise the guard is a trap: a host who opens a lobby and wanders off
    // would lock the pack for good.
    const pack = await makePack();
    const { code } = await startSession(pack.id);
    await db.session.update({
      where: { code },
      data: { createdAt: new Date(Date.now() - (STALE_SESSION_HOURS + 1) * 60 * 60 * 1000) },
    });

    expect(
      (await createQuestion(ownedRequest("/api/questions", "POST", { roundId: firstRound(pack).id }))).status
    ).toBe(201);
  });

  it("still refuses when an old session asked a question recently", async () => {
    // A quiz night that began 13 hours ago but is mid-question right now is
    // live, so last activity has to be questionStartedAt when there is one —
    // not createdAt.
    const pack = await makePack();
    const { code } = await startSession(pack.id);
    await db.session.update({
      where: { code },
      data: {
        createdAt: new Date(Date.now() - (STALE_SESSION_HOURS + 1) * 60 * 60 * 1000),
        status: SESSION_STATUS.QUESTION_ACTIVE,
        questionStartedAt: new Date(),
      },
    });

    expect(
      (await createQuestion(ownedRequest("/api/questions", "POST", { roundId: firstRound(pack).id }))).status
    ).toBe(409);
  });

  it("does not count a game that has already ended", async () => {
    const pack = await makePack();
    const { code } = await startSession(pack.id);
    await db.session.update({ where: { code }, data: { status: SESSION_STATUS.ENDED } });

    expect(
      (await createQuestion(ownedRequest("/api/questions", "POST", { roundId: firstRound(pack).id }))).status
    ).toBe(201);
  });

  it("refuses the operator's admin override too", async () => {
    // Deleting the pack cascades the running session, its teams and its
    // answers away. That is a data-integrity rule, so holding the admin token
    // does not exempt it.
    const pack = await makePack();
    await startSession(pack.id);
    const previous = process.env.ADMIN_TOKEN;
    process.env.ADMIN_TOKEN = "test-admin-token";
    try {
      const res = await deletePack(
        new NextRequest(`${BASE}/api/packs/${pack.id}`, {
          method: "DELETE",
          headers: { "x-admin-token": "test-admin-token" },
        }),
        idParams(pack.id)
      );
      expect(res.status).toBe(409);
      expect(await db.quizPack.findUnique({ where: { id: pack.id } })).not.toBeNull();
    } finally {
      if (previous === undefined) delete process.env.ADMIN_TOKEN;
      else process.env.ADMIN_TOKEN = previous;
    }
  });

  it("leaves another pack's editing alone", async () => {
    // The guard is keyed on the pack, not on "any game anywhere".
    const busy = await makePack();
    const quiet = await makePack();
    await startSession(busy.id);

    expect(
      (await createQuestion(ownedRequest("/api/questions", "POST", { roundId: firstRound(quiet).id }))).status
    ).toBe(201);
  });
});

describe("the host's End game button (L9)", () => {
  beforeEach(async () => {
    owner = await signInTestHost();
  });

  it.each([SESSION_STATUS.LOBBY, SESSION_STATUS.QUESTION_ACTIVE, SESSION_STATUS.REVEAL])(
    "ends a session that is in %s",
    async (status) => {
      const pack = await makePack();
      const { code, hostToken } = await startSession(pack.id);
      await db.session.update({ where: { code }, data: { status } });

      const res = await advanceSession(
        ownedRequest(`/api/sessions/${code}/advance`, "POST", { action: "end", hostToken }),
        codeParams(code)
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.session.status).toBe(SESSION_STATUS.ENDED);
      // The host token must never come back in a session payload.
      expect(body.session.hostToken).toBeUndefined();
    }
  );

  it("is idempotent, because a second tap or a retry is not an error", async () => {
    const pack = await makePack();
    const { code, hostToken } = await startSession(pack.id);
    const end = () =>
      advanceSession(
        ownedRequest(`/api/sessions/${code}/advance`, "POST", { action: "end", hostToken }),
        codeParams(code)
      );

    expect((await end()).status).toBe(200);
    expect((await end()).status).toBe(200);
    const after = await db.session.findUniqueOrThrow({ where: { code } });
    expect(after.status).toBe(SESSION_STATUS.ENDED);
  });

  it("refuses a stranger holding the join code but not the host key", async () => {
    const pack = await makePack();
    const { code } = await startSession(pack.id);

    const res = await advanceSession(
      ownedRequest(`/api/sessions/${code}/advance`, "POST", { action: "end", hostToken: "not-the-key" }),
      codeParams(code)
    );

    expect(res.status).toBe(401);
    const after = await db.session.findUniqueOrThrow({ where: { code } });
    expect(after.status).toBe(SESSION_STATUS.LOBBY);
  });
});
