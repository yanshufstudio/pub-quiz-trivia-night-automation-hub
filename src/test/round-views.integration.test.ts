import { afterAll, describe, expect, it } from "vitest";

import { POST as addTeam } from "@/app/api/sessions/[code]/teams/route";
import { PUT as setRoundScore } from "@/app/api/sessions/[code]/round-scores/route";
import { DEMO_PACK } from "@/lib/demo-pack";
import { db } from "@/lib/db";
import { signInTestHost } from "./auth-fixture";
import { roundGame } from "./round-fixture";

/**
 * What GET /api/sessions/[code] sends in a round-mode game (RM4), and above all
 * what it does not: nothing about a question before it is asked, no answer and
 * no mark before that question is revealed, no scoreboard until the host
 * shows it.
 */

const host = await signInTestHost();
const game = roundGame(host);
const params = (code: string) => ({ params: Promise.resolve({ code }) });

afterAll(async () => {
  await db.$disconnect();
});

const [R1, R2] = DEMO_PACK.rounds;
const KEYS = [...R1.questions, ...R2.questions].map((q) => q.answer);

async function setup() {
  const { code, hostToken } = await game.create();
  const team = await game.join(code, "Wrong Every Time");
  const paperRes = await addTeam(
    game.request(`/api/sessions/${code}/teams`, "POST", { hostToken, name: "Paper Tigers" }),
    params(code)
  );
  const { team: paper } = await paperRes.json();
  return { code, hostToken, team, paperId: paper.id as string };
}

async function teamBody(code: string, token: string) {
  const res = await game.teamView(code, token);
  expect(res.status).toBe(200);
  return res.json();
}
async function hostBody(code: string, hostToken: string) {
  const res = await game.hostView(code, hostToken);
  expect(res.status).toBe(200);
  return res.json();
}

async function teamId(code: string, token: string) {
  const row = await db.team.findFirstOrThrow({ where: { token, session: { code } }, select: { id: true } });
  return row.id;
}

function expectNoKeys(body: unknown, except: string[] = []) {
  const text = JSON.stringify(body);
  for (const key of KEYS) if (!except.includes(key)) expect(text, key).not.toContain(key);
}

