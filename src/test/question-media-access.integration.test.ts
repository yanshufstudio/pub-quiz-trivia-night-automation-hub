import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET as getMedia, POST as uploadMedia } from "@/app/api/questions/[id]/media/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { POST as joinSession } from "@/app/api/sessions/[code]/join/route";
import { POST as advanceSession } from "@/app/api/sessions/[code]/advance/route";
import { createPackFromGenerated } from "@/lib/create-pack";
import { db } from "@/lib/db";
import { questionMediaUrl } from "@/lib/question-media-url";
import { realPngBytes } from "./image-fixtures";
import { signInTestHost, type TestHost } from "./auth-fixture";

/**
 * Who may fetch a question's image.
 *
 * This route was the last read in the app that took no credential: a question
 * id was the whole lock. A picture round is exactly the kind of thing a rival
 * quizmaster would take, so it now answers only two callers — a live
 * session's current viewers, and a host who may read the pack — and answers
 * everyone else exactly as it answers a question that has no image.
 */

const BASE = "http://localhost:3000";
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const codeParams = (code: string) => ({ params: Promise.resolve({ code }) });

function get(url: string, cookie?: string) {
  return new NextRequest(`${BASE}${url}`, { headers: cookie ? { cookie } : {} });
}

function json(url: string, body: unknown, cookie?: string) {
  return new NextRequest(`${BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

/** Two rounds of two questions, with an image on the very first one. */
async function packWithAnImage(owner: TestHost | null) {
  const pack = await createPackFromGenerated(
    {
      title: `Media Access ${Math.random().toString(36).slice(2)}`,
      rounds: [
        {
          title: "Round A",
          category: "Pictures",
          questions: [
            { text: "What is this?", answer: "a1", points: 1, type: "TEXT" as const },
            { text: "And this?", answer: "a2", points: 1, type: "TEXT" as const },
          ],
        },
        {
          title: "Round B",
          category: "Pictures",
          questions: [{ text: "Later round", answer: "b1", points: 1, type: "TEXT" as const }],
        },
      ],
    },
    "media access test",
    owner?.id ?? null
  );

  const first = pack.rounds[0].questions[0].id;
  const second = pack.rounds[0].questions[1].id;
  const laterRound = pack.rounds[1].questions[0].id;

  // Uploaded through the real route, as the owner. An ownerless pack has no
  // owner to upload for, so those fixtures get their image written directly.
  const bytes = await realPngBytes(64, 48);
  if (owner) {
    const res = await uploadMedia(
      new NextRequest(`${BASE}/api/questions/${first}/media`, {
        method: "POST",
        headers: { cookie: owner.cookie },
        body: new Uint8Array(bytes),
      }),
      params(first)
    );
    if (res.status !== 201) throw new Error(`fixture upload failed: ${res.status} ${await res.text()}`);
  } else {
    await db.questionMedia.create({
      data: { questionId: first, mime: "image/png", bytes: new Uint8Array(bytes), byteSize: bytes.length, width: 64, height: 48 },
    });
  }

  // The later questions carry an image too, so "not the current question"
  // cannot pass merely because there is nothing there to serve.
  for (const id of [second, laterRound]) {
    await db.questionMedia.create({
      data: { questionId: id, mime: "image/png", bytes: new Uint8Array(bytes), byteSize: bytes.length, width: 64, height: 48 },
    });
  }

  return { pack, first, second, laterRound };
}

/** A live session on `packId`, started, with one team joined. */
async function liveSession(host: TestHost, packId: string) {
  const created = await createSession(json("/api/sessions", { packId }, host.cookie));
  if (created.status !== 201) throw new Error(`session create failed: ${created.status}`);
  const { session, hostToken } = await created.json();

  const joined = await joinSession(
    json(`/api/sessions/${session.code}/join`, { name: `Team ${Math.random().toString(36).slice(2)}` }),
    codeParams(session.code)
  );
  if (!joined.ok) throw new Error(`join failed: ${joined.status}`);
  const { token } = await joined.json();

  // Advancing is host-gated on a session *and* on the per-session key, so
  // the cookie goes with it.
  const started = await advanceSession(
    json(`/api/sessions/${session.code}/advance`, { action: "start", hostToken }, host.cookie),
    codeParams(session.code)
  );
  if (!started.ok) throw new Error(`start failed: ${started.status} ${await started.text()}`);

  return { code: session.code as string, hostToken: hostToken as string, token: token as string };
}

const owner = await signInTestHost();
const stranger = await signInTestHost();
const fixture = await packWithAnImage(owner);
const live = await liveSession(owner, fixture.pack.id);

describe("a question's image is not served to whoever holds the id", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("serves the pack's owner, on their session cookie", async () => {
    const res = await getMedia(get(questionMediaUrl(fixture.first), owner.cookie), params(fixture.first));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });

  it("serves a team holding a token for the session, on the current question", async () => {
    const url = questionMediaUrl(fixture.first, { code: live.code, token: live.token });
    const res = await getMedia(get(url), params(fixture.first));
    expect(res.status).toBe(200);
  });

  it("serves the desk holding the session's host key", async () => {
    const url = questionMediaUrl(fixture.first, { code: live.code, hostToken: live.hostToken });
    const res = await getMedia(get(url), params(fixture.first));
    expect(res.status).toBe(200);
  });

  it("refuses a caller with nothing at all", async () => {
    const res = await getMedia(get(questionMediaUrl(fixture.first)), params(fixture.first));
    expect(res.status).toBe(404);
  });

  it("refuses another signed-in host, exactly as a question with no image does", async () => {
    const [notMine, noImage] = await Promise.all([
      getMedia(get(questionMediaUrl(fixture.first), stranger.cookie), params(fixture.first)),
      // A real question of the stranger's own, with no image on it.
      (async () => {
        const theirs = await packWithAnImage(stranger);
        await db.questionMedia.deleteMany({ where: { questionId: theirs.first } });
        return getMedia(get(questionMediaUrl(theirs.first), stranger.cookie), params(theirs.first));
      })(),
    ]);

    expect(notMine.status).toBe(404);
    expect(noImage.status).toBe(404);
    expect(notMine.headers.get("content-type")).toBe(noImage.headers.get("content-type"));
    expect(await notMine.text()).toBe(await noImage.text());
  });

  it("refuses a made-up team token, and a token from another session", async () => {
    const other = await packWithAnImage(stranger);
    const elsewhere = await liveSession(stranger, other.pack.id);

    for (const token of ["not-a-real-token", "", elsewhere.token]) {
      const url = questionMediaUrl(fixture.first, { code: live.code, token });
      const res = await getMedia(get(url), params(fixture.first));
      expect(res.status, `token ${JSON.stringify(token)}`).toBe(404);
    }
  });

  it("refuses a real team token pointed at a question that is not the current one", async () => {
    // The leak this exists to close: a team in round one reading round
    // four's picture round. Both of these carry an image, so the 404 is the
    // gate talking and not an empty row.
    for (const id of [fixture.second, fixture.laterRound]) {
      const url = questionMediaUrl(id, { code: live.code, token: live.token });
      const res = await getMedia(get(url), params(id));
      expect(res.status).toBe(404);
    }
  });

  it("follows the host from one question to the next", async () => {
    // The behaviour a quiz actually depends on, and the one a stricter gate
    // would most easily break.
    const before = await getMedia(
      get(questionMediaUrl(fixture.first, { code: live.code, token: live.token })),
      params(fixture.first)
    );
    expect(before.status).toBe(200);

    const revealedStep = await advanceSession(
      json(`/api/sessions/${live.code}/advance`, { action: "reveal", hostToken: live.hostToken }, owner.cookie),
      codeParams(live.code)
    );
    expect(revealedStep.status, await revealedStep.text()).toBe(200);
    // Revealing does not move the question, so the image must still serve.
    const revealed = await getMedia(
      get(questionMediaUrl(fixture.first, { code: live.code, token: live.token })),
      params(fixture.first)
    );
    expect(revealed.status).toBe(200);

    const advanced = await advanceSession(
      json(`/api/sessions/${live.code}/advance`, { action: "next", hostToken: live.hostToken }, owner.cookie),
      codeParams(live.code)
    );
    expect(advanced.status, await advanced.text()).toBe(200);

    const after = await getMedia(
      get(questionMediaUrl(fixture.first, { code: live.code, token: live.token })),
      params(fixture.first)
    );
    const next = await getMedia(
      get(questionMediaUrl(fixture.second, { code: live.code, token: live.token })),
      params(fixture.second)
    );
    expect(after.status).toBe(404);
    expect(next.status).toBe(200);
  });

  it("serves a team the first question's image before the host starts", async () => {
    // Stated rather than left to be discovered: GET /api/sessions/[code]
    // already puts the current question's *text* in a team's payload while
    // the session is still in the lobby, so withholding its image there
    // would guard nothing and would only be one more state to get wrong.
    const lobby = await packWithAnImage(owner);
    const created = await createSession(json("/api/sessions", { packId: lobby.pack.id }, owner.cookie));
    const { session } = await created.json();
    const joined = await joinSession(
      json(`/api/sessions/${session.code}/join`, { name: `Early ${Math.random().toString(36).slice(2)}` }),
      codeParams(session.code)
    );
    const { token } = await joined.json();

    const inLobby = await db.session.findUniqueOrThrow({ where: { code: session.code } });
    expect(inLobby.status).toBe("LOBBY");

    const res = await getMedia(
      get(questionMediaUrl(lobby.first, { code: session.code, token })),
      params(lobby.first)
    );
    expect(res.status).toBe(200);
  });

  it("serves the ownerless demo pack to any signed-in host", async () => {
    const demo = await packWithAnImage(null);
    const res = await getMedia(get(questionMediaUrl(demo.first), stranger.cookie), params(demo.first));
    expect(res.status).toBe(200);
  });
});
