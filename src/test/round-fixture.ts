import { NextRequest } from "next/server";

import { POST as createPack } from "@/app/api/packs/seed/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { GET as getSession } from "@/app/api/sessions/[code]/route";
import { POST as joinSession } from "@/app/api/sessions/[code]/join/route";
import { POST as advanceSession } from "@/app/api/sessions/[code]/advance/route";
import { POST as submitAnswer } from "@/app/api/sessions/[code]/answers/route";
import type { TestHost } from "./auth-fixture";

/**
 * A round-mode game driven through the real routes, for the round-mode suites.
 *
 * The seeded demo pack has two rounds of three questions each. Round 1 is worth
 * 1 point a question (Canberra, Seven, Mars); round 2 is worth 2 (Leonardo
 * DiCaprio, Sony PlayStation, Spice Girls).
 */

const BASE = "http://localhost:3000";

export const ROUND_ANSWERS = [
  ["Canberra", "Seven", "Mars"],
  ["Leonardo DiCaprio", "Sony PlayStation", "Spice Girls"],
];

export function roundGame(host: TestHost) {
  function request(path: string, method: string, body?: unknown, withCookie = true) {
    return new NextRequest(`${BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(withCookie ? host.cookieHeader : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  return {
    request,

    async create(): Promise<{ code: string; hostToken: string; packId: string }> {
      const { pack } = await (await createPack(request("/api/packs/seed", "POST"))).json();
      const res = await createSession(request("/api/sessions", "POST", { packId: pack.id }));
      const { session, hostToken } = await res.json();
      return { code: session.code, hostToken, packId: pack.id };
    },

    advance(code: string, hostToken: string, action: string, extra: object = {}) {
      return advanceSession(request(`/api/sessions/${code}/advance`, "POST", { action, hostToken, ...extra }), {
        params: Promise.resolve({ code }),
      });
    },

    async join(code: string, name: string): Promise<string> {
      const res = await joinSession(request(`/api/sessions/${code}/join`, "POST", { name }, false), {
        params: Promise.resolve({ code }),
      });
      const body = await res.json();
      if (!body.token) throw new Error(`join failed: ${JSON.stringify(body)}`);
      return body.token;
    },

    answer(code: string, token: string, questionIndex: number, text: string) {
      return submitAnswer(request(`/api/sessions/${code}/answers`, "POST", { token, questionIndex, text }, false), {
        params: Promise.resolve({ code }),
      });
    },

    teamView(code: string, token: string) {
      return getSession(new NextRequest(`${BASE}/api/sessions/${code}?token=${encodeURIComponent(token)}`), {
        params: Promise.resolve({ code }),
      });
    },

    hostView(code: string, hostToken: string) {
      return getSession(
        new NextRequest(`${BASE}/api/sessions/${code}?as=host&hostToken=${encodeURIComponent(hostToken)}`),
        { params: Promise.resolve({ code }) }
      );
    },
  };
}
