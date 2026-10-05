import type { Prisma } from "@prisma/client";
import { SESSION_STATUS } from "@/lib/session-state";

/**
 * Round mode's state machine, as a pure function (RM1).
 *
 * A round-mode game goes LOBBY → ROUND_OPEN → ROUND_MARKING → ROUND_REVEAL →
 * (next round's ROUND_OPEN | ENDED). Within ROUND_OPEN the host asks the round's
 * questions one at a time (`askedCount`); within ROUND_REVEAL the answers go up
 * one at a time (`revealedCount`). The scoreboard, the countdown and the TV's
 * layout are flags on top that never move the game.
 *
 * planRoundAction decides; it does not write. It returns the update to make and
 * the `pin` — the part of the state it read that must still hold when the update
 * lands. POST /api/sessions/[code]/advance puts the pin in the `where` of a
 * conditional update, so of two racing requests (a double tap, a retry on venue
 * wifi, a second device) only the first changes anything and the second gets a
 * 409 instead of asking two questions.
 */

export const ROUND_ACTIONS = [
  "start",
  "ask_next",
  "close_round",
  "reveal_next",
  "reveal_all",
  "show_scoreboard",
  "hide_scoreboard",
  "next_round",
  "finish",
  "end",
  "start_countdown",
  "clear_countdown",
  "set_tv_mode",
] as const;

export type RoundAction = (typeof ROUND_ACTIONS)[number];

/** The countdown lengths the host is offered, in seconds (1, 2, 3 and 5 minutes). */
export const COUNTDOWN_CHOICES_SECONDS = [60, 120, 180, 300] as const;

export type RoundSessionState = {
  status: string;
  currentRoundIndex: number;
  askedCount: number;
  revealedCount: number;
};

export type RoundActionInput = { action: RoundAction; seconds?: number; showAll?: boolean };

export type RoundPlan =
  | { ok: true; pin: Prisma.SessionWhereInput; data: Prisma.SessionUpdateManyMutationInput }
  | { ok: false; error: string };

const { LOBBY, ROUND_OPEN, ROUND_MARKING, ROUND_REVEAL, ENDED } = SESSION_STATUS;

/** Every status in which a round-mode game is under way. */
const IN_PLAY: string[] = [ROUND_OPEN, ROUND_MARKING, ROUND_REVEAL];

const NO_COUNTDOWN = { countdownStartedAt: null, countdownSeconds: null };

function refuse(error: string): RoundPlan {
  return { ok: false, error };
}

/**
 * @param roundLengths the number of questions in each round of the pack, in order.
 */
export function planRoundAction(
  state: RoundSessionState,
  input: RoundActionInput,
  roundLengths: number[],
  now: Date
): RoundPlan {
  const { status, currentRoundIndex: round, askedCount, revealedCount } = state;
  const length = roundLengths[round] ?? 0;
  const isLastRound = round + 1 >= roundLengths.length;
  // Pins the exact state read — for the transitions that move a counter.
  const exact = { status, currentRoundIndex: round, askedCount, revealedCount };
  // Pins only "still in one of these states, same round" — for the actions a
  // retry cannot make worse (a flag set twice is the same flag).
  const within = (statuses: string[]) => ({ status: { in: statuses }, currentRoundIndex: round });

  switch (input.action) {
    case "start":
      if (status !== LOBBY) return refuse("Quiz already started");
      if (roundLengths.length === 0 || roundLengths[0] === 0) return refuse("This pack has no questions");
      return {
        ok: true,
        pin: exact,
        data: { status: ROUND_OPEN, currentRoundIndex: 0, askedCount: 1, revealedCount: 0, ...NO_COUNTDOWN },
      };

    case "ask_next":
      if (status !== ROUND_OPEN) return refuse("The round is not open");
      if (askedCount >= length) return refuse("Every question in this round has been asked");
      // A countdown belongs to the question it was started on: carried over,
      // it showed "Time's up!" on the next one from the moment it was asked.
      return { ok: true, pin: exact, data: { askedCount: askedCount + 1, ...NO_COUNTDOWN } };

    case "close_round":
      if (status !== ROUND_OPEN) return refuse("The round is not open");
      if (askedCount < length) return refuse("Ask every question in the round before closing it");
      return { ok: true, pin: exact, data: { status: ROUND_MARKING, ...NO_COUNTDOWN } };

    case "reveal_next":
      if (status !== ROUND_MARKING && status !== ROUND_REVEAL) return refuse("Close the round before revealing");
      if (revealedCount >= length) return refuse("Every answer in this round has been revealed");
      return { ok: true, pin: exact, data: { status: ROUND_REVEAL, revealedCount: revealedCount + 1 } };

    case "reveal_all":
      if (status !== ROUND_MARKING && status !== ROUND_REVEAL) return refuse("Close the round before revealing");
      return {
        ok: true,
        pin: within([ROUND_MARKING, ROUND_REVEAL]),
        data: { status: ROUND_REVEAL, revealedCount: length },
      };

    case "show_scoreboard":
    case "hide_scoreboard":
      if (!IN_PLAY.includes(status)) return refuse("The quiz is not under way");
      return { ok: true, pin: within(IN_PLAY), data: { scoreboardShown: input.action === "show_scoreboard" } };

    case "next_round":
      if (status !== ROUND_REVEAL || revealedCount < length) {
        return refuse("Reveal every answer in this round before moving on");
      }
      if (isLastRound) return refuse("That was the last round — finish the quiz instead");
      return {
        ok: true,
        pin: exact,
        data: {
          status: ROUND_OPEN,
          currentRoundIndex: round + 1,
          askedCount: 1,
          revealedCount: 0,
          scoreboardShown: false,
          ...NO_COUNTDOWN,
        },
      };

    case "finish":
      if (status !== ROUND_REVEAL || revealedCount < length || !isLastRound) {
        return refuse("Reveal every answer in the last round before finishing");
      }
      return { ok: true, pin: exact, data: { status: ENDED, ...NO_COUNTDOWN } };

    case "end":
      // From any state, and a no-op on a game that has already ended — see the
      // "end" branch of the advance route for why it never reports a lost race.
      return { ok: true, pin: { status: { not: ENDED } }, data: { status: ENDED } };

    case "start_countdown":
      if (status !== ROUND_OPEN) return refuse("A countdown can only run while the round is open");
      if (!COUNTDOWN_CHOICES_SECONDS.some((s) => s === input.seconds)) return refuse("Invalid countdown length");
      return {
        ok: true,
        pin: within([ROUND_OPEN]),
        data: { countdownStartedAt: now, countdownSeconds: input.seconds },
      };

    case "clear_countdown":
      if (status === ENDED) return refuse("The quiz has ended");
      return { ok: true, pin: within([LOBBY, ...IN_PLAY]), data: { ...NO_COUNTDOWN } };

    case "set_tv_mode":
      if (status === ENDED) return refuse("The quiz has ended");
      if (typeof input.showAll !== "boolean") return refuse("Invalid TV mode");
      return { ok: true, pin: within([LOBBY, ...IN_PLAY]), data: { tvShowsAll: input.showAll } };
  }
}
