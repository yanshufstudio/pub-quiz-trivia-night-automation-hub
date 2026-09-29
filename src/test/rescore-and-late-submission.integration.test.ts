import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as createSession } from "@/app/api/sessions/route";
import { POST as joinSession } from "@/app/api/sessions/[code]/join/route";
import { POST as submitAnswer } from "@/app/api/sessions/[code]/answers/route";
import { PATCH as overrideAnswer } from "@/app/api/sessions/[code]/answers/[answerId]/route";
import { POST as advanceSession } from "@/app/api/sessions/[code]/advance/route";
import { PATCH as patchQuestion } from "@/app/api/questions/[id]/route";
import { GET as readSession } from "@/app/api/sessions/[code]/route";

import { createPackFromGenerated } from "@/lib/create-pack";
import { db } from "@/lib/db";
import { SESSION_STATUS } from "@/lib/session-state";
import * as rateLimitModule from "@/lib/rate-limit";
import { signInTestHost, type TestHost } from "./auth-fixture";
import { switchToQuestionMode } from "./question-mode-fixture";

const BASE = "http://localhost:3000";
const codeParams = (code: string) => ({ params: Promise.resolve({ code }) });
const answerParams = (code: string, answerId: string) => ({
  params: Promise.resolve({ code, answerId }),
});
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

/**
 * Two ways a score could be wrong after the fact (M7, L3).
 *
 * M7: a submission is marked when it arrives, against the answer key at that
 * moment. Fixing the key mid-question is allowed — it moves no index — and is the
 * ordinary repair for a typo, but every answer already in kept its old mark. So the
 * host fixed the question and the scoreboard stayed wrong, with teams who answered
 * before the fix scored by one rule and those after by another.
 *
 * L3: the route's "is this question open" check is several awaits away from the
 * write, and a host can reveal inside that gap.
 */

let owner: TestHost;
let ip = 1000;

function ownedRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(`${BASE}${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...owner.cookieHeader },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function teamRequest(url: string, body: unknown) {
  ip += 1;
  return new NextRequest(`${BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.3.0.${ip % 250}` },
    body: JSON.stringify(body),
  });
}

/** A pack with one question whose key we can then change. */
async function liveGame(answer = "Canberra", points = 1) {
  owner = await signInTestHost();
  const pack = await createPackFromGenerated(
    {
      title: `Rescore Pack ${Math.random().toString(36).slice(2)}`,
      rounds: [
        {
          title: "Round One",
          category: "General Knowledge",
          questions: [
            { text: "What is the capital of Australia?", answer, points, type: "TEXT" },
            { text: "Second?", answer: "Second", points: 1, type: "TEXT" },
          ],
        },
      ],
    },
    "rescore fixture",
    owner.id
  );
  const created = await createSession(ownedRequest("/api/sessions", "POST", { packId: pack.id }));
  const { session, hostToken } = await created.json();
  const code = session.code as string;
  await switchToQuestionMode(code);

  const question = pack.rounds[0].questions.find((q) => q.text.startsWith("What is"))!;
  return { pack, code, hostToken, questionId: question.id };
}

async function joinTeam(code: string, name: string) {
  const res = await joinSession(teamRequest(`/api/sessions/${code}/join`, { name }), codeParams(code));
  expect(res.status).toBe(201);
  return (await res.json()).token as string;
}

const start = (code: string, hostToken: string) =>
  advanceSession(ownedRequest(`/api/sessions/${code}/advance`, "POST", { action: "start", hostToken }), codeParams(code));
const reveal = (code: string, hostToken: string) =>
  advanceSession(ownedRequest(`/api/sessions/${code}/advance`, "POST", { action: "reveal", hostToken }), codeParams(code));

const answerRow = (teamToken: string) =>
  db.answer.findFirstOrThrow({ where: { team: { token: teamToken } }, orderBy: { submittedAt: "desc" } });

beforeEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("rescoring at the reveal (M7)", () => {
  it("re-marks an answer that the fixed key makes right", async () => {
    // The host typed the wrong answer, a team answered correctly, and the host
    // noticed while the question was still open.
    const { code, hostToken, questionId } = await liveGame("Sydney", 3);
    const team = await joinTeam(code, "Quiz Pigs");
    await start(code, hostToken);

    const submitted = await submitAnswer(
      teamRequest(`/api/sessions/${code}/answers`, { token: team, text: "Canberra" }),
      codeParams(code)
    );
    expect(submitted.status).toBe(201);
    // Marked wrong, against the key as it was.
    expect(await answerRow(team)).toMatchObject({ isCorrect: false, pointsAwarded: 0 });

    // The host fixes the key mid-question, which the live-game guard allows.
    expect(
      (await patchQuestion(ownedRequest(`/api/questions/${questionId}`, "PATCH", { answer: "Canberra" }), idParams(questionId)))
        .status
    ).toBe(200);

    await reveal(code, hostToken);

    expect(await answerRow(team)).toMatchObject({ isCorrect: true, pointsAwarded: 3 });
  });

  it("re-marks an answer that the fixed key makes wrong", async () => {
    // It has to work both ways, or "rescore" means "give points away".
    const { code, hostToken, questionId } = await liveGame("Canberra", 2);
    const team = await joinTeam(code, "Quiz Pigs");
    await start(code, hostToken);
    await submitAnswer(teamRequest(`/api/sessions/${code}/answers`, { token: team, text: "Canberra" }), codeParams(code));
    expect(await answerRow(team)).toMatchObject({ isCorrect: true, pointsAwarded: 2 });

    await patchQuestion(ownedRequest(`/api/questions/${questionId}`, "PATCH", { answer: "Melbourne" }), idParams(questionId));
    await reveal(code, hostToken);

    expect(await answerRow(team)).toMatchObject({ isCorrect: false, pointsAwarded: 0 });
  });

  it("picks up a newly added acceptable answer", async () => {
    const { code, hostToken, questionId } = await liveGame("Canberra", 1);
    const team = await joinTeam(code, "Quiz Pigs");
    await start(code, hostToken);
    await submitAnswer(
      teamRequest(`/api/sessions/${code}/answers`, { token: team, text: "Canberra, Australia" }),
      codeParams(code)
    );

    await patchQuestion(
      ownedRequest(`/api/questions/${questionId}`, "PATCH", { acceptableAnswers: ["Canberra, Australia"] }),
      idParams(questionId)
    );
    await reveal(code, hostToken);

    expect(await answerRow(team)).toMatchObject({ isCorrect: true });
  });

  it("leaves a mark the host set by hand alone", async () => {
    /**
     * The point of `hostOverride`. A host who accepted something the matcher
     * would not does not want it re-marked wrong a second later — a human
     * deciding outranks the key.
     */
    const { code, hostToken, questionId } = await liveGame("Canberra", 1);
    const team = await joinTeam(code, "Quiz Pigs");
    await start(code, hostToken);
    await submitAnswer(
      teamRequest(`/api/sessions/${code}/answers`, { token: team, text: "the one with the lake" }),
      codeParams(code)
    );
    await reveal(code, hostToken);

    const row = await answerRow(team);
    expect(row.isCorrect).toBe(false);

    // The host overrules the matcher.
    expect(
      (
        await overrideAnswer(
          ownedRequest(`/api/sessions/${code}/answers/${row.id}`, "PATCH", {
            isCorrect: true,
            points: 1,
            hostToken,
          }),
          answerParams(code, row.id)
        )
      ).status
    ).toBe(200);
    expect(await answerRow(team)).toMatchObject({ isCorrect: true, hostOverride: true });

    // Now the key changes and the question is revealed again (the host went back).
    await patchQuestion(ownedRequest(`/api/questions/${questionId}`, "PATCH", { answer: "Melbourne" }), idParams(questionId));
    await db.session.update({ where: { code }, data: { status: SESSION_STATUS.QUESTION_ACTIVE } });
    await reveal(code, hostToken);

    // Still the host's decision.
    expect(await answerRow(team)).toMatchObject({ isCorrect: true, pointsAwarded: 1, hostOverride: true });
  });

  it("rescores on the timer's auto-reveal too, not just the host's", async () => {
    // Both paths into REVEAL, or a question whose key was fixed gets marked by the
    // old key whenever the timer wins the race.
    const { code, hostToken, questionId } = await liveGame("Sydney", 1);
    const team = await joinTeam(code, "Quiz Pigs");
    await start(code, hostToken);
    await submitAnswer(teamRequest(`/api/sessions/${code}/answers`, { token: team, text: "Canberra" }), codeParams(code));
    await patchQuestion(ownedRequest(`/api/questions/${questionId}`, "PATCH", { answer: "Canberra" }), idParams(questionId));

    // Give the session an expired timer, then poll — which is what triggers the
    // auto-reveal.
    await db.session.update({
      where: { code },
      data: { questionDurationSeconds: 20, questionStartedAt: new Date(Date.now() - 60_000) },
    });
    const polled = await readSession(
      new NextRequest(`${BASE}/api/sessions/${code}?token=${encodeURIComponent(team)}`),
      codeParams(code)
    );
    expect((await polled.json()).status).toBe(SESSION_STATUS.REVEAL);

    expect(await answerRow(team)).toMatchObject({ isCorrect: true });
  });
});

describe("a submission that lands too late (L3)", () => {
  it("is refused when the host reveals inside the gap before the write", async () => {
    /**
     * The race, made deterministic. `rateLimit` is called between the route's
     * status check and its write, so revealing from inside it reproduces exactly
     * the window L3 is about — a host pressing Reveal while a submission is in
     * flight.
     */
    const { code, hostToken } = await liveGame("Canberra", 1);
    const team = await joinTeam(code, "Quiz Pigs");
    await start(code, hostToken);

    const real = rateLimitModule.rateLimit;
    vi.spyOn(rateLimitModule, "rateLimit").mockImplementation(async (...args) => {
      const result = await real(...args);
      await db.session.update({ where: { code }, data: { status: SESSION_STATUS.REVEAL } });
      return result;
    });

    const res = await submitAnswer(
      teamRequest(`/api/sessions/${code}/answers`, { token: team, text: "Canberra" }),
      codeParams(code)
    );

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/no longer accepting answers/i);
    // And nothing was written, so it cannot score after time is up.
    expect(await db.answer.count({ where: { team: { token: team } } })).toBe(0);
  });

  it("is refused when the host advances to the next question inside the gap", async () => {
    // The position matters as well as the status: advancing lands back on
    // QUESTION_ACTIVE, so a status-only check would accept this against the wrong
    // question.
    const { code, hostToken } = await liveGame("Canberra", 1);
    const team = await joinTeam(code, "Quiz Pigs");
    await start(code, hostToken);

    const real = rateLimitModule.rateLimit;
    vi.spyOn(rateLimitModule, "rateLimit").mockImplementation(async (...args) => {
      const result = await real(...args);
      await db.session.update({
        where: { code },
        data: { status: SESSION_STATUS.QUESTION_ACTIVE, currentQuestionIndex: 1 },
      });
      return result;
    });

    const res = await submitAnswer(
      teamRequest(`/api/sessions/${code}/answers`, { token: team, text: "Canberra" }),
      codeParams(code)
    );

    expect(res.status).toBe(409);
    expect(await db.answer.count({ where: { team: { token: team } } })).toBe(0);
  });

  it("cannot overwrite a mark the host set by hand", async () => {
    // Belt and braces: a host can only override from the reveal onwards, which the
    // status check already excludes — but a human's mark should not be
    // overwritable by a race.
    const { code, hostToken } = await liveGame("Canberra", 1);
    const team = await joinTeam(code, "Quiz Pigs");
    await start(code, hostToken);
    await submitAnswer(teamRequest(`/api/sessions/${code}/answers`, { token: team, text: "wrong" }), codeParams(code));

    const row = await answerRow(team);
    await db.answer.update({
      where: { id: row.id },
      data: { hostOverride: true, isCorrect: true, pointsAwarded: 1 },
    });

    const res = await submitAnswer(
      teamRequest(`/api/sessions/${code}/answers`, { token: team, text: "Canberra" }),
      codeParams(code)
    );

    expect(res.status).toBe(409);
    expect(await answerRow(team)).toMatchObject({ text: "wrong", isCorrect: true, hostOverride: true });
  });

  it("still accepts an ordinary resubmission while the question is open", async () => {
    // The guard must not break changing your mind, which is normal.
    const { code, hostToken } = await liveGame("Canberra", 1);
    const team = await joinTeam(code, "Quiz Pigs");
    await start(code, hostToken);

    expect(
      (await submitAnswer(teamRequest(`/api/sessions/${code}/answers`, { token: team, text: "Sydney" }), codeParams(code)))
        .status
    ).toBe(201);
    expect(
      (await submitAnswer(teamRequest(`/api/sessions/${code}/answers`, { token: team, text: "Canberra" }), codeParams(code)))
        .status
    ).toBe(201);

    expect(await answerRow(team)).toMatchObject({ text: "Canberra", isCorrect: true });
    expect(await db.answer.count({ where: { team: { token: team } } })).toBe(1);
  });
});
