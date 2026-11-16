import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as createSession } from "@/app/api/sessions/route";
import { POST as joinSession } from "@/app/api/sessions/[code]/join/route";
import { POST as addPaperTeam } from "@/app/api/sessions/[code]/teams/route";
import { POST as leaveSession } from "@/app/api/sessions/[code]/leave/route";
import { POST as advance } from "@/app/api/sessions/[code]/advance/route";
import { POST as submitAnswer } from "@/app/api/sessions/[code]/answers/route";
import { createPackFromGenerated } from "@/lib/create-pack";
import { db } from "@/lib/db";
import { MAX_TEAMS_PER_SESSION } from "@/lib/team-name";
import { signInTestHost } from "./auth-fixture";
import { switchToQuestionMode } from "./question-mode-fixture";

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

// The host account that starts the sessions these teams play in. Every
// `post` below carries NO session cookie, on purpose: teams do not sign in,
// and this file is the standing proof of it.
const host = await signInTestHost();

function post(path: string, body: unknown) {
  return new NextRequest(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip() },
    body: JSON.stringify(body),
  });
}

/** The same, from the signed-in host — for the two routes that need one. */
function hostPost(path: string, body: unknown) {
  return new NextRequest(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip(), ...host.cookieHeader },
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
  const res = await createSession(hostPost("/api/sessions", { packId: pack.id }));
  const data = await res.json();
  await switchToQuestionMode(data.session.code);
  return { code: data.session.code as string, hostToken: data.hostToken as string };
}

const join = (code: string, name: string) => joinSession(post(`/api/sessions/${code}/join`, { name }), codeParams(code));
const addPaper = (code: string, hostToken: string, name: string) =>
  addPaperTeam(hostPost(`/api/sessions/${code}/teams`, { hostToken, name }), codeParams(code));

/**
 * Holds back each route's read of the team list for a moment. Locally the
 * database answers so fast that requests sent together rarely overlap; held
 * like this, every one reads the list before any of them writes, which is the
 * busy start of a night these tests guard against.
 */
function holdTeamListReads() {
  const findMany = db.team.findMany.bind(db.team);
  return vi.spyOn(db.team, "findMany").mockImplementation(((args: Parameters<typeof findMany>[0]) =>
    findMany(args).then((rows) => new Promise((resolve) => setTimeout(() => resolve(rows), 50)))) as never);
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** Fills a game to `count` teams without going through a route. */
async function seedTeams(code: string, count: number) {
  const session = await db.session.findUniqueOrThrow({ where: { code } });
  await db.team.createMany({
    data: Array.from({ length: count }, (_, i) => ({ sessionId: session.id, name: `Seeded ${i}`, token: `seeded-${code}-${i}` })),
  });
  return session;
}

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

describe("joins that arrive at the same moment (M3)", () => {
  it("gives one of two tables the name and tells the other it is taken, not a 500", async () => {
    // Both pass the "is it taken?" read; the unique index refuses the second
    // insert, which used to escape the route as an unhandled error.
    const { code } = await newSession();
    const results = await Promise.all([join(code, "Quiz Pigs"), join(code, "Quiz Pigs")]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    const refused = results.find((res) => res.status === 409)!;
    expect((await refused.json()).error).toMatch(/already taken/);
    expect(await db.team.count({ where: { session: { code } } })).toBe(1);
  });

  it("lets only one in when the two spell the name in different case", async () => {
    // The unique index is exact, so it does not catch this pair; the route does.
    const { code } = await newSession();
    const results = await Promise.all([join(code, "Quiz Pigs"), join(code, "quiz pigs"), join(code, "QUIZ  PIGS")]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409, 409]);
    for (const res of results.filter((r) => r.status === 409)) {
      expect((await res.json()).error).toMatch(/already taken/);
    }
    expect(await db.team.count({ where: { session: { code } } })).toBe(1);
  });

  it("never lets a rush of joins take the game past the team cap", async () => {
    // Six at once with two places left. All six used to read "58 teams" and
    // get in, leaving 64.
    const { code } = await newSession();
    const session = await db.session.findUniqueOrThrow({ where: { code } });
    await db.team.createMany({
      data: Array.from({ length: MAX_TEAMS_PER_SESSION - 2 }, (_, i) => ({
        sessionId: session.id,
        name: `Seeded ${i}`,
        token: `seeded-${code}-${i}`,
      })),
    });

    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => join(code, `Late ${i}`)));
    const statuses = results.map((res) => res.status).sort();
    expect(statuses).toEqual([201, 201, 409, 409, 409, 409]);
    for (const res of results.filter((r) => r.status === 409)) {
      expect((await res.json()).error).toMatch(/full/);
    }
    expect(await db.team.count({ where: { sessionId: session.id } })).toBe(MAX_TEAMS_PER_SESSION);

    // The two that got in are really in: their tokens are the ones stored.
    for (const res of results.filter((r) => r.status === 201)) {
      const { token } = await res.json();
      expect(await db.team.count({ where: { token } })).toBe(1);
    }
  });
});

