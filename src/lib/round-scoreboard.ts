import { SESSION_STATUS } from "@/lib/session-state";

/**
 * Scores in a round-mode game (RM3).
 *
 * A team's score for a round is the sum of its marks in that round — or, when
 * the host has typed a total for that team and round (a paper team, sheets the
 * tables swapped and marked, or an override of a phone team's auto total), the
 * typed total instead. The scoreboard is the sum of round totals.
 *
 * Only rounds whose every answer has been revealed count (countedRounds). That
 * is what lets the host show the scoreboard at any moment — between questions,
 * mid-reveal — without it telling the room anything the reveal has not: a
 * partly revealed round moves nobody's score.
 */

type TeamLike = { id: string; name: string; isPaper: boolean };
type AnswerLike = { teamId: string; roundIndex: number; pointsAwarded: number };
type TypedLike = { teamId: string; roundIndex: number; points: number };

export type RoundTotalRow = {
  teamId: string;
  name: string;
  isPaper: boolean;
  /** The sum of the team's marks for the round. */
  auto: number;
  /** The total the host typed, or null when none stands. */
  typed: number | null;
  /** What counts: the typed total if there is one, else the auto total. */
  total: number;
};

export function roundTotals(
  teams: TeamLike[],
  answers: AnswerLike[],
  typed: TypedLike[],
  roundIndex: number
): RoundTotalRow[] {
  return teams.map((team) => {
    const auto = answers
      .filter((a) => a.teamId === team.id && a.roundIndex === roundIndex)
      .reduce((sum, a) => sum + a.pointsAwarded, 0);
    const entry = typed.find((t) => t.teamId === team.id && t.roundIndex === roundIndex);
    const typedPoints = entry ? entry.points : null;
    return { teamId: team.id, name: team.name, isPaper: team.isPaper, auto, typed: typedPoints, total: typedPoints ?? auto };
  });
}

/** Rounds 0..rounds-1 count; highest score first. */
export function computeRoundScoreboard(
  teams: TeamLike[],
  answers: AnswerLike[],
  typed: TypedLike[],
  rounds: number
) {
  const scores = new Map<string, number>(teams.map((t) => [t.id, 0]));
  for (let roundIndex = 0; roundIndex < rounds; roundIndex++) {
    for (const row of roundTotals(teams, answers, typed, roundIndex)) {
      scores.set(row.teamId, (scores.get(row.teamId) ?? 0) + row.total);
    }
  }
  return teams
    .map((team) => ({ teamId: team.id, name: team.name, score: scores.get(team.id) ?? 0 }))
    .sort((a, b) => b.score - a.score);
}

/** How many rounds, from the first, have every answer revealed. */
export function countedRounds(
  session: { status: string; currentRoundIndex: number; revealedCount: number },
  roundLengths: number[]
): number {
  const { status, currentRoundIndex, revealedCount } = session;
  if (status === SESSION_STATUS.LOBBY) return 0;
  const currentDone =
    (status === SESSION_STATUS.ROUND_REVEAL || status === SESSION_STATUS.ENDED) &&
    revealedCount >= (roundLengths[currentRoundIndex] ?? 0);
  return currentRoundIndex + (currentDone ? 1 : 0);
}