describe("the team's view of a round-mode game (RM4)", () => {
  it("in the lobby: no question at all", async () => {
    const { code, team } = await setup();
    const body = await teamBody(code, team);
    expect(body).toMatchObject({ mode: "ROUND", status: "LOBBY", questions: [] });
    expect(JSON.stringify(body)).not.toContain(R1.questions[0].text);
    expectNoKeys(body);
  });

  it("while the round is open: the asked questions only, newest last, no answers", async () => {
    const { code, hostToken, team } = await setup();
    await game.advance(code, hostToken, "start");
    await game.answer(code, team, 0, "Sydney");
    await game.advance(code, hostToken, "ask_next");

    const body = await teamBody(code, team);
    expect(body.status).toBe("ROUND_OPEN");
    expect(body.askedCount).toBe(2);
    expect(body.questions.map((q: { text: string }) => q.text)).toEqual([R1.questions[0].text, R1.questions[1].text]);
    expect(JSON.stringify(body)).not.toContain(R1.questions[2].text);
    expect(body.myAnswers).toEqual([{ questionIndex: 0, text: "Sydney", isCorrect: null, pointsAwarded: null }]);
    expectNoKeys(body);
  });

  it("once the round closes: locked, and still no answer or mark", async () => {
    const { code, hostToken, team } = await setup();
    for (const a of ["start", "ask_next", "ask_next"]) await game.advance(code, hostToken, a);
    await game.answer(code, team, 1, "Six");
    await game.advance(code, hostToken, "close_round");
    const body = await teamBody(code, team);
    expect(body.status).toBe("ROUND_MARKING");
    expect(body.myAnswers[0]).toMatchObject({ isCorrect: null, pointsAwarded: null });
    expectNoKeys(body);
  });

  it("during the reveal: the right answer and the team's own mark for revealed questions only", async () => {
    const { code, hostToken, team } = await setup();
    for (const a of ["start", "ask_next", "ask_next"]) await game.advance(code, hostToken, a);
    await game.answer(code, team, 0, "Sydney");
    await game.answer(code, team, 1, "Six");
    await game.advance(code, hostToken, "close_round");
    await game.advance(code, hostToken, "reveal_next");

    const body = await teamBody(code, team);
    expect(body.questions[0].answer).toBe(R1.questions[0].answer);
    expect(body.questions[1].answer).toBeNull();
    expect(body.myAnswers).toEqual([
      { questionIndex: 0, text: "Sydney", isCorrect: false, pointsAwarded: 0 },
      { questionIndex: 1, text: "Six", isCorrect: null, pointsAwarded: null },
    ]);
    expect(body.myRoundTotal).toBeNull();
    expectNoKeys(body, [R1.questions[0].answer]);
  });

  it("the round total arrives when every answer is revealed", async () => {
    const { code, hostToken, team } = await setup();
    for (const a of ["start", "ask_next", "ask_next"]) await game.advance(code, hostToken, a);
    await game.answer(code, team, 2, "Mars");
    await game.advance(code, hostToken, "close_round");
    await game.advance(code, hostToken, "reveal_all");
    expect((await teamBody(code, team)).myRoundTotal).toBe(1);
  });

  it("a team that joins while the round is being marked sits it out, and plays the next one", async () => {
    const { code, hostToken, team } = await setup();
    for (const a of ["start", "ask_next", "ask_next"]) await game.advance(code, hostToken, a);
    await game.answer(code, team, 0, "Sydney");
    await game.advance(code, hostToken, "close_round");
    const late = await game.join(code, "Late Arrivals");

    const marking = await teamBody(code, late);
    expect(marking).toMatchObject({ status: "ROUND_MARKING", sitsOutRound: true, questions: [], myAnswers: [] });
    expect(JSON.stringify(marking)).not.toContain(R1.questions[0].text);

    await game.advance(code, hostToken, "reveal_all");
    const revealed = await teamBody(code, late);
    expect(revealed).toMatchObject({ status: "ROUND_REVEAL", sitsOutRound: true, questions: [], myRoundTotal: null });
    expectNoKeys(revealed);
    // The team that played the round still sees it.
    expect(await teamBody(code, team)).toMatchObject({ sitsOutRound: false, myRoundTotal: 0 });

    await game.advance(code, hostToken, "next_round");
    const next = await teamBody(code, late);
    expect(next).toMatchObject({ status: "ROUND_OPEN", sitsOutRound: false });
    expect(next.questions.map((q: { text: string }) => q.text)).toEqual([R2.questions[0].text]);
  });

  it("a team with a typed total for the round did play it, on paper", async () => {
    const { code, hostToken, team } = await setup();
    for (const a of ["start", "ask_next", "ask_next", "close_round"]) await game.advance(code, hostToken, a);
    const res = await setRoundScore(
      game.request(`/api/sessions/${code}/round-scores`, "PUT", { hostToken, teamId: await teamId(code, team), roundIndex: 0, points: 2 }),
      params(code)
    );
    expect(res.status).toBe(200);
    await game.advance(code, hostToken, "reveal_all");
    expect(await teamBody(code, team)).toMatchObject({ sitsOutRound: false, myRoundTotal: 2 });
  });

  it("no scoreboard until the host shows it, and then only finished rounds", async () => {
    const { code, hostToken, team, paperId } = await setup();
    for (const a of ["start", "ask_next", "ask_next"]) await game.advance(code, hostToken, a);
    await game.answer(code, team, 0, "Canberra");
    await game.advance(code, hostToken, "close_round");
    await setRoundScore(
      game.request(`/api/sessions/${code}/round-scores`, "PUT", { hostToken, teamId: paperId, roundIndex: 0, points: 3 }),
      params(code)
    );
    await game.advance(code, hostToken, "reveal_next");
    expect((await teamBody(code, team)).scoreboard).toBeNull();

    await game.advance(code, hostToken, "show_scoreboard");
    // Mid-reveal: the round is not finished, so it moves nobody.
    const mid = await teamBody(code, team);
    expect(mid.scoreboard.map((r: { score: number }) => r.score)).toEqual([0, 0]);

    await game.advance(code, hostToken, "reveal_all");
    const after = await teamBody(code, team);
    expect(after.scoreboard).toEqual([
      { teamId: paperId, name: "Paper Tigers", score: 3 },
      { teamId: expect.any(String), name: "Wrong Every Time", score: 1 },
    ]);

    await game.advance(code, hostToken, "hide_scoreboard");
    expect((await teamBody(code, team)).scoreboard).toBeNull();
  });

  it("says how many rounds the scoreboard counts, so no screen ranks a room of zeros", async () => {
    const { code, hostToken, team } = await setup();
    expect((await teamBody(code, team)).countedRounds).toBe(0);
    for (const a of ["start", "ask_next", "ask_next", "close_round", "reveal_next"]) await game.advance(code, hostToken, a);
    expect((await teamBody(code, team)).countedRounds).toBe(0);
    expect((await hostBody(code, hostToken)).countedRounds).toBe(0);
    await game.advance(code, hostToken, "reveal_all");
    expect((await teamBody(code, team)).countedRounds).toBe(1);
    expect((await hostBody(code, hostToken)).countedRounds).toBe(1);
  });

  it("the final scoreboard shows at the end whether or not the host showed it", async () => {
    const { code, hostToken, team } = await setup();
    await game.advance(code, hostToken, "end");
    expect(Array.isArray((await teamBody(code, team)).scoreboard)).toBe(true);
  });

  it("a paper team's token opens nothing", async () => {
    const { code, paperId } = await setup();
    const paper = await db.team.findUniqueOrThrow({ where: { id: paperId } });
    expect((await game.teamView(code, paper.token)).status).toBe(403);
  });

  it("carries the countdown and the server's clock", async () => {
    const { code, hostToken, team } = await setup();
    await game.advance(code, hostToken, "start");
    await game.advance(code, hostToken, "start_countdown", { seconds: 120 });
    const body = await teamBody(code, team);
    expect(body.countdown).toMatchObject({ durationSeconds: 120, startedAt: expect.any(String) });
    expect(Math.abs(Date.parse(body.serverNow) - Date.now())).toBeLessThan(5000);
  });
});

