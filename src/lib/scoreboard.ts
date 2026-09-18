import type { Answer, Team } from "@prisma/client";

/** The question currently in play, and whether its answers may be counted
 * yet. */
export type QuestionInPlay = {
  roundIndex: number;
  questionIndex: number;
  /** True once the host has revealed — SESSION_STATUS.REVEAL or ENDED. */
  revealed: boolean;
};

/**
 * Team totals, highest first.
 *
 * `inPlay` is required rather than optional on purpose. This used to sum
 * every answer unconditionally, and the session route handed it the whole
 * answer list, which turned the live scoreboard into an answer oracle:
 * answers are scored the moment they are submitted, and a team may resubmit,
 * so a team could submit, poll, and watch its own total move — during
 * QUESTION_ACTIVE, while the answer was still secret — until it found the
 * right answer. The route was careful to withhold myAnswer.isCorrect and
 * myAnswer.pointsAwarded before the reveal, and then leaked the same fact
 * through the running total.
 *
 * Making the caller state the question in play, every time, is what stops a
 * future caller reintroducing that by simply not knowing to filter.
 */
export function computeScoreboard(teams: Team[], answers: Answer[], inPlay: QuestionInPlay) {
  const counted = inPlay.revealed
    ? answers
    : answers.filter((a) => !(a.roundIndex === inPlay.roundIndex && a.questionIndex === inPlay.questionIndex));

  const totals = new Map<string, number>();
  for (const team of teams) totals.set(team.id, 0);
  for (const answer of counted) {
    totals.set(answer.teamId, (totals.get(answer.teamId) ?? 0) + answer.pointsAwarded);
  }
  return teams
    .map((team) => ({ teamId: team.id, name: team.name, score: totals.get(team.id) ?? 0 }))
    .sort((a, b) => b.score - a.score);
}
