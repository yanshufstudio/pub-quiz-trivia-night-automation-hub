import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { signInTestHost } from "./auth-fixture";
import { switchToQuestionMode } from "./question-mode-fixture";
import { roundGame } from "./round-fixture";

const host = await signInTestHost();
const game = roundGame(host);

afterAll(async () => {
  await db.$disconnect();
});

async function state(code: string) {
  return db.session.findUniqueOrThrow({ where: { code } });
}

describe("POST /advance runs a round-mode game (RM1)", () => {
  it("walks a whole game: start, ask, close, reveal, next round, finish", async () => {
    const { code, hostToken } = await game.create();
    const step = async (action: string, extra: object = {}) => {
      const res = await game.advance(code, hostToken, action, extra);
      expect(res.status, `${action}: ${JSON.stringify(await res.clone().json())}`).toBe(200);
      return (await res.json()).session;
    };

    expect(await step("start")).toMatchObject({ status: "ROUND_OPEN", currentRoundIndex: 0, askedCount: 1 });
    expect(await step("ask_next")).toMatchObject({ askedCount: 2 });
    expect((await game.advance(code, hostToken, "close_round")).status).toBe(409);
    expect(await step("ask_next")).toMatchObject({ askedCount: 3 });
    expect((await game.advance(code, hostToken, "ask_next")).status).toBe(409);
    expect(await step("close_round")).toMatchObject({ status: "ROUND_MARKING" });
    expect((await game.advance(code, hostToken, "next_round")).status).toBe(409);
    expect(await step("reveal_next")).toMatchObject({ status: "ROUND_REVEAL", revealedCount: 1 });
    expect((await game.advance(code, hostToken, "next_round")).status).toBe(409);
    expect(await step("show_scoreboard")).toMatchObject({ scoreboardShown: true });
    expect(await step("reveal_all")).toMatchObject({ revealedCount: 3 });
    expect((await game.advance(code, hostToken, "finish")).status).toBe(409);
    expect(await step("next_round")).toMatchObject({
      status: "ROUND_OPEN",
      currentRoundIndex: 1,
      askedCount: 1,
      revealedCount: 0,
      scoreboardShown: false,
    });
    await step("ask_next");
    await step("ask_next");
    await step("close_round");
    await step("reveal_all");
    expect((await game.advance(code, hostToken, "next_round")).status).toBe(409);
    expect(await step("finish")).toMatchObject({ status: "ENDED" });
  });

  it("never sends the host key back", async () => {
    const { code, hostToken } = await game.create();
    const res = await game.advance(code, hostToken, "start");
    expect(JSON.stringify(await res.json())).not.toContain(hostToken);
  });

  // The desk sends the state it was looking at (`at`) with every press. Two
  // presses — or a press and its retry after the venue wifi dropped the
  // response — carry the same `at`, so whichever arrives second, however late,
  // finds the game already moved and changes nothing.
  it("a double press asks one question, not two", async () => {
    const { code, hostToken } = await game.create();
    await game.advance(code, hostToken, "start");
    const at = { roundIndex: 0, askedCount: 1, revealedCount: 0 };
    const results = await Promise.all([
      game.advance(code, hostToken, "ask_next", { at }),
      game.advance(code, hostToken, "ask_next", { at }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await state(code)).askedCount).toBe(2);

    // A retry that arrives after the first press has long committed.
    expect((await game.advance(code, hostToken, "ask_next", { at })).status).toBe(409);
    expect((await state(code)).askedCount).toBe(2);
  });

  it("a double press reveals one answer, not two", async () => {
    const { code, hostToken } = await game.create();
    for (const action of ["start", "ask_next", "ask_next", "close_round"]) {
      await game.advance(code, hostToken, action);
    }
    const at = { roundIndex: 0, askedCount: 3, revealedCount: 0 };
    const results = await Promise.all([
      game.advance(code, hostToken, "reveal_next", { at }),
      game.advance(code, hostToken, "reveal_next", { at }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await state(code)).revealedCount).toBe(1);
  });

  it("a double press on next round moves one round, not two", async () => {
    const { code, hostToken } = await game.create();
    for (const action of ["start", "ask_next", "ask_next", "close_round", "reveal_all"]) {
      await game.advance(code, hostToken, action);
    }
    const at = { roundIndex: 0, askedCount: 3, revealedCount: 3 };
    const results = await Promise.all([
      game.advance(code, hostToken, "next_round", { at }),
      game.advance(code, hostToken, "next_round", { at }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await state(code)).currentRoundIndex).toBe(1);
  });

  it("a retried flag change is harmless, not a conflict", async () => {
    const { code, hostToken } = await game.create();
    await game.advance(code, hostToken, "start");
    expect((await game.advance(code, hostToken, "show_scoreboard")).status).toBe(200);
    expect((await game.advance(code, hostToken, "show_scoreboard")).status).toBe(200);
    expect((await game.advance(code, hostToken, "set_tv_mode", { showAll: true })).status).toBe(200);
    expect((await game.advance(code, hostToken, "set_tv_mode", { showAll: true })).status).toBe(200);
    expect(await state(code)).toMatchObject({ scoreboardShown: true, tvShowsAll: true });
  });

  it("stamps a countdown on the server; reaching zero changes nothing", async () => {
    const { code, hostToken } = await game.create();
    await game.advance(code, hostToken, "start");
    const before = Date.now();
    const res = await game.advance(code, hostToken, "start_countdown", { seconds: 60 });
    expect(res.status).toBe(200);
    const row = await state(code);
    expect(row.countdownSeconds).toBe(60);
    expect(row.countdownStartedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);

    // Pretend the minute is long gone: the round stays open.
    await db.session.update({ where: { code }, data: { countdownStartedAt: new Date(Date.now() - 10 * 60_000) } });
    const view = await (await game.hostView(code, hostToken)).json();
    expect(view.status).toBe("ROUND_OPEN");
    expect((await state(code)).status).toBe("ROUND_OPEN");

    expect((await game.advance(code, hostToken, "start_countdown", { seconds: 45 })).status).toBe(400);
    expect((await game.advance(code, hostToken, "clear_countdown")).status).toBe(200);
    expect((await state(code)).countdownStartedAt).toBeNull();
  });

  it("end closes a round-mode game from any state and is idempotent", async () => {
    const { code, hostToken } = await game.create();
    await game.advance(code, hostToken, "start");
    expect((await game.advance(code, hostToken, "end")).status).toBe(200);
    expect((await game.advance(code, hostToken, "end")).status).toBe(200);
    expect((await state(code)).status).toBe("ENDED");
  });

  it("the one-question-at-a-time actions are refused on a round-mode game", async () => {
    const { code, hostToken } = await game.create();
    await game.advance(code, hostToken, "start");
    expect((await game.advance(code, hostToken, "reveal")).status).toBe(409);
    expect((await game.advance(code, hostToken, "next")).status).toBe(409);
    expect((await state(code)).status).toBe("ROUND_OPEN");
  });
});

describe("QUESTION-mode sessions behave exactly as before", () => {
  it("start, reveal, next and end still run question by question", async () => {
    const { code, hostToken } = await game.create();
    await switchToQuestionMode(code);
    const statusAfter = async (action: string) => {
      const res = await game.advance(code, hostToken, action);
      expect(res.status).toBe(200);
      return (await res.json()).session;
    };
    expect(await statusAfter("start")).toMatchObject({ status: "QUESTION_ACTIVE", currentQuestionIndex: 0 });
    expect(await statusAfter("reveal")).toMatchObject({ status: "REVEAL" });
    expect(await statusAfter("next")).toMatchObject({ status: "QUESTION_ACTIVE", currentQuestionIndex: 1 });
    expect(await statusAfter("end")).toMatchObject({ status: "ENDED" });
  });

  it("round actions are refused on a QUESTION-mode session", async () => {
    const { code, hostToken } = await game.create();
    await switchToQuestionMode(code);
    await game.advance(code, hostToken, "start");
    for (const action of ["ask_next", "close_round", "reveal_all", "show_scoreboard", "next_round", "finish"]) {
      expect((await game.advance(code, hostToken, action)).status, action).toBe(409);
    }
    expect((await state(code)).status).toBe("QUESTION_ACTIVE");
  });
});
