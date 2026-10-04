import { describe, expect, it } from "vitest";
import {
  COUNTDOWN_CHOICES_SECONDS,
  ROUND_ACTIONS,
  planRoundAction,
  type RoundAction,
  type RoundSessionState,
} from "@/lib/round-state";

// A 2-round pack: round 0 has 3 questions, round 1 has 2.
const ROUND_LENGTHS = [3, 2];
const NOW = new Date("2026-10-09T20:00:00.000Z");

type Case = { label: string; state: RoundSessionState };

const S = (partial: Partial<RoundSessionState>): RoundSessionState => ({
  status: "LOBBY",
  currentRoundIndex: 0,
  askedCount: 0,
  revealedCount: 0,
  ...partial,
});

const CASES: Record<string, Case> = {
  lobby: { label: "LOBBY", state: S({}) },
  openPartly: { label: "ROUND_OPEN, 1 of 3 asked", state: S({ status: "ROUND_OPEN", askedCount: 1 }) },
  openAll: { label: "ROUND_OPEN, 3 of 3 asked", state: S({ status: "ROUND_OPEN", askedCount: 3 }) },
  marking: { label: "ROUND_MARKING", state: S({ status: "ROUND_MARKING", askedCount: 3 }) },
  revealPartly: {
    label: "ROUND_REVEAL, 1 of 3 revealed",
    state: S({ status: "ROUND_REVEAL", askedCount: 3, revealedCount: 1 }),
  },
  revealAll: {
    label: "ROUND_REVEAL, all revealed, not the last round",
    state: S({ status: "ROUND_REVEAL", askedCount: 3, revealedCount: 3 }),
  },
  revealAllLast: {
    label: "ROUND_REVEAL, all revealed, last round",
    state: S({ status: "ROUND_REVEAL", currentRoundIndex: 1, askedCount: 2, revealedCount: 2 }),
  },
  ended: { label: "ENDED", state: S({ status: "ENDED", askedCount: 3, revealedCount: 3 }) },
};

// Which (state, action) pairs are allowed. Everything not listed must be refused.
const ALLOWED: Record<RoundAction, (keyof typeof CASES)[]> = {
  start: ["lobby"],
  ask_next: ["openPartly"],
  close_round: ["openAll"],
  reveal_next: ["marking", "revealPartly"],
  reveal_all: ["marking", "revealPartly", "revealAll", "revealAllLast"],
  show_scoreboard: ["openPartly", "openAll", "marking", "revealPartly", "revealAll", "revealAllLast"],
  hide_scoreboard: ["openPartly", "openAll", "marking", "revealPartly", "revealAll", "revealAllLast"],
  next_round: ["revealAll"],
  finish: ["revealAllLast"],
  end: ["lobby", "openPartly", "openAll", "marking", "revealPartly", "revealAll", "revealAllLast", "ended"],
  start_countdown: ["openPartly", "openAll"],
  clear_countdown: ["lobby", "openPartly", "openAll", "marking", "revealPartly", "revealAll", "revealAllLast"],
  set_tv_mode: ["lobby", "openPartly", "openAll", "marking", "revealPartly", "revealAll", "revealAllLast"],
};

function input(action: RoundAction) {
  if (action === "start_countdown") return { action, seconds: 120 };
  if (action === "set_tv_mode") return { action, showAll: true };
  return { action };
}

describe("every round action from every state", () => {
  for (const action of ROUND_ACTIONS) {
    for (const [key, { label, state }] of Object.entries(CASES)) {
      const allowed = ALLOWED[action].includes(key as keyof typeof CASES);
      it(`${action} from ${label}: ${allowed ? "allowed" : "refused"}`, () => {
        const plan = planRoundAction(state, input(action), ROUND_LENGTHS, NOW);
        expect(plan.ok).toBe(allowed);
      });
    }
  }
});

