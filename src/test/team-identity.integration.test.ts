import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as createSession } from "@/app/api/sessions/route";
import { POST as joinSession } from "@/app/api/sessions/[code]/join/route";
import { POST as leaveSession } from "@/app/api/sessions/[code]/leave/route";
import { POST as advance } from "@/app/api/sessions/[code]/advance/route";
import { POST as submitAnswer } from "@/app/api/sessions/[code]/answers/route";
import { createPackFromGenerated } from "@/lib/create-pack";
import { db } from "@/lib/db";

const BASE = "http://localhost:3000";
const NUL = String.fromCharCode(0);
const codeParams = (code: string) => ({ params: Promise.resolve({ code }) });

/**
 * What the 2026-09-17 multi-device and stress runs turned up about team
 * identity: "quiz pigs" could join alongside "Quiz Pigs"; a name with a
 * newline split over two lines on the host desk and one with a NUL byte
 * stored truncated; a run of spaces was accepted as an answer; and a team
 * that pressed Leave stayed on the board forever with its name locked, so
 * the same phone could not come back as itself.
 */

let ipn = 0;
const ip = () => `10.55.0.${(ipn++ % 250) + 1}`;

function post(path: string, body: unknown) {
  return new NextRequest(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip() },
    body: JSON.stringify(body),
  });
}

async function newSession() {
  const pack = await createPackFromGenerated(
    {
      title: `Team identity ${Math.random().toString(36).slice(2)}`,
      rounds: [{ title: "R", category: "C", questions: [{ text: "Q1?", answer: "a1", points: 1, type: "TEXT" as const }] }],
    },
    "team identity test",
    null
  );
  const res = await createSession(post("/api/sessions", { packId: pack.id }));
  const data = await res.json();
  return { code: data.session.code as string, hostToken: data.hostToken as string };
}

const join = (code: string, name: string) => joinSession(post(`/api/sessions/${code}/join`, { name }), codeParams(code));

describe("team names", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("refuses a duplicate that differs only by case or spacing", async () => {
    const { code } = await newSession();
    expect((await join(code, "Quiz Pigs")).status).toBe(201);
    const dup = await join(code, "quiz  pigs");
    expect(dup.status).toBe(409);
    expect((await dup.json()).error).toMatch(/already taken/);
  });

  it("stores a cleaned name: control characters gone, whitespace collapsed", async () => {
    const { code } = await newSession();
    const res = await join(code, `  Quiz\n${NUL}  Pigs  `);
    expect(res.status).toBe(201);
    expect((await res.json()).teamName).toBe("Quiz Pigs");
  });

  it("rejects a name that is nothing but control characters", async () => {
    const { code } = await newSession();
    expect((await join(code, `${NUL}​`)).status).toBe(400);
  });

  it("keeps emoji, Hebrew and HTML-looking names verbatim", async () => {
    const { code } = await newSession();
    for (const name of ["🍺 Beer Necessities", "צוות הינשופים", "<b>Bold</b> & 'Quotes'"]) {
      const res = await join(code, name);
      expect(res.status).toBe(201);
      expect((await res.json()).teamName).toBe(name);
    }
  });
});

describe("leaving a session", () => {
  it("removes a team that has not answered, so the name can rejoin", async () => {
    const { code } = await newSession();
    const first = await (await join(code, "Quiz Pigs")).json();
    const left = await leaveSession(post(`/api/sessions/${code}/leave`, { token: first.token }), codeParams(code));
    expect(left.status).toBe(200);
    expect((await left.json()).removed).toBe(true);
    expect((await join(code, "Quiz Pigs")).status).toBe(201);
  });

  it("keeps a team that has scored, so the board is not rewritten", async () => {
    const { code, hostToken } = await newSession();
    const team = await (await join(code, "Quiz Pigs")).json();
    await advance(post(`/api/sessions/${code}/advance`, { action: "start", hostToken }), codeParams(code));
    expect((await submitAnswer(post(`/api/sessions/${code}/answers`, { token: team.token, text: "a1" }), codeParams(code))).status).toBe(201);
    const left = await leaveSession(post(`/api/sessions/${code}/leave`, { token: team.token }), codeParams(code));
    expect((await left.json()).removed).toBe(false);
    expect((await join(code, "Quiz Pigs")).status).toBe(409);
  });

  it("needs the team's own token", async () => {
    const { code } = await newSession();
    await join(code, "Quiz Pigs");
    const res = await leaveSession(post(`/api/sessions/${code}/leave`, { token: "not-a-token" }), codeParams(code));
    expect(res.status).toBe(401);
  });
});

describe("answers", () => {
  it("rejects an answer that is only whitespace", async () => {
    const { code, hostToken } = await newSession();
    const team = await (await join(code, "Quiz Pigs")).json();
    await advance(post(`/api/sessions/${code}/advance`, { action: "start", hostToken }), codeParams(code));
    const res = await submitAnswer(post(`/api/sessions/${code}/answers`, { token: team.token, text: "   " }), codeParams(code));
    expect(res.status).toBe(400);
  });
});