describe("the host's view of a round-mode game (RM4)", () => {
  it("in the lobby: no question either", async () => {
    const { code, hostToken } = await setup();
    const body = await hostBody(code, hostToken);
    expect(body).toMatchObject({ status: "LOBBY", questions: [], round: null });
    expect(JSON.stringify(body)).not.toContain(R1.questions[0].text);
  });

  it("while the round is open: who has answered, never what", async () => {
    const { code, hostToken, team } = await setup();
    await game.advance(code, hostToken, "start");
    await game.answer(code, team, 0, "Sydney");
    const body = await hostBody(code, hostToken);
    const row = body.teams.find((t: { name: string }) => t.name === "Wrong Every Time");
    expect(row.answered).toEqual([0]);
    expect(JSON.stringify(body)).not.toContain("Sydney");
    expect(body.marks).toBeNull();
    expectNoKeys(body);
    // Paper teams are listed, marked as paper, never as "not answered".
    expect(body.teams.find((t: { name: string }) => t.name === "Paper Tigers")).toMatchObject({ isPaper: true });
  });

  it("from the close: every answer, its mark, the key and the round totals", async () => {
    const { code, hostToken, team, paperId } = await setup();
    for (const a of ["start", "ask_next", "ask_next"]) await game.advance(code, hostToken, a);
    await game.answer(code, team, 0, "Sydney");
    await game.answer(code, team, 2, "Mars");
    await game.advance(code, hostToken, "close_round");

    const body = await hostBody(code, hostToken);
    expect(body.questions.map((q: { answer: string }) => q.answer)).toEqual(R1.questions.map((q) => q.answer));
    const phone = body.marks.find((m: { name: string }) => m.name === "Wrong Every Time");
    expect(phone.answers).toEqual([
      { questionIndex: 0, id: expect.any(String), text: "Sydney", isCorrect: false, pointsAwarded: 0, hostOverride: false },
      { questionIndex: 2, id: expect.any(String), text: "Mars", isCorrect: true, pointsAwarded: 1, hostOverride: false },
    ]);
    expect(phone).toMatchObject({ auto: 1, typed: null, total: 1 });
    expect(body.marks.find((m: { teamId: string }) => m.teamId === paperId)).toMatchObject({ isPaper: true, total: 0 });
  });

  it("a phone team with nothing in the round is flagged as sitting it out; paper teams never are", async () => {
    const { code, hostToken, team, paperId } = await setup();
    for (const a of ["start", "ask_next", "ask_next"]) await game.advance(code, hostToken, a);
    await game.answer(code, team, 0, "Sydney");
    await game.advance(code, hostToken, "close_round");
    await game.join(code, "Late Arrivals");

    const body = await hostBody(code, hostToken);
    const sitsOut = (name: string) => body.marks.find((m: { name: string }) => m.name === name).sitsOut;
    expect(sitsOut("Late Arrivals")).toBe(true);
    expect(sitsOut("Wrong Every Time")).toBe(false);
    expect(body.marks.find((m: { teamId: string }) => m.teamId === paperId).sitsOut).toBe(false);

    // A total typed for it means the team played the round after all (on a sheet).
    const lateId = body.marks.find((m: { name: string }) => m.name === "Late Arrivals").teamId;
    await setRoundScore(
      game.request(`/api/sessions/${code}/round-scores`, "PUT", { hostToken, teamId: lateId, roundIndex: 0, points: 1 }),
      params(code)
    );
    const after = await hostBody(code, hostToken);
    expect(after.marks.find((m: { teamId: string }) => m.teamId === lateId).sitsOut).toBe(false);
  });

  it("never carries a team token or the host key", async () => {
    const { code, hostToken, team } = await setup();
    await game.advance(code, hostToken, "start");
    const text = JSON.stringify(await hostBody(code, hostToken));
    expect(text).not.toContain(team);
    expect(text).not.toContain(hostToken);
  });
});