describe("what each allowed action does", () => {
  function data(state: RoundSessionState, action: RoundAction, extra: object = {}) {
    const plan = planRoundAction(state, { ...input(action), ...extra }, ROUND_LENGTHS, NOW);
    if (!plan.ok) throw new Error(plan.error);
    return plan;
  }

  it("start opens round 1 with its first question asked", () => {
    expect(data(CASES.lobby.state, "start").data).toMatchObject({
      status: "ROUND_OPEN",
      currentRoundIndex: 0,
      askedCount: 1,
      revealedCount: 0,
    });
  });

  it("ask_next asks one more question, pinned to the count it read", () => {
    const plan = data(CASES.openPartly.state, "ask_next");
    expect(plan.data).toEqual({ askedCount: 2, countdownStartedAt: null, countdownSeconds: null });
    expect(plan.pin).toMatchObject({ status: "ROUND_OPEN", currentRoundIndex: 0, askedCount: 1 });
  });

  it("close_round is refused until every question of the round has been asked", () => {
    const refused = planRoundAction(CASES.openPartly.state, { action: "close_round" }, ROUND_LENGTHS, NOW);
    expect(refused.ok).toBe(false);
    expect(data(CASES.openAll.state, "close_round").data).toMatchObject({ status: "ROUND_MARKING" });
  });

  it("ask_next stops a running countdown, so it never carries over to the next question", () => {
    expect(data(CASES.openPartly.state, "ask_next").data).toMatchObject({
      countdownStartedAt: null,
      countdownSeconds: null,
    });
  });

  it("close_round stops a running countdown", () => {
    expect(data(CASES.openAll.state, "close_round").data).toMatchObject({
      countdownStartedAt: null,
      countdownSeconds: null,
    });
  });

  it("reveal_next shows one more answer", () => {
    expect(data(CASES.marking.state, "reveal_next").data).toEqual({ status: "ROUND_REVEAL", revealedCount: 1 });
    const plan = data(CASES.revealPartly.state, "reveal_next");
    expect(plan.data).toEqual({ status: "ROUND_REVEAL", revealedCount: 2 });
    expect(plan.pin).toMatchObject({ revealedCount: 1 });
  });

  it("reveal_next is refused once every answer is out", () => {
    expect(planRoundAction(CASES.revealAll.state, { action: "reveal_next" }, ROUND_LENGTHS, NOW).ok).toBe(false);
  });

  it("reveal_all shows the whole round", () => {
    expect(data(CASES.marking.state, "reveal_all").data).toEqual({ status: "ROUND_REVEAL", revealedCount: 3 });
  });

  it("next_round is refused until every answer of the round is revealed", () => {
    expect(planRoundAction(CASES.revealPartly.state, { action: "next_round" }, ROUND_LENGTHS, NOW).ok).toBe(false);
    expect(planRoundAction(CASES.marking.state, { action: "next_round" }, ROUND_LENGTHS, NOW).ok).toBe(false);
  });

  it("next_round opens the next round with its first question asked and the scoreboard down", () => {
    expect(data(CASES.revealAll.state, "next_round").data).toMatchObject({
      status: "ROUND_OPEN",
      currentRoundIndex: 1,
      askedCount: 1,
      revealedCount: 0,
      scoreboardShown: false,
      countdownStartedAt: null,
      countdownSeconds: null,
    });
  });

  it("finish ends the game after the last round, and only then", () => {
    expect(data(CASES.revealAllLast.state, "finish").data).toMatchObject({ status: "ENDED" });
  });

  it("show and hide the scoreboard", () => {
    expect(data(CASES.marking.state, "show_scoreboard").data).toEqual({ scoreboardShown: true });
    expect(data(CASES.marking.state, "hide_scoreboard").data).toEqual({ scoreboardShown: false });
  });

  it("start_countdown is stamped by the server with one of the offered lengths", () => {
    expect(COUNTDOWN_CHOICES_SECONDS).toEqual([60, 120, 180, 300]);
    expect(data(CASES.openPartly.state, "start_countdown", { seconds: 180 }).data).toEqual({
      countdownStartedAt: NOW,
      countdownSeconds: 180,
    });
    expect(
      planRoundAction(CASES.openPartly.state, { action: "start_countdown", seconds: 7 }, ROUND_LENGTHS, NOW).ok
    ).toBe(false);
  });

  it("clear_countdown and set_tv_mode", () => {
    expect(data(CASES.marking.state, "clear_countdown").data).toEqual({
      countdownStartedAt: null,
      countdownSeconds: null,
    });
    expect(data(CASES.openPartly.state, "set_tv_mode", { showAll: false }).data).toEqual({ tvShowsAll: false });
  });

  it("end closes the game from any state", () => {
    expect(data(CASES.openPartly.state, "end").data).toEqual({ status: "ENDED" });
  });

  it("every plan is pinned to the round it read, so a stale request cannot act on the next round", () => {
    for (const [key] of Object.entries(CASES)) {
      for (const action of ROUND_ACTIONS) {
        if (action === "end") continue;
        const plan = planRoundAction(CASES[key].state, input(action), ROUND_LENGTHS, NOW);
        if (plan.ok) expect(plan.pin).toHaveProperty("currentRoundIndex", CASES[key].state.currentRoundIndex);
      }
    }
  });
});
