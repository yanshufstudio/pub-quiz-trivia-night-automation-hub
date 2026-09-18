import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as createPack } from "@/app/api/packs/seed/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { POST as joinSession } from "@/app/api/sessions/[code]/join/route";
import { POST as advanceSession } from "@/app/api/sessions/[code]/advance/route";
import { POST as submitAnswer } from "@/app/api/sessions/[code]/answers/route";
import { ANSWER_SUBMISSIONS_PER_QUESTION } from "@/lib/session-state";
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
 * A team could resubmit without limit. The scoreboard fix removes what that
 * bought a cheat (see scoreboard-oracle.integration.test.ts); this bounds the
 * writes one team can aim at a single question either way.
 *
 * The two boundaries are what matter, and both are easy to get wrong: the
 * allowance is per *team* (every team in a pub shares one public IP, so an
 * IP-keyed bucket would have the first team to answer throttle the room) and
 * per *question* (a new question is a clean slate, not a continuation).
 */
describe("answer submissions are capped per team per question", () => {
  let code: string;
  let hostToken: string;
  let alpha: string;
  let beta: string;

  async function submit(token: string, text: string) {
    return submitAnswer(jsonRequest(`${BASE}/api/sessions/${code}/answers`, "POST", { token, text }), {
      params: Promise.resolve({ code }),
    });
  }

  async function join(name: string) {
    const res = await joinSession(jsonRequest(`${BASE}/api/sessions/${code}/join`, "POST", { name }), {
      params: Promise.resolve({ code }),
    });
    return (await res.json()).token as string;
  }

  beforeAll(async () => {
    const pack = await (await createPack(jsonRequest(`${BASE}/api/packs/seed`, "POST"))).json();
    const created = await (
      await createSession(jsonRequest(`${BASE}/api/sessions`, "POST", { packId: pack.pack.id }))
    ).json();
    code = created.session.code;
    hostToken = created.hostToken;
    alpha = await join("Alpha");
    beta = await join("Beta");
    await advanceSession(jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action: "start", hostToken }), {
      params: Promise.resolve({ code }),
    });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("accepts the allowance and refuses the one after it", async () => {
    for (let i = 0; i < ANSWER_SUBMISSIONS_PER_QUESTION; i++) {
      const res = await submit(alpha, `Guess ${i}`);
      expect(res.status).toBe(201);
    }

    const refused = await submit(alpha, "One too many");
    expect(refused.status).toBe(429);
    expect(refused.headers.get("Retry-After")).toBeTruthy();

    // Refused means not recorded: the last accepted answer still stands.
    const stored = await db.answer.findFirst({
      where: { roundIndex: 0, questionIndex: 0, team: { token: alpha } },
    });
    expect(stored?.text).toBe(`Guess ${ANSWER_SUBMISSIONS_PER_QUESTION - 1}`);
  });

  it("leaves the other teams in the room their full allowance", async () => {
    // Same session, same question, same IP — and Alpha is already cut off.
    const res = await submit(beta, "Canberra");
    expect(res.status).toBe(201);
  });

  it("gives the capped team a fresh allowance on the next question", async () => {
    for (const action of ["reveal", "next"] as const) {
      await advanceSession(jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action, hostToken }), {
        params: Promise.resolve({ code }),
      });
    }

    const res = await submit(alpha, "Seven");
    expect(res.status).toBe(201);
  });
});
