import { db } from "@/lib/db";
import { SESSION_STATUS, packWithRoundsArgs, type PackWithRounds } from "@/lib/session-state";
import { rescoreCurrentQuestion } from "@/lib/rescore";
import type { Session } from "@prisma/client";

/**
 * If `session` has a per-question timer (see POST /api/sessions) that has run
 * out, atomically flips it to REVEAL and returns the updated session — same
 * conditional-`updateMany` race-safety pattern as the advance route's
 * "reveal" action, so a poll racing a host's manual reveal (or another poll)
 * can't double-apply. Returns `session` unchanged when there's no timer, it
 * hasn't expired yet, or the question isn't active.
 *
 * Called from both the GET session route (lazy, on every poll) and the
 * answer-submission route (so a submission arriving just past expiry is
 * rejected rather than silently accepted).
 */
export async function autoRevealIfExpired(session: Session): Promise<Session> {
  if (
    session.status !== SESSION_STATUS.QUESTION_ACTIVE ||
    session.questionDurationSeconds == null ||
    session.questionStartedAt == null
  ) {
    return session;
  }

  const deadline = session.questionStartedAt.getTime() + session.questionDurationSeconds * 1000;
  if (Date.now() < deadline) {
    return session;
  }

  const { count } = await db.session.updateMany({
    where: {
      id: session.id,
      status: SESSION_STATUS.QUESTION_ACTIVE,
      currentRoundIndex: session.currentRoundIndex,
      currentQuestionIndex: session.currentQuestionIndex,
    },
    data: { status: SESSION_STATUS.REVEAL },
  });

  if (count === 0) {
    // Lost the race (a manual reveal or another poll got there first) — or
    // the host has already advanced past this question entirely. Either way,
    // re-fetch so the caller sees the current truth instead of assuming REVEAL.
    return db.session.findUniqueOrThrow({ where: { id: session.id } });
  }

  // This is the other way into REVEAL, so it rescores too — a question whose key
  // was fixed while it was open must not be marked by the old key just because the
  // timer got there before the host did (M7).
  const pack = (await db.quizPack.findUnique({
    where: { id: session.packId },
    ...packWithRoundsArgs,
  })) as PackWithRounds | null;
  await rescoreCurrentQuestion(session, pack);

  return { ...session, status: SESSION_STATUS.REVEAL };
}
