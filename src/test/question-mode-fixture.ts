import { db } from "@/lib/db";
import { SESSION_MODE } from "@/lib/session-state";

/**
 * Turn a freshly created session into a one-question-at-a-time session.
 *
 * POST /api/sessions only creates round-mode games now (RM0), but sessions that
 * were already running when round mode shipped are QUESTION mode and must keep
 * finishing exactly as they started. The suites that guard that flow create a
 * session the normal way and then give it the shape an old row has — including
 * the per-question timer, which a new session can no longer ask for.
 */
export async function switchToQuestionMode(
  code: string,
  options: { questionDurationSeconds?: number | null } = {}
): Promise<void> {
  await db.session.update({
    where: { code: code.toUpperCase() },
    data: { mode: SESSION_MODE.QUESTION, questionDurationSeconds: options.questionDurationSeconds ?? null },
  });
}
