import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as createSession } from "@/app/api/sessions/route";
import { POST as joinSession } from "@/app/api/sessions/[code]/join/route";
import { createPackFromGenerated } from "@/lib/create-pack";
import { generateTeamToken } from "@/lib/codes";
import { db } from "@/lib/db";

const BASE = "http://localhost:3000";

/**
 * Hosting a session and joining one are the two writes that cannot be
 * authenticated: a pack id is public by design (the demo pack has no owner),
 * and a join code is printed on the table QR. Neither was bounded, so a
 * stranger could create sessions until the 5-character code space thinned
 * out, or fill a real quizmaster's scoreboard with junk teams mid-night.
 * These pin the ceilings that replaced "unlimited".
 */

// Each test poses as a different visitor: the per-IP limiter's in-memory
// bucket is shared across every test in this file.
function sessionRequest(packId: string, ip: string) {
  return new NextRequest(`${BASE}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ packId }),
  });
}

function joinRequest(code: string, name: string, ip: string) {
  return new NextRequest(`${BASE}/api/sessions/${code}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ name }),
  });
}

const codeParams = (code: string) => ({ params: Promise.resolve({ code }) });

async function testPack() {
  return createPackFromGenerated(
    {
      title: `Session Limits ${Math.random().toString(36).slice(2)}`,
      rounds: [
        {
          title: "Round A",
          category: "General",
          questions: [{ text: "A1?", answer: "a1", points: 1, type: "TEXT" as const }],
        },
      ],
    },
    "session limits test",
    null
  );
}

async function newSessionCode(packId: string, ip: string) {
  const res = await createSession(sessionRequest(packId, ip));
  expect(res.status).toBe(201);
  const data = await res.json();
  return data.session.code as string;
}

describe("POST /api/sessions — unauthenticated but bounded", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("still lets any visitor host a session from a pack they do not own", async () => {
    const pack = await testPack();
    const res = await createSession(sessionRequest(pack.id, "10.20.0.1"));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.hostToken).toBeTruthy();
  });

  it("429s a scripted loop once the per-IP ceiling is reached", async () => {
    const pack = await testPack();
    const ip = "10.20.0.2";

    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      statuses.push((await createSession(sessionRequest(pack.id, ip))).status);
    }

    expect(statuses.filter((s) => s === 201)).toHaveLength(30);
    const limited = statuses[statuses.length - 1];
    expect(limited).toBe(429);
  });

  it("does not count another visitor's requests against a fresh IP", async () => {
    const pack = await testPack();
    const res = await createSession(sessionRequest(pack.id, "10.20.0.3"));
    expect(res.status).toBe(201);
  });
});

describe("POST /api/sessions/[code]/join — team cap", () => {
  it("lets teams join normally well under the cap", async () => {
    const pack = await testPack();
    const code = await newSessionCode(pack.id, "10.21.0.1");

    const res = await joinSession(joinRequest(code, "The Quizzly Bears", "10.21.0.1"), codeParams(code));
    expect(res.status).toBe(201);
    expect((await res.json()).teamName).toBe("The Quizzly Bears");
  });

  // Seeded directly rather than through 60 requests: the cap is a property of
  // the session, and going through the route would tangle it with the
  // separate per-IP limiter under test above.
  it("409s once the session holds the maximum number of teams", async () => {
    const pack = await testPack();
    const code = await newSessionCode(pack.id, "10.21.0.2");
    const session = await db.session.findUniqueOrThrow({ where: { code } });

    await db.team.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({
        sessionId: session.id,
        name: `Filler ${i}`,
        token: generateTeamToken(),
      })),
    });

    const res = await joinSession(joinRequest(code, "One Too Many", "10.21.0.2"), codeParams(code));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/full/i);
    expect(await db.team.count({ where: { sessionId: session.id } })).toBe(60);
  });

  // The cap is what actually bounds the damage: an attacker who rotates IPs
  // walks straight past a per-IP rate limit, and must still hit this.
  it("holds against a caller coming from a different IP", async () => {
    const pack = await testPack();
    const code = await newSessionCode(pack.id, "10.21.0.3");
    const session = await db.session.findUniqueOrThrow({ where: { code } });

    await db.team.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({
        sessionId: session.id,
        name: `Filler ${i}`,
        token: generateTeamToken(),
      })),
    });

    const res = await joinSession(joinRequest(code, "Sneaky", "203.0.113.99"), codeParams(code));
    expect(res.status).toBe(409);
  });

  it("429s a scripted join loop from one address", async () => {
    const pack = await testPack();
    const code = await newSessionCode(pack.id, "10.21.0.4");
    const ip = "10.21.0.4";

    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) {
      statuses.push((await joinSession(joinRequest(code, `Flood ${i}`, ip), codeParams(code))).status);
    }

    expect(statuses[statuses.length - 1]).toBe(429);
  });
});
