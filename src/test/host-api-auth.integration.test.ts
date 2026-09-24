import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET as listPacks } from "@/app/api/packs/route";
import { DELETE as deletePack } from "@/app/api/packs/[id]/route";
import { GET as getPack } from "@/app/api/packs/[id]/route";
import { GET as exportPack } from "@/app/api/packs/[id]/export/route";
import { GET as getPdf } from "@/app/api/packs/[id]/pdf/route";
import { POST as generatePack } from "@/app/api/packs/generate/route";
import { POST as importPack } from "@/app/api/packs/import/route";
import { POST as seedPack } from "@/app/api/packs/seed/route";
import { GET as creatorStatus } from "@/app/api/creator/status/route";
import { POST as createQuestion } from "@/app/api/questions/route";
import { PATCH as patchQuestion, DELETE as deleteQuestion } from "@/app/api/questions/[id]/route";
import { POST as uploadMedia, GET as readMedia, DELETE as deleteMedia } from "@/app/api/questions/[id]/media/route";
import { DELETE as deleteRound } from "@/app/api/rounds/[id]/route";
import { POST as moveRound } from "@/app/api/rounds/[id]/move/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { GET as getSession } from "@/app/api/sessions/[code]/route";
import { POST as advanceSession } from "@/app/api/sessions/[code]/advance/route";
import { PATCH as overrideAnswer } from "@/app/api/sessions/[code]/answers/[answerId]/route";
import { POST as joinSession } from "@/app/api/sessions/[code]/join/route";
import { POST as submitAnswer } from "@/app/api/sessions/[code]/answers/route";
import { POST as leaveSession } from "@/app/api/sessions/[code]/leave/route";

import { createPackFromGenerated } from "@/lib/create-pack";
import { PACK_FILE_FORMAT, PACK_FILE_VERSION } from "@/lib/pack-file";
import { db } from "@/lib/db";
import { signInTestHost } from "./auth-fixture";

const BASE = "http://localhost:3000";

/**
 * The sweep: every host-side API answers 401 without a session, and every
 * team-side one still works without one.
 *
 * Written as a list rather than as one `it` per route on purpose — a route
 * added to the app and forgotten here is the failure this is guarding
 * against, and a list is the thing someone actually reads when they add one.
 */

function anon(url: string, method = "GET", body?: unknown) {
  return new NextRequest(`${BASE}${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });
const codeParams = (code: string) => ({ params: Promise.resolve({ code }) });

const host = await signInTestHost();

const pack = await createPackFromGenerated(
  {
    title: `Auth Sweep Pack ${Math.random().toString(36).slice(2)}`,
    rounds: [
      {
        title: "R",
        category: "C",
        questions: [
          { text: "Q1?", answer: "a1", points: 1, type: "TEXT" as const },
          { text: "Q2?", answer: "a2", points: 1, type: "TEXT" as const },
        ],
      },
      {
        title: "R2",
        category: "C",
        questions: [{ text: "Q3?", answer: "a3", points: 1, type: "TEXT" as const }],
      },
    ],
  },
  "auth sweep",
  host.id
);
const roundId = pack.rounds[0].id;
const questionId = pack.rounds[0].questions[0].id;

/** A live session, started by the signed-in host, for the team routes below. */
const sessionRes = await createSession(
  new NextRequest(`${BASE}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...host.cookieHeader },
    body: JSON.stringify({ packId: pack.id }),
  })
);
const { session, hostToken } = await sessionRes.json();

type Case = { name: string; run: () => Promise<Response> };

