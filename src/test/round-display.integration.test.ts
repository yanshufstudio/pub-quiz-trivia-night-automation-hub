import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET as getDisplay } from "@/app/api/sessions/[code]/display/route";
import { GET as getMedia } from "@/app/api/questions/[id]/media/route";
import { POST as addTeam } from "@/app/api/sessions/[code]/teams/route";
import { DEMO_PACK } from "@/lib/demo-pack";
import { db } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rate-limit";
import { questionMediaUrl } from "@/lib/question-media-url";
import { signInTestHost } from "./auth-fixture";
import { REAL_PNG_1X1 } from "./image-fixtures";
import { roundGame } from "./round-fixture";

/**
 * GET /api/sessions/[code]/display — what the pub's TV is sent (RM5). No
 * credential at all: the link is triviafoundry.com/tv/ + the join code, which
 * the whole room knows. So the rule is the strictest of the three views — the
 * room's own view, and nothing more.
 */

const host = await signInTestHost();
const game = roundGame(host);
const [R1] = DEMO_PACK.rounds;
const KEYS = DEMO_PACK.rounds.flatMap((r) => r.questions.map((q) => q.answer));

afterAll(async () => {
  // The pictures below go on the shared, ownerless demo pack; take them off
  // again so no other suite sees a picture round it did not set up.
  await db.questionMedia.deleteMany({ where: { question: { round: { pack: { creatorId: null } } } } });
  await db.$disconnect();
});

let ipCounter = 1;
function display(code: string, ip = `10.77.0.${ipCounter++ % 250}`) {
  return getDisplay(new NextRequest(`http://localhost:3000/api/sessions/${code}/display`, { headers: { "x-forwarded-for": ip } }), {
    params: Promise.resolve({ code }),
  });
}
async function displayBody(code: string) {
  const res = await display(code);
  expect(res.status).toBe(200);
  return res.json();
}

async function setup() {
  const { code, hostToken, packId } = await game.create();
  const team = await game.join(code, "Phone Team");
  await addTeam(game.request(`/api/sessions/${code}/teams`, "POST", { hostToken, name: "Paper Team" }), {
    params: Promise.resolve({ code }),
  });
  return { code, hostToken, packId, team };
}

function expectNoSecrets(body: unknown, hostToken: string, tokens: string[], allowedKeys: string[] = []) {
  const text = JSON.stringify(body);
  expect(text).not.toContain(hostToken);
  for (const t of tokens) expect(text).not.toContain(t);
  for (const key of KEYS) if (!allowedKeys.includes(key)) expect(text, key).not.toContain(key);
  expect(text).not.toMatch(/isCorrect|pointsAwarded|hostToken|"token"/);
}

async function allTokens(code: string) {
  const teams = await db.team.findMany({ where: { session: { code } } });
  return teams.map((t) => t.token);
}

