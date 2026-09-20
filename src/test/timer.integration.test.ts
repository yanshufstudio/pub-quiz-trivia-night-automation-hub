import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as createPack } from "@/app/api/packs/seed/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { GET as getSession } from "@/app/api/sessions/[code]/route";
import { POST as joinSession } from "@/app/api/sessions/[code]/join/route";
import { POST as advanceSession } from "@/app/api/sessions/[code]/advance/route";
import { POST as submitAnswer } from "@/app/api/sessions/[code]/answers/route";
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

describe("per-question timer", () => {
  let packId: string;

  beforeAll(async () => {
    const res = await createPack(jsonRequest(`${BASE}/api/packs/seed`, "POST"));
    const data = await json(res);
    packId = data.pack.id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function newSession(questionDurationSeconds?: number | null) {
    const res = await createSession(
      jsonRequest(`${BASE}/api/sessions`, "POST", { packId, questionDurationSeconds })
    );
    const data = await json(res);
    return { code: data.session.code as string, hostToken: data.hostToken as string };
  }

  it("rejects an out-of-range duration", async () => {
    const tooLong = await createSession(
      jsonRequest(`${BASE}/api/sessions`, "POST", { packId, questionDurationSeconds: 10_000 })
    );
    expect(tooLong.status).toBe(400);

    const zero = await createSession(
      jsonRequest(`${BASE}/api/sessions`, "POST", { packId, questionDurationSeconds: 0 })
    );
    expect(zero.status).toBe(400);
  });

  it("exposes no timer when the host didn't set a duration", async () => {
    const { code, hostToken } = await newSession(null);
    await advanceSession(
      jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action: "start", hostToken }),
      { params: Promise.resolve({ code }) }
    );

    const view = await getSession(
      new NextRequest(`${BASE}/api/sessions/${code}?as=host&hostToken=${hostToken}`),
      { params: Promise.resolve({ code }) }
    );
    const data = await json(view);
    expect(data.status).toBe("QUESTION_ACTIVE");
    expect(data.timer).toBeNull();
  });

  it("stamps a fresh timer every time a question goes active", async () => {
    const { code, hostToken } = await newSession(30);
    await advanceSession(
      jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action: "start", hostToken }),
      { params: Promise.resolve({ code }) }
    );

    const view = await getSession(
      new NextRequest(`${BASE}/api/sessions/${code}?as=host&hostToken=${hostToken}`),
      { params: Promise.resolve({ code }) }
    );
    const data = await json(view);
    expect(data.timer).not.toBeNull();
    expect(data.timer.durationSeconds).toBe(30);
    expect(new Date(data.timer.startedAt).getTime()).toBeCloseTo(Date.now(), -2);
  });

  it("auto-reveals on the next poll once the timer runs out, and locks out a late submission", async () => {
    const { code, hostToken } = await newSession(20);
    const joinRes = await joinSession(
      jsonRequest(`${BASE}/api/sessions/${code}/join`, "POST", { name: "Quiz Pigs" }),
      { params: Promise.resolve({ code }) }
    );
    const { token } = await json(joinRes);

    await advanceSession(
      jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action: "start", hostToken }),
      { params: Promise.resolve({ code }) }
    );

    // Fast-forward past the deadline without a real 20s sleep: back-date
    // questionStartedAt directly, exactly as if the clock had moved on.
    const session = await db.session.findUniqueOrThrow({ where: { code } });
    await db.session.update({
      where: { id: session.id },
      data: { questionStartedAt: new Date(Date.now() - 21_000) },
    });

    const lateSubmit = await submitAnswer(
      jsonRequest(`${BASE}/api/sessions/${code}/answers`, "POST", { token, text: "Canberra" }),
      { params: Promise.resolve({ code }) }
    );
    expect(lateSubmit.status).toBe(409);

    const hostView = await getSession(
      new NextRequest(`${BASE}/api/sessions/${code}?as=host&hostToken=${hostToken}`),
      { params: Promise.resolve({ code }) }
    );
    const hostData = await json(hostView);
    expect(hostData.status).toBe("REVEAL");
    expect(hostData.question.answer).toBe("Canberra");
  });

  it("doesn't reveal twice when a manual reveal races an expired timer", async () => {
    const { code, hostToken } = await newSession(20);
    await advanceSession(
      jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action: "start", hostToken }),
      { params: Promise.resolve({ code }) }
    );

    const session = await db.session.findUniqueOrThrow({ where: { code } });
    await db.session.update({
      where: { id: session.id },
      data: { questionStartedAt: new Date(Date.now() - 21_000) },
    });

    // The host's manual reveal and a team's poll (which also runs the
    // auto-reveal check) racing shouldn't double-apply or error either side.
    const [manual, polled] = await Promise.all([
      advanceSession(
        jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action: "reveal", hostToken }),
        { params: Promise.resolve({ code }) }
      ),
      getSession(new NextRequest(`${BASE}/api/sessions/${code}?as=host&hostToken=${hostToken}`), {
        params: Promise.resolve({ code }),
      }),
    ]);
    expect([200, 409]).toContain(manual.status);
    expect(polled.status).toBe(200);
    const polledData = await json(polled);
    expect(polledData.status).toBe("REVEAL");
  });
});