describe("paper teams the host adds while phones join (M3)", () => {
  it("never takes the game past the cap, and answers a friendly 409 rather than a 500", async () => {
    // The host's "add paper team" had the same count-then-insert gap as the
    // join route: six at once with two places left all got in.
    const { code, hostToken } = await newSession();
    const session = await seedTeams(code, MAX_TEAMS_PER_SESSION - 2);

    const held = holdTeamListReads();
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => addPaper(code, hostToken, `Paper ${i}`)));
    held.mockRestore();
    const statuses = results.map((res) => res.status).sort();
    expect(statuses).toEqual([201, 201, 409, 409, 409, 409]);
    for (const res of results.filter((r) => r.status === 409)) {
      expect((await res.json()).error).toMatch(/maximum number of teams/);
    }
    expect(await db.team.count({ where: { sessionId: session.id } })).toBe(MAX_TEAMS_PER_SESSION);
  });

  it("gives one name to one table when a paper team and a phone pick it at once", async () => {
    const { code, hostToken } = await newSession();
    const held = holdTeamListReads();
    const results = await Promise.all([addPaper(code, hostToken, "The Pencils"), join(code, "The Pencils")]);
    held.mockRestore();
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    const refused = results.find((res) => res.status === 409)!;
    expect((await refused.json()).error).toMatch(/already taken/);
    expect(await db.team.count({ where: { session: { code } } })).toBe(1);
  });
});

describe("a team over the cap is never on the board (review low 6)", () => {
  it("is not visible to a reader even while it is being refused", async () => {
    // The cap used to be an insert, then a separate delete: a TV or host poll
    // in between saw 61 teams, and the TV's two-second cache kept them.
    const { code } = await newSession();
    const session = await seedTeams(code, MAX_TEAMS_PER_SESSION - 1);

    let done = false;
    let most = 0;
    const watch = (async () => {
      while (!done) {
        most = Math.max(most, await db.team.count({ where: { sessionId: session.id } }));
        // A local database answers without leaving the microtask queue, so
        // without this the joins would never get a turn.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    })();
    const held = holdTeamListReads();
    // And hold the name check that runs after the insert, which is where the
    // old insert-then-delete left the extra teams standing.
    const queryRaw = db.$queryRaw.bind(db);
    vi.spyOn(db, "$queryRaw").mockImplementation(((...args: Parameters<typeof queryRaw>) =>
      queryRaw(...args).then((rows) => new Promise((resolve) => setTimeout(() => resolve(rows), 50)))) as never);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => join(code, `Rush ${i}`)));
    held.mockRestore();
    done = true;
    await watch;

    expect(results.filter((res) => res.status === 201)).toHaveLength(1);
    expect(most).toBeLessThanOrEqual(MAX_TEAMS_PER_SESSION);
    expect(await db.team.count({ where: { sessionId: session.id } })).toBe(MAX_TEAMS_PER_SESSION);
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
    await advance(hostPost(`/api/sessions/${code}/advance`, { action: "start", hostToken }), codeParams(code));
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
    await advance(hostPost(`/api/sessions/${code}/advance`, { action: "start", hostToken }), codeParams(code));
    const res = await submitAnswer(post(`/api/sessions/${code}/answers`, { token: team.token, text: "   " }), codeParams(code));
    expect(res.status).toBe(400);
  });
});
