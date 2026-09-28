import { db } from "@/lib/db";
import { MAILBOX_PERIOD_MS, freeAllowanceKey } from "@/lib/free-allowance";

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
 *
 * A third kind was added with H1(b): a MailboxAllowance row, which is the one
 * thing here that deliberately outlives the account it was created for. See
 * sweepOrphanedMailboxAllowances below, which has its own rules and its own
 * argument for why deleting is safe.
 */

export type RetentionSweep = {
  /** Expired sign-in codes and unfinished Google round trips removed. */
  verifications: number;
  /** Expired sign-in sessions removed. */
  sessions: number;
  /** Mailbox free-allowance rows removed — period ended, no account behind them. */
  mailboxAllowances: number;
  /** Everything that expired before this instant was removed. */
  cutoff: string;
};

export async function sweepExpiredAuthRows(now: Date = new Date()): Promise<RetentionSweep> {
  const verifications = await db.verification.deleteMany({ where: { expiresAt: { lt: now } } });
  const sessions = await db.authSession.deleteMany({ where: { expiresAt: { lt: now } } });
  const mailboxAllowances = await sweepOrphanedMailboxAllowances(now);
  return {
    verifications: verifications.count,
    sessions: sessions.count,
    mailboxAllowances,
    cutoff: now.toISOString(),
  };
}

/** How many keys go into one `IN (...)` — SQLite has a bound-parameter limit and
 * this stays far inside it. */
const DELETE_CHUNK = 200;

/**
 * Delete a MailboxAllowance row once its period has ended **and** no existing
 * account's normalised mailbox maps to it (H1b).
 *
 * WHY THIS CANNOT GIVE ANYBODY AN ALLOWANCE THEY WOULD NOT OTHERWISE HAVE,
 * which is the question worth answering before writing the delete:
 *
 * An expired row is *already* equivalent to no row. `reserveMailboxGeneration`
 * resets `packsGenerated` to 0 and restarts the period whenever it finds the
 * period ended — so the next reservation for that mailbox gets a fresh allowance
 * whether the row is there or not. The row only carries force while its period is
 * live, and this never touches a live one. Deleting is therefore doing early, and
 * visibly, what the next generation would have done silently.
 *
 * Cutting on the **stored** `periodStartedAt` is the conservative side of the one
 * place the two could differ. The reservation can pull a row's anchor *back* when
 * an older account uses the mailbox, which makes the period end sooner, never
 * later — so "ended, by the stored value" implies "ended, by the effective
 * value". A row this sweep leaves alone might already be spent; a row it deletes
 * is never one that still counts.
 *
 * The second condition is not needed for that argument at all: it is there so the
 * row's existence is tied to somebody still having an account, which is what lets
 * /privacy say how long it is kept without hedging. It also means the common case
 * — a real host who keeps their account — never has their row deleted and
 * recreated, so the count they are subject to stays continuous.
 *
 * It is the only deletion in this file that looks at who a row belongs to, and it
 * looks by digest: the sweep never handles an address it has not been given by
 * `User.email` to hash.
 */
export async function sweepOrphanedMailboxAllowances(now: Date = new Date()): Promise<number> {
  const endedBefore = new Date(now.getTime() - MAILBOX_PERIOD_MS);

  // Candidates first, and only their keys. This is the small set — a row is a
  // candidate only once it has been idle for 30 days — so the work below is
  // bounded by that rather than by the size of the table.
  const candidates = await db.mailboxAllowance.findMany({
    where: { periodStartedAt: { lt: endedBefore } },
    select: { key: true },
  });
  if (candidates.length === 0) return 0;

  // Every address that still has an account, as keys. Loading them all is fine at
  // this scale and would not be at a much larger one; the shape of the fix then is
  // to store the key on the account rather than to re-derive it here, which is a
  // migration rather than a rewrite of this function.
  const live = new Set<string>();
  const users = await db.user.findMany({ select: { email: true } });
  for (const { email } of users) {
    if (email) live.add(freeAllowanceKey(email));
  }

  const orphaned = candidates.map((row) => row.key).filter((key) => !live.has(key));
  if (orphaned.length === 0) return 0;

  let deleted = 0;
  for (let i = 0; i < orphaned.length; i += DELETE_CHUNK) {
    const chunk = orphaned.slice(i, i + DELETE_CHUNK);
    const result = await db.mailboxAllowance.deleteMany({ where: { key: { in: chunk } } });
    deleted += result.count;
  }
  return deleted;
}