const HOST_ROUTES: Case[] = [
  { name: "GET /api/packs", run: () => listPacks(anon("/api/packs")) },
  { name: "POST /api/packs/generate", run: () => generatePack(anon("/api/packs/generate", "POST", { prompt: "A pub quiz." })) },
  { name: "POST /api/packs/import", run: () => importPack(
        anon("/api/packs/import", "POST", {
          format: PACK_FILE_FORMAT,
          version: PACK_FILE_VERSION,
          title: "A perfectly valid file, refused for want of a session",
          rounds: [{ title: "R", category: "C", questions: [{ text: "Q?", answer: "a", points: 1, type: "TEXT" }] }],
        })
      ) },
  { name: "POST /api/packs/seed", run: () => seedPack(anon("/api/packs/seed", "POST")) },
  { name: "DELETE /api/packs/[id]", run: () => deletePack(anon(`/api/packs/${pack.id}`, "DELETE"), idParams(pack.id)) },
  { name: "GET /api/packs/[id]", run: () => getPack(anon(`/api/packs/${pack.id}`), idParams(pack.id)) },
  { name: "GET /api/packs/[id]/pdf", run: () => getPdf(anon(`/api/packs/${pack.id}/pdf?type=answers`), idParams(pack.id)) },
  { name: "GET /api/packs/[id]/export", run: () => exportPack(anon(`/api/packs/${pack.id}/export`), idParams(pack.id)) },
  { name: "GET /api/creator/status", run: () => creatorStatus(anon("/api/creator/status")) },
  { name: "POST /api/questions", run: () => createQuestion(anon("/api/questions", "POST", { roundId })) },
  { name: "PATCH /api/questions/[id]", run: () => patchQuestion(anon(`/api/questions/${questionId}`, "PATCH", { answer: "x" }), idParams(questionId)) },
  { name: "DELETE /api/questions/[id]", run: () => deleteQuestion(anon(`/api/questions/${questionId}`, "DELETE"), idParams(questionId)) },
  {
    name: "POST /api/questions/[id]/media",
    run: () =>
      uploadMedia(
        new NextRequest(`${BASE}/api/questions/${questionId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream", "x-forwarded-for": "198.51.100.77" },
          body: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) as unknown as BodyInit,
        }),
        idParams(questionId)
      ),
  },
  { name: "DELETE /api/questions/[id]/media", run: () => deleteMedia(anon(`/api/questions/${questionId}/media`, "DELETE"), idParams(questionId)) },
  { name: "DELETE /api/rounds/[id]", run: () => deleteRound(anon(`/api/rounds/${roundId}`, "DELETE"), idParams(roundId)) },
  { name: "POST /api/rounds/[id]/move", run: () => moveRound(anon(`/api/rounds/${roundId}/move`, "POST", { direction: "down" }), idParams(roundId)) },
  { name: "POST /api/sessions", run: () => createSession(anon("/api/sessions", "POST", { packId: pack.id })) },
  { name: "POST /api/sessions/[code]/advance", run: () => advanceSession(anon(`/api/sessions/${session.code}/advance`, "POST", { action: "start", hostToken }), codeParams(session.code)) },
  { name: "PATCH /api/sessions/[code]/answers/[answerId]", run: () => overrideAnswer(new NextRequest(`${BASE}/api/sessions/${session.code}/answers/nope`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isCorrect: true, points: 1, hostToken }) }), { params: Promise.resolve({ code: session.code, answerId: "nope" }) }) },
];

describe("every host-side API refuses a request with no session", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  for (const route of HOST_ROUTES) {
    it(`401s ${route.name}`, async () => {
      const res = await route.run();
      expect(res.status).toBe(401);
    });
  }

  it("says the same thing every time, so a client can branch on one marker", async () => {
    const res = await listPacks(anon("/api/packs"));
    expect(await res.json()).toMatchObject({ signInRequired: true });
  });

  it("refuses the host routes before doing the work, not after", async () => {
    // The pack, its rounds and its questions all still exist after every
    // destructive route above was called without a session.
    expect(await db.quizPack.findUnique({ where: { id: pack.id } })).not.toBeNull();
    expect(await db.round.count({ where: { packId: pack.id } })).toBe(2);
    expect(await db.question.findUnique({ where: { id: questionId } })).not.toBeNull();
  });
});

describe("the routes that stay open, and why", () => {
  it("GET /api/questions/[id]/media — no longer open, and answers 404 rather than 401", async () => {
    // It used to take no credential at all. It now takes a team token for
    // the session whose current question it is, or a host who may read the
    // pack (src/lib/question-media-access.ts, swept in
    // src/test/question-media-access.integration.test.ts). It answers 404
    // rather than 401 on purpose: "not yours" and "no image here" have to be
    // the same answer, or a question id can be probed for one.
    const res = await readMedia(anon(`/api/questions/${questionId}/media`), idParams(questionId));
    expect(res.status).toBe(404);
  });

  it("GET /api/sessions/[code] — every team polls this every three seconds, on its team token alone", async () => {
    // The team token is this route's existing credential and is unchanged by
    // accounts: a team gets one by joining with the code from the table.
    const joined = await joinSession(
      anon(`/api/sessions/${session.code}/join`, "POST", { name: `Pollers ${Math.random().toString(36).slice(2)}` }),
      codeParams(session.code)
    );
    const { token } = await joined.json();

    const res = await getSession(
      anon(`/api/sessions/${session.code}?token=${encodeURIComponent(token)}`),
      codeParams(session.code)
    );
    expect(res.status).toBe(200);
  });

  it("POST /api/sessions/[code]/join — a team joins with a code from the table, nothing else", async () => {
    const res = await joinSession(
      anon(`/api/sessions/${session.code}/join`, "POST", { name: `Anon Team ${Math.random().toString(36).slice(2)}` }),
      codeParams(session.code)
    );
    expect(res.status).toBe(201);
  });

  it("POST /api/sessions/[code]/answers and /leave — answering and leaving need no account", async () => {
    const joined = await joinSession(
      anon(`/api/sessions/${session.code}/join`, "POST", { name: `Leavers ${Math.random().toString(36).slice(2)}` }),
      codeParams(session.code)
    );
    const { token } = await joined.json();

    await advanceSession(
      new NextRequest(`${BASE}/api/sessions/${session.code}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...host.cookieHeader },
        body: JSON.stringify({ action: "start", hostToken }),
      }),
      codeParams(session.code)
    );

    const answered = await submitAnswer(
      anon(`/api/sessions/${session.code}/answers`, "POST", { token, text: "a1" }),
      codeParams(session.code)
    );
    expect(answered.status).toBe(201);

    const left = await leaveSession(
      anon(`/api/sessions/${session.code}/leave`, "POST", { token }),
      codeParams(session.code)
    );
    // A team that has scored is kept on the board (see team-identity), so
    // this may be a 409 — what matters here is that it is never a 401.
    expect(left.status).not.toBe(401);
  });
});
