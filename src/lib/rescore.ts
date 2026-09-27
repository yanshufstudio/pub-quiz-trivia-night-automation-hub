import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isLikelyCorrect } from "@/lib/scoring";
import { parseOptions } from "@/lib/question-types";
import type { PackWithRounds } from "@/lib/session-state";
import { getCurrentQuestion } from "@/lib/session-state";

/**
 * Re-mark the current question's answers against the answer key as it stands now
 * (M7).
 *
 * A submission is marked when it arrives, against the key at that moment. Editing
 * a question's answer or its list of acceptable answers is allowed mid-game — it
 * moves no index, so the live-game guard permits it (src/lib/live-game-guard.ts) —
 * and it is the ordinary fix for a typo or an answer the room is right about. But
 * every answer already in was marked against the old key and kept its old mark, so
 * the host fixed the question and the scoreboard stayed wrong. The teams who
 * answered before the fix were scored by one rule and the ones after by another.
 *
 * Rescoring happens at the reveal, which is the moment the marks become visible
 * and therefore the last moment they can be corrected quietly. Both paths into
 * REVEAL call it: the host's own "reveal" action and the timer's auto-reveal.
 *
 * **A host's own mark is never touched.** `hostOverride` is what says a human
 * decided, and a human deciding outranks the key: a host who accepted "Canberra,
 * Australia" does not want it re-marked wrong a second later. That is also why
 * this cannot simply recompute every row.
 */
export async function rescoreCurrentQuestion(
  session: { id: string; currentRoundIndex: number; currentQuestionIndex: number },
  pack: PackWithRounds | null,
  tx: Prisma.TransactionClient | typeof db = db
): Promise<number> {
  const question = pack
    ? getCurrentQuestion(pack, session.currentRoundIndex, session.currentQuestionIndex)
    : null;
  if (!question) return 0;

  const acceptable = parseOptions(question.acceptableAnswers);
  const answers = await tx.answer.findMany({
    where: {
      sessionId: session.id,
      roundIndex: session.currentRoundIndex,
      questionIndex: session.currentQuestionIndex,
      hostOverride: false,
    },
    select: { id: true, text: true, isCorrect: true, pointsAwarded: true },
  });

  let changed = 0;
  for (const answer of answers) {
    const isCorrect = isLikelyCorrect(answer.text, question.answer, acceptable);
    const pointsAwarded = isCorrect ? question.points : 0;
    // Only write the rows that actually move. A reveal on a question nobody's key
    // changed should not rewrite every answer in the room.
    if (answer.isCorrect === isCorrect && answer.pointsAwarded === pointsAwarded) continue;
    await tx.answer.update({ where: { id: answer.id }, data: { isCorrect, pointsAwarded } });
    changed += 1;
  }
  return changed;
}
