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

/**
 * The host desk is not a private admin view. It goes on the pub's TV or a
 * projector and is laid out to be read from about four metres, so anything
 * the host payload carries is effectively published to the players.
 *
 * It used to carry every team's answer text and its correctness during
 * QUESTION_ACTIVE, which meant the first team to answer correctly put the
 * answer on the wall for everyone else — and, with resubmissions allowed,
 * the rest of the room could simply copy it before the reveal.
 *
 * The component stops rendering it, but the gate that matters is this one:
 * a screen cannot show what it was never sent.
 */
describe("the host payload withholds answers until the reveal", () => {
  let code: string;
  let hostToken: string;
  let teamToken: string;

  beforeAll(async () => {
    const pack = await (await createPack(jsonRequest(`${BASE}/api/packs/seed`, "POST"))).json();
    const created = await (
      await createSession(jsonRequest(`${BASE}/api/sessions`, "POST", { packId: pack.pack.id }))
    ).json();
    code = created.session.code;
    hostToken = created.hostToken;

    const joined = await (
      await joinSession(jsonRequest(`${BASE}/api/sessions/${code}/join`, "POST", { name: "Alpha" }), {
        params: Promise.resolve({ code }),
      })
    ).json();
    teamToken = joined.token;

    await advanceSession(jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action: "start", hostToken }), {
      params: Promise.resolve({ code }),
    });
    await submitAnswer(
      jsonRequest(`${BASE}/api/sessions/${code}/answers`, "POST", { token: teamToken, text: "Canberra" }),
      { params: Promise.resolve({ code }) }
    );
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function hostPayload() {
    const res = await getSession(new NextRequest(`${BASE}/api/sessions/${code}?as=host&hostToken=${hostToken}`), {
      params: Promise.resolve({ code }),
    });
    return res.json();
  }

  it("says the team has answered, and nothing else, while the question is open", async () => {
    const body = await hostPayload();
    const [team] = body.teams;

    // The host still needs to know who has answered — that is how they know
    // when to reveal.
    expect(team.currentAnswer).not.toBeNull();

    expect(team.currentAnswer.text).toBeNull();
    expect(team.currentAnswer.isCorrect).toBeNull();
    expect(team.currentAnswer.pointsAwarded).toBeNull();
    expect(team.currentAnswer.id).toBeNull();

    // Belt and braces: the correct answer must not be anywhere in the
    // response either, however the payload is reshaped later.
    expect(JSON.stringify(body)).not.toContain("Canberra");
  });

  it("releases all of it on the reveal", async () => {
    await advanceSession(
      jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action: "reveal", hostToken }),
      { params: Promise.resolve({ code }) }
    );

    const [team] = (await hostPayload()).teams;
    expect(team.currentAnswer.text).toBe("Canberra");
    expect(team.currentAnswer.isCorrect).toBe(true);
    expect(team.currentAnswer.pointsAwarded).toBe(1);
    // The override buttons need the id, and only get it now.
    expect(team.currentAnswer.id).toBeTruthy();
  });
});
