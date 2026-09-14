import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as createPack } from "@/app/api/packs/seed/route";
import { POST as generatePack } from "@/app/api/packs/generate/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { POST as joinSession } from "@/app/api/sessions/[code]/join/route";
import { POST as advanceSession } from "@/app/api/sessions/[code]/advance/route";
import { POST as submitAnswer } from "@/app/api/sessions/[code]/answers/route";
import { db } from "@/lib/db";

const BASE = "http://localhost:3000";

function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json(res: Response) {
  return res.json();
}

describe("POST /api/packs/generate — input validation and unconfigured-key path", () => {
  // The "not configured" path is what every request below should hit once it
  // gets past validation. Stubbed rather than assumed: this used to rely on
  // ANTHROPIC_API_KEY happening to be absent from the ambient environment,
  // so on a developer machine (or CI) that has one set, the suite failed —
  // and, worse, spent a real API call to do it.
  beforeEach(() => vi.stubEnv("ANTHROPIC_API_KEY", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("rejects an empty prompt before ever reaching the AI call", async () => {
    const res = await generatePack(jsonRequest(`${BASE}/api/packs/generate`, "POST", { prompt: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects a whitespace-only prompt", async () => {
    const res = await generatePack(
      jsonRequest(`${BASE}/api/packs/generate`, "POST", { prompt: "   \n\t  " })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a prompt over 2000 characters", async () => {
    const res = await generatePack(
      jsonRequest(`${BASE}/api/packs/generate`, "POST", { prompt: "a".repeat(2001) })
    );
    expect(res.status).toBe(400);
  });

  it("returns a specific, actionable 503 (not the generic 502) when no API key is configured", async () => {
    const res = await generatePack(
      jsonRequest(`${BASE}/api/packs/generate`, "POST", { prompt: "Four rounds of trivia" })
    );
    expect(res.status).toBe(503);
    const data = await json(res);
    expect(data.error).toMatch(/ANTHROPIC_API_KEY/);
    expect(data.error).toMatch(/demo pack/);
  });
});

describe("session edge cases", () => {
  let packId: string;

  beforeAll(async () => {
    const res = await createPack(jsonRequest(`${BASE}/api/packs/seed`, "POST"));
    const data = await json(res);
    packId = data.pack.id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function newSession() {
    const res = await createSession(jsonRequest(`${BASE}/api/sessions`, "POST", { packId }));
    const data = await json(res);
    return { code: data.session.code as string, hostToken: data.hostToken as string };
  }

  async function advance(code: string, hostToken: string, action: "start" | "reveal" | "next") {
    return advanceSession(
      jsonRequest(`${BASE}/api/sessions/${code}/advance`, "POST", { action, hostToken }),
      { params: Promise.resolve({ code }) }
    );
  }

  it("rejects a second answer submission once the host has revealed", async () => {
    const { code, hostToken } = await newSession();
    const joinRes = await joinSession(
      jsonRequest(`${BASE}/api/sessions/${code}/join`, "POST", { name: "Quiz Pigs" }),
      { params: Promise.resolve({ code }) }
    );
    const { token } = await json(joinRes);

    await advance(code, hostToken, "start");
    const firstSubmit = await submitAnswer(
      jsonRequest(`${BASE}/api/sessions/${code}/answers`, "POST", { token, text: "Canberra" }),
      { params: Promise.resolve({ code }) }
    );
    expect(firstSubmit.status).toBe(201);

    await advance(code, hostToken, "reveal");

    const secondSubmit = await submitAnswer(
      jsonRequest(`${BASE}/api/sessions/${code}/answers`, "POST", { token, text: "a change of heart" }),
      { params: Promise.resolve({ code }) }
    );
    expect(secondSubmit.status).toBe(409);
  });

  it("still allows a team to join mid-game (after start, before end)", async () => {
    const { code, hostToken } = await newSession();
    await advance(code, hostToken, "start");

    const res = await joinSession(
      jsonRequest(`${BASE}/api/sessions/${code}/join`, "POST", { name: "Latecomers" }),
      { params: Promise.resolve({ code }) }
    );
    expect(res.status).toBe(201);
  });

  it("rejects joining a session that has already ended", async () => {
    const { code, hostToken } = await newSession();
    await joinSession(jsonRequest(`${BASE}/api/sessions/${code}/join`, "POST", { name: "On Time" }), {
      params: Promise.resolve({ code }),
    });

    await advance(code, hostToken, "start");
    // Walk the demo pack's 6 questions to ENDED.
    for (let i = 0; i < 6; i++) {
      await advance(code, hostToken, "reveal");
      await advance(code, hostToken, "next");
    }

    const res = await joinSession(
      jsonRequest(`${BASE}/api/sessions/${code}/join`, "POST", { name: "Too Late" }),
      { params: Promise.resolve({ code }) }
    );
    expect(res.status).toBe(409);
    const data = await json(res);
    expect(data.error).toMatch(/already ended/);
  });

  it("rejects a whitespace-only team name instead of silently creating a blank-named team", async () => {
    const { code } = await newSession();
    const res = await joinSession(
      jsonRequest(`${BASE}/api/sessions/${code}/join`, "POST", { name: "   " }),
      { params: Promise.resolve({ code }) }
    );
    expect(res.status).toBe(400);
  });
});