describe("the TV view (RM5)", () => {
  it("needs no credential, and 404s an unknown code", async () => {
    expect((await display("ZZZZZ")).status).toBe(404);
  });

  it("in the lobby: the join code and the team names, nothing about any question", async () => {
    const { code, hostToken } = await setup();
    const body = await displayBody(code);
    expect(body).toMatchObject({ code, status: "LOBBY", questions: [] });
    expect(body.teams.map((t: { name: string }) => t.name).sort()).toEqual(["Paper Team", "Phone Team"]);
    expect(JSON.stringify(body)).not.toContain(R1.questions[0].text);
    expectNoSecrets(body, hostToken, await allTokens(code));
  });

  it("while the round is open: the current question only, unless the host switches to all asked", async () => {
    const { code, hostToken, team } = await setup();
    await game.advance(code, hostToken, "start");
    await game.answer(code, team, 0, "Canberra");
    await game.advance(code, hostToken, "ask_next");

    const current = await displayBody(code);
    expect(current.questions.map((q: { text: string }) => q.text)).toEqual([R1.questions[1].text]);
    expect(current.askedCount).toBe(2);
    expectNoSecrets(current, hostToken, await allTokens(code));
    expect(JSON.stringify(current)).not.toContain(R1.questions[2].text);

    await game.advance(code, hostToken, "set_tv_mode", { showAll: true });
    const all = await displayBody(code);
    expect(all.questions.map((q: { text: string }) => q.text)).toEqual([R1.questions[0].text, R1.questions[1].text]);
    expect(JSON.stringify(all)).not.toContain(R1.questions[2].text);
    expectNoSecrets(all, hostToken, await allTokens(code));
  });

  it("while marking: no question, no answer, no mark", async () => {
    const { code, hostToken, team } = await setup();
    for (const a of ["start", "ask_next", "ask_next"]) await game.advance(code, hostToken, a);
    await game.answer(code, team, 0, "Canberra");
    await game.advance(code, hostToken, "close_round");
    const body = await displayBody(code);
    expect(body.status).toBe("ROUND_MARKING");
    expect(body.questions).toEqual([]);
    expectNoSecrets(body, hostToken, await allTokens(code));
  });

  it("during the reveal: the revealed questions with their answers, nothing past them", async () => {
    const { code, hostToken } = await setup();
    for (const a of ["start", "ask_next", "ask_next", "close_round", "reveal_next"]) {
      await game.advance(code, hostToken, a);
    }
    const body = await displayBody(code);
    expect(body.questions).toHaveLength(1);
    expect(body.questions[0]).toMatchObject({ text: R1.questions[0].text, answer: R1.questions[0].answer });
    expectNoSecrets(body, hostToken, await allTokens(code), [R1.questions[0].answer]);
  });

  it("a countdown that ran out on one question is gone once the next is asked", async () => {
    // As seen on the desk and the TV: a minute started on Q1, reached zero,
    // and Q3 still said "Time's up!" with Q1's start time.
    const { code, hostToken } = await setup();
    await game.advance(code, hostToken, "start");
    expect((await game.advance(code, hostToken, "start_countdown", { seconds: 60 })).status).toBe(200);
    await db.session.update({ where: { code }, data: { countdownStartedAt: new Date(Date.now() - 2 * 60_000) } });
    expect((await displayBody(code)).countdown).not.toBeNull();

    expect((await game.advance(code, hostToken, "ask_next")).status).toBe(200);
    expect((await game.advance(code, hostToken, "ask_next")).status).toBe(200);

    expect((await displayBody(code)).countdown).toBeNull();
    expect((await (await game.hostView(code, hostToken)).json()).countdown).toBeNull();
  });

  it("the scoreboard only while the host shows it", async () => {
    const { code, hostToken } = await setup();
    await game.advance(code, hostToken, "start");
    expect((await displayBody(code)).scoreboard).toBeNull();
    await game.advance(code, hostToken, "show_scoreboard");
    expect((await displayBody(code)).scoreboard).toHaveLength(2);
    await game.advance(code, hostToken, "end");
    expect((await displayBody(code)).scoreboard).toHaveLength(2);
  });

  it("is rate-limited per IP, generously enough for ten screens polling every 3 s", async () => {
    const { code } = await setup();
    const ip = "10.99.99.99";
    // Ten screens × one poll every 3 s × ten minutes = 2000.
    for (let i = 0; i < 1999; i++) {
      await consumeRateLimit(`ratelimit:sessions:display:${ip}`, { limit: 2000, windowMs: 10 * 60 * 1000 });
    }
    expect((await display(code, ip)).status).toBe(200);
    const limited = await display(code, ip);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});

describe("pictures on the TV", () => {
  async function withPictures() {
    const { code, hostToken, packId } = await setup();
    const questions = await db.question.findMany({
      where: { round: { packId } },
      orderBy: [{ round: { index: "asc" } }, { index: "asc" }],
    });
    // The seeded demo pack is shared by every game in this file, so a picture
    // may already be attached.
    for (const q of questions) {
      const media = { mime: "image/png", bytes: Buffer.from(REAL_PNG_1X1), byteSize: REAL_PNG_1X1.length, width: 1, height: 1 };
      await db.questionMedia.upsert({ where: { questionId: q.id }, update: {}, create: { questionId: q.id, ...media } });
    }
    return { code, hostToken, questions };
  }

  function fetchAsDisplay(questionId: string, code: string) {
    const url = `http://localhost:3000${questionMediaUrl(questionId, { code, display: true })}`;
    return getMedia(new NextRequest(url), { params: Promise.resolve({ id: questionId }) });
  }

  it("loads the picture of a question that has been asked, and no other", async () => {
    const { code, hostToken, questions } = await withPictures();
    expect((await fetchAsDisplay(questions[0].id, code)).status).toBe(404);
    await game.advance(code, hostToken, "start");
    expect((await fetchAsDisplay(questions[0].id, code)).status).toBe(200);
    expect((await fetchAsDisplay(questions[1].id, code)).status).toBe(404);
    expect((await fetchAsDisplay(questions[3].id, code)).status).toBe(404);
  });

  it("an asked question from an earlier round still loads", async () => {
    const { code, hostToken, questions } = await withPictures();
    for (const a of ["start", "ask_next", "ask_next", "close_round", "reveal_all", "next_round"]) {
      await game.advance(code, hostToken, a);
    }
    expect((await fetchAsDisplay(questions[2].id, code)).status).toBe(200);
    expect((await fetchAsDisplay(questions[3].id, code)).status).toBe(200);
    expect((await fetchAsDisplay(questions[4].id, code)).status).toBe(404);
  });

  it("a team's phone loads every question asked so far in the round, not only the latest", async () => {
    const { code, hostToken, questions } = await withPictures();
    const token = (await db.team.findFirstOrThrow({ where: { session: { code }, isPaper: false } })).token;
    const asTeam = (id: string) =>
      getMedia(new NextRequest(`http://localhost:3000${questionMediaUrl(id, { code, token })}`), {
        params: Promise.resolve({ id }),
      });
    await game.advance(code, hostToken, "start");
    await game.advance(code, hostToken, "ask_next");
    expect((await asTeam(questions[0].id)).status).toBe(200);
    expect((await asTeam(questions[1].id)).status).toBe(200);
    expect((await asTeam(questions[2].id)).status).toBe(404);
  });

  it("never a question from another pack", async () => {
    const a = await withPictures();
    await game.advance(a.code, a.hostToken, "start");
    const other = await db.quizPack.create({
      data: {
        title: "Another pack",
        prompt: "test",
        creatorId: host.id,
        rounds: { create: [{ index: 0, title: "R", category: "C", questions: { create: [{ index: 0, text: "Q", answer: "A" }] } }] },
      },
      include: { rounds: { include: { questions: true } } },
    });
    const foreign = other.rounds[0].questions[0].id;
    await db.questionMedia.create({
      data: { questionId: foreign, mime: "image/png", bytes: Buffer.from(REAL_PNG_1X1), byteSize: REAL_PNG_1X1.length, width: 1, height: 1 },
    });
    // Question index 0 of round 0 — the same position as the asked one.
    expect((await fetchAsDisplay(foreign, a.code)).status).toBe(404);
  });
});
