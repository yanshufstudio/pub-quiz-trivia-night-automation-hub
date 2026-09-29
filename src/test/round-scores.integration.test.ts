import { afterAll, describe, expect, it } from "vitest";

import { POST as addTeam } from "@/app/api/sessions/[code]/teams/route";
import { DELETE as clearRoundScore, PUT as setRoundScore } from "@/app/api/sessions/[code]/round-scores/route";
import { db } from "@/lib/db";
import { signInTestHost } from "./auth-fixture";
import { roundGame } from "./round-fixture";

const host = await signInTestHost();
const game = roundGame(host);
const params = (code: string) => ({ params: Promise.resolve({ code }) });

afterAll(async () => {
  await db.$disconnect();
});

function addPaper(code: string, body: object, withCookie = true) {
  return addTeam(game.request(`/api/sessions/${code}/teams`, "POST", body, withCookie), params(code));
}
function putScore(code: string, body: object) {
  return setRoundScore(game.request(`/api/sessions/${code}/round-scores`, "PUT", body), params(code));
}
function deleteScore(code: string, body: object) {
  return clearRoundScore(game.request(`/api/sessions/${code}/round-scores`, "DELETE", body), params(code));
}

async function closedRound() {
  const { code, hostToken } = await game.create();
  const res = await addPaper(code, { hostToken, name: "The Pencils" });
  const { team: paper } = await res.json();
  await game.advance(code, hostToken, "start");
  await game.advance(code, hostToken, "ask_next");
  await game.advance(code, hostToken, "ask_next");
  await game.advance(code, hostToken, "close_round");
  return { code, hostToken, paperId: paper.id as string };
}

describe("paper teams (RM3)", () => {
  it("the host adds a team by name, and no token comes back", async () => {
    const { code, hostToken } = await game.create();
    const res = await addPaper(code, { hostToken, name: "The Pencils" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.team).toEqual({ id: expect.any(String), name: "The Pencils", isPaper: true });
    expect(JSON.stringify(body)).not.toMatch(/token/i);
    const row = await db.team.findUniqueOrThrow({ where: { id: body.team.id } });
    expect(row.isPaper).toBe(true);
  });

  it("can be added mid-game too — a table that arrives late with a pen", async () => {
    const { code, hostToken } = await game.create();
    await game.advance(code, hostToken, "start");
    expect((await addPaper(code, { hostToken, name: "Latecomers" })).status).toBe(201);
  });

  it("shares the name check with phone teams", async () => {
    const { code, hostToken } = await game.create();
    await game.join(code, "Quizzly Bears");
    expect((await addPaper(code, { hostToken, name: "quizzly bears" })).status).toBe(409);
  });

  it("needs the host key and a signed-in host", async () => {
    const { code, hostToken } = await game.create();
    expect((await addPaper(code, { hostToken: "wrong", name: "X" })).status).toBe(401);
    expect((await addPaper(code, { hostToken, name: "X" }, false)).status).toBe(401);
  });

  it("is refused once the game has ended", async () => {
    const { code, hostToken } = await game.create();
    await game.advance(code, hostToken, "end");
    expect((await addPaper(code, { hostToken, name: "Too Late" })).status).toBe(409);
  });
});

describe("typed round totals", () => {
  it("are refused while the round is still open", async () => {
    const { code, hostToken } = await game.create();
    const { team } = await (await addPaper(code, { hostToken, name: "Paper" })).json();
    await game.advance(code, hostToken, "start");
    const res = await putScore(code, { hostToken, teamId: team.id, roundIndex: 0, points: 3 });
    expect(res.status).toBe(409);
  });

  it("are refused for a round not yet played", async () => {
    const { code, hostToken, paperId } = await closedRound();
    expect((await putScore(code, { hostToken, teamId: paperId, roundIndex: 1, points: 3 })).status).toBe(409);
  });

  it("set, replace and clear a team's total once the round has closed", async () => {
    const { code, hostToken, paperId } = await closedRound();
    expect((await putScore(code, { hostToken, teamId: paperId, roundIndex: 0, points: 3 })).status).toBe(200);
    expect((await putScore(code, { hostToken, teamId: paperId, roundIndex: 0, points: 4 })).status).toBe(200);
    const rows = await db.roundScore.findMany({ where: { teamId: paperId } });
    expect(rows.map((r) => r.points)).toEqual([4]);

    expect((await deleteScore(code, { hostToken, teamId: paperId, roundIndex: 0 })).status).toBe(200);
    expect(await db.roundScore.count({ where: { teamId: paperId } })).toBe(0);
    // Clearing what is already clear is not an error.
    expect((await deleteScore(code, { hostToken, teamId: paperId, roundIndex: 0 })).status).toBe(200);
  });

  it("can override a phone team's total, and during the reveal as well as the marking", async () => {
    const { code, hostToken } = await game.create();
    const token = await game.join(code, "Phones");
    const phone = await db.team.findUniqueOrThrow({ where: { token } });
    for (const a of ["start", "ask_next", "ask_next", "close_round", "reveal_next"]) {
      await game.advance(code, hostToken, a);
    }
    expect((await putScore(code, { hostToken, teamId: phone.id, roundIndex: 0, points: 2 })).status).toBe(200);
  });

  it("only for a team of this game, with a sensible number", async () => {
    const { code, hostToken, paperId } = await closedRound();
    const other = await closedRound();
    expect((await putScore(code, { hostToken, teamId: other.paperId, roundIndex: 0, points: 3 })).status).toBe(404);
    expect((await putScore(code, { hostToken, teamId: paperId, roundIndex: 0, points: -1 })).status).toBe(400);
    expect((await putScore(code, { hostToken, teamId: paperId, roundIndex: 0, points: 2.5 })).status).toBe(400);
  });

  it("needs the host key", async () => {
    const { code, paperId } = await closedRound();
    const res = await putScore(code, { hostToken: "wrong", teamId: paperId, roundIndex: 0, points: 3 });
    expect(res.status).toBe(401);
  });
});
