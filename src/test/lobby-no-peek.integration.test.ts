import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as createSession } from "@/app/api/sessions/route";
import { POST as joinSession } from "@/app/api/sessions/[code]/join/route";
import { GET as readSession } from "@/app/api/sessions/[code]/route";
import { POST as advanceSession } from "@/app/api/sessions/[code]/advance/route";
import { createPackFromGenerated } from "@/lib/create-pack";
import { db } from "@/lib/db";
import { signInTestHost, type TestHost } from "./auth-fixture";

const BASE = "http://localhost:3000";
const codeParams = (code: string) => ({ params: Promise.resolve({ code }) });

const QUESTION = "What is the capital of Australia?";

/**
 * A team in the lobby cannot read question one (L2).
 *
 * A session's position starts at round 0, question 0, and the payload was built
 * from that position whatever the status — so a team that joined and waited could
 * read the first question, its options and its points before the host started the
 * quiz. Not by doing anything clever: the polling the join screen already does
 * returned it.
 */

let owner: TestHost;

function ownedRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(`${BASE}${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...owner.cookieHeader },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

afterAll(async () => {
  await db.$disconnect();
});

describe("GET /api/sessions/[code] in the lobby", () => {
  it("carries no question until the host starts the quiz", async () => {
    owner = await signInTestHost();
    const pack = await createPackFromGenerated(
      {
        title: `Lobby Peek Pack ${Math.random().toString(36).slice(2)}`,
        rounds: [
          {
            title: "Round One",
            category: "General Knowledge",
            questions: [
              { text: QUESTION, answer: "Canberra", points: 3, type: "TEXT" },
              { text: "Second question?", answer: "Second answer", points: 1, type: "TEXT" },
            ],
          },
        ],
      },
      "lobby peek fixture",
      owner.id
    );

    const created = await createSession(ownedRequest("/api/sessions", "POST", { packId: pack.id }));
    const { session, hostToken } = await created.json();
    const code = session.code as string;

    const joined = await joinSession(
      new NextRequest(`${BASE}/api/sessions/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.4.0.9" },
        body: JSON.stringify({ name: "Quiz Pigs" }),
      }),
      codeParams(code)
    );
    expect(joined.status).toBe(201);
    const { token } = await joined.json();

    // What the team's own polling returns while they wait.
    const lobby = await readSession(
      new NextRequest(`${BASE}/api/sessions/${code}?token=${encodeURIComponent(token)}`),
      codeParams(code)
    );
    expect(lobby.status).toBe(200);
    const lobbyBody = await lobby.json();

    expect(lobbyBody.status).toBe("LOBBY");
    expect(lobbyBody.question).toBeNull();
    // Nothing about it anywhere in the payload — not the text, not the answer,
    // not the points.
    expect(JSON.stringify(lobbyBody)).not.toContain(QUESTION);
    expect(JSON.stringify(lobbyBody)).not.toContain("Canberra");

    // And it arrives the moment the host starts, so nothing was lost.
    const started = await advanceSession(
      ownedRequest(`/api/sessions/${code}/advance`, "POST", { action: "start", hostToken }),
      codeParams(code)
    );
    expect(started.status).toBe(200);

    const playing = await readSession(
      new NextRequest(`${BASE}/api/sessions/${code}?token=${encodeURIComponent(token)}`),
      codeParams(code)
    );
    const playingBody = await playing.json();
    expect(playingBody.status).toBe("QUESTION_ACTIVE");
    expect(playingBody.question?.text).toBe(QUESTION);
    expect(playingBody.question?.points).toBe(3);
    // The answer still waits for the reveal — that guard is unchanged.
    expect(playingBody.question?.answer).toBeNull();
  });

  it("hides it from the host's own lobby view too", async () => {
    // The host desk shows "Waiting for teams" in the lobby and needs no question,
    // and this desk goes on a pub TV — so there is nothing to gain by sending it
    // and a room full of people who could read it.
    owner = await signInTestHost();
    const pack = await createPackFromGenerated(
      {
        title: `Lobby Peek Host ${Math.random().toString(36).slice(2)}`,
        rounds: [
          {
            title: "Round One",
            category: "General Knowledge",
            questions: [{ text: QUESTION, answer: "Canberra", points: 1, type: "TEXT" }],
          },
        ],
      },
      "lobby peek fixture",
      owner.id
    );
    const created = await createSession(ownedRequest("/api/sessions", "POST", { packId: pack.id }));
    const { session, hostToken } = await created.json();
    const code = session.code as string;

    const desk = await readSession(
      new NextRequest(`${BASE}/api/sessions/${code}?as=host&hostToken=${encodeURIComponent(hostToken)}`),
      codeParams(code)
    );
    const body = await desk.json();
    expect(body.status).toBe("LOBBY");
    expect(body.question).toBeNull();
  });
});
