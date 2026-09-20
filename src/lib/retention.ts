import { db } from "@/lib/db";

/**
 * Deleting what has already stopped working.
 *
 * Two kinds of row outlive their use.
 *
 * A sign-in code nobody entered, or a Google round trip nobody finished,
 * leaves a `verification` row. Better Auth does clear these, but only
 * opportunistically: every time it looks a verification up — someone
 * submitting a code, someone coming back from Google — it deletes every
 * expired row in the table on the way (`findVerificationValue`, unless
 * `verification.disableCleanup` is set, which it is not). On a busy day that
 * is minutes. On a quiet week nobody signs in, nothing looks anything up,
 * and every expired code sits there until someone does.
 *
 * A sign-in session that lapses — 7 days without a visit — leaves its
 * `authSession` row, and nothing clears that at all: Better Auth drops an
 * expired session only when its cookie is presented again, and a lapsed
 * session is by definition one nobody presents.
 *
 * Neither kind can sign anybody in once it has expired. But without a sweep
 * /privacy could only promise that they stop working; with one running daily
 * it can promise that they are deleted, and say when.
 *
 * It deletes by `expiresAt` and nothing else: it never looks at who a row
 * belongs to, and never touches a user, an account link, a pack or a live
 * quiz session.
 */

export type RetentionSweep = {
  /** Expired sign-in codes and unfinished Google round trips removed. */
  verifications: number;
  /** Expired sign-in sessions removed. */
  sessions: number;
  /** Everything that expired before this instant was removed. */
  cutoff: string;
};

export async function sweepExpiredAuthRows(now: Date = new Date()): Promise<RetentionSweep> {
  const verifications = await db.verification.deleteMany({ where: { expiresAt: { lt: now } } });
  const sessions = await db.authSession.deleteMany({ where: { expiresAt: { lt: now } } });
  return { verifications: verifications.count, sessions: sessions.count, cutoff: now.toISOString() };
}
