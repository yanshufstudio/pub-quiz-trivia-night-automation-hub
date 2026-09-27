import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as createSession } from "@/app/api/sessions/route";
import { GET as getHostKey } from "@/app/api/sessions/[code]/host-key/route";
import { POST as advanceSession } from "@/app/api/sessions/[code]/advance/route";

import { createPackFromGenerated } from "@/lib/create-pack";
import { db } from "@/lib/db";
import { SESSION_STATUS } from "@/lib/session-state";
import { signInTestHost, type TestHost } from "./auth-fixture";

const BASE = "http://localhost:3000";
const codeParams = (code: string) => ({ params: Promise.resolve({ code }) });

/**
 * A creator can get back into a game they started (H4).
 *
 * The host key is generated once, returned once by POST /api/sessions, and
 * written to one browser's local storage — shown on no screen. A host who
 * closed that browser or picked up a different device was asked by their own
 * desk to paste a key they had never seen. This route is the way back, and the
 * tests below are mostly about who it must *not* let in.
 */

let owner: TestHost;

function requestAs(host: TestHost, url: string, method = "GET", body?: unknown) {
  return new NextRequest(`${BASE}${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...host.cookieHeader },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function makePack(creatorId: string) {
  return createPackFromGenerated(
    {
      title: `Host Key Pack ${Math.random().toString(36).slice(2)}`,
      rounds: [
        {
          title: "Round One",
          category: "General Knowledge",
          questions: [{ text: "Q1?", answer: "A1", points: 1, type: "TEXT" }],
        },
      ],
    },
    "host key fixture",
    creatorId
  );
}

async function startSession(host: TestHost, packId: string) {
  const res = await createSession(requestAs(host, "/api/sessions", "POST", { packId }));
  expect(res.status).toBe(201);
  const body = await res.json();
  return { code: body.session.code as string, hostToken: body.hostToken as string };
}

describe("a session records who started it", () => {
  beforeEach(async () => {
    owner = await signInTestHost();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("stamps the starting creator on the row", async () => {
    const pack = await makePack(owner.id);
    const { code } = await startSession(owner, pack.id);

    const session = await db.session.findUniqueOrThrow({ where: { code } });
    expect(session.creatorId).toBe(owner.id);
  });

  it("still keeps the host key out of the creation response's session object", async () => {
    // The key comes back once, at the top level. It must not also be sitting
    // inside the session payload, which is the shape other reads echo.
    const pack = await makePack(owner.id);
    const res = await createSession(requestAs(owner, "/api/sessions", "POST", { packId: pack.id }));
    const body = await res.json();

    expect(body.hostToken).toBeTruthy();
    expect(body.session.hostToken).toBeUndefined();
    expect(body.session.creatorId).toBeUndefined();
  });
});

describe("GET /api/sessions/[code]/host-key", () => {
  beforeEach(async () => {
    owner = await signInTestHost();
  });

  it("hands the creator who started the game their own key back", async () => {
    const pack = await makePack(owner.id);
    const { code, hostToken } = await startSession(owner, pack.id);

    const res = await getHostKey(requestAs(owner, `/api/sessions/${code}/host-key`), codeParams(code));

    expect(res.status).toBe(200);
    expect((await res.json()).hostToken).toBe(hostToken);
  });

  it("returns a key that actually drives the session", async () => {
    // A key that comes back but does not work would be a worse failure than no
    // key at all, so the recovered one is used for real.
    const pack = await makePack(owner.id);
    const { code } = await startSession(owner, pack.id);

    const recovered = (
      await (await getHostKey(requestAs(owner, `/api/sessions/${code}/host-key`), codeParams(code))).json()
    ).hostToken as string;

    const ended = await advanceSession(
      requestAs(owner, `/api/sessions/${code}/advance`, "POST", { action: "end", hostToken: recovered }),
      codeParams(code)
    );
    expect(ended.status).toBe(200);
    expect((await db.session.findUniqueOrThrow({ where: { code } })).status).toBe(SESSION_STATUS.ENDED);
  });

  it("refuses another signed-in host, as if the session did not exist", async () => {
    const pack = await makePack(owner.id);
    const { code } = await startSession(owner, pack.id);
    const stranger = await signInTestHost();

    const res = await getHostKey(requestAs(stranger, `/api/sessions/${code}/host-key`), codeParams(code));

    expect(res.status).toBe(404);
    expect((await res.json()).hostToken).toBeUndefined();
  });

  it("refuses a session started before the column existed", async () => {
    // Rows written before this migration have creatorId null. Null must never
    // match a creator — "no owner recorded" is not "owned by whoever asks".
    const pack = await makePack(owner.id);
    const { code } = await startSession(owner, pack.id);
    await db.session.update({ where: { code }, data: { creatorId: null } });

    const res = await getHostKey(requestAs(owner, `/api/sessions/${code}/host-key`), codeParams(code));
    expect(res.status).toBe(404);
  });

  it("refuses a caller with no account at all", async () => {
    const pack = await makePack(owner.id);
    const { code } = await startSession(owner, pack.id);

    const res = await getHostKey(
      new NextRequest(`${BASE}/api/sessions/${code}/host-key`),
      codeParams(code)
    );
    expect(res.status).toBe(401);
  });

  it("answers the same way for a code that was never issued", async () => {
    const res = await getHostKey(requestAs(owner, "/api/sessions/ZZZZZ/host-key"), codeParams("ZZZZZ"));
    expect(res.status).toBe(404);
  });

  it("is case-insensitive about the code, as every other session route is", async () => {
    const pack = await makePack(owner.id);
    const { code, hostToken } = await startSession(owner, pack.id);

    const res = await getHostKey(
      requestAs(owner, `/api/sessions/${code.toLowerCase()}/host-key`),
      codeParams(code.toLowerCase())
    );
    expect(res.status).toBe(200);
    expect((await res.json()).hostToken).toBe(hostToken);
  });
});
