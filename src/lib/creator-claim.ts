import { randomUUID } from "node:crypto";
import type { Creator, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withRolledPeriod } from "@/lib/creator";

/**
 * Turning a `pq_creator` cookie into an account's Creator, once.
 *
 * Before accounts, a host *was* a cookie: their packs and their free
 * allowance hung off `Creator.deviceKey`. Those rows are real work that real
 * people did, so signing in has to carry them over rather than stranding
 * them behind a cookie nobody will ever present again.
 *
 * Every rule here exists because the alternative is a way to get free packs:
 *
 * - A Creator that already belongs to *another* user is never touched. The
 *   cookie is unauthenticated — anyone can send any value — so "this cookie
 *   names a creator" can never by itself be permission to take it. Only an
 *   unclaimed (`userId` null) creator is claimable, and the claim is written
 *   as a conditional update so two racing tabs cannot both win it.
 * - Merging two creators takes the HIGHER used count, never the account's own.
 *   Otherwise the claim itself would be the exploit: generate two packs, sign
 *   into a fresh account, and the merge hands the allowance back.
 * - `Creator.userId` is UNIQUE in the database. Every invariant below is
 *   ultimately enforced there rather than by this code being careful.
 */

/** What a merge should leave on the surviving Creator. Pure, so the rule can
 * be tested without a database. */
export function mergeAllowance(
  own: Creator,
  claimed: Creator
): { packsGeneratedInPeriod: number; periodStartedAt: Date; plan: string } {
  // Roll both first. An expired period is genuinely spent — carrying its old
  // count across would punish a claim for usage that had already lapsed on
  // both sides, and rolling is what the rest of the app would have done to
  // either row on its next read anyway.
  const mine = withRolledPeriod(own);
  const theirs = withRolledPeriod(claimed);

  // Strictly greater, not >=: on a tie the account keeps its own period, so a
  // claim can never *lengthen* the wait for an allowance to roll. It can only
  // raise the count, which is the direction that cannot be abused.
  const takeTheirs = theirs.packsGeneratedInPeriod > mine.packsGeneratedInPeriod;

  return {
    packsGeneratedInPeriod: Math.max(mine.packsGeneratedInPeriod, theirs.packsGeneratedInPeriod),
    periodStartedAt: takeTheirs ? theirs.periodStartedAt : mine.periodStartedAt,
    // PRO survives a merge from either side. A paid plan on the cookie creator
    // is money someone spent; silently dropping it to FREE because they signed
    // in is the worse failure by a distance. (Nothing on master sets PRO — see
    // the PR body's note on what PR #4 has to do here.)
    plan: mine.plan === "PRO" || theirs.plan === "PRO" ? "PRO" : mine.plan,
  };
}

/** The Creator a signed-in user owns, creating or claiming one if needed. */
export async function creatorForUser(userId: string, deviceKey: string | undefined): Promise<Creator> {
  // One query for both sides of the question: the account's own creator, and
  // the one the browser's legacy cookie names. `userId` and `deviceKey` are
  // both unique indexes, so this is two point lookups, not a scan.
  const where: Prisma.CreatorWhereInput = deviceKey
    ? { OR: [{ userId }, { deviceKey }] }
    : { userId };
  const rows = await db.creator.findMany({ where });

  const own = rows.find((row) => row.userId === userId);
  const cookie = deviceKey ? rows.find((row) => row.deviceKey === deviceKey) : undefined;
  // Unclaimed only. A cookie naming someone else's creator is simply ignored.
  const claimable = cookie && cookie.userId === null ? cookie : undefined;

  if (own) {
    if (!claimable || claimable.id === own.id) return own;
    return mergeIntoOwn(own, claimable);
  }

  if (claimable) {
    // Conditional on still being unclaimed: the loser of a race updates zero
    // rows and falls through to re-read, rather than overwriting the winner.
    const linked = await db.creator.updateMany({
      where: { id: claimable.id, userId: null },
      data: { userId },
    });
    if (linked.count === 1) {
      const fresh = await db.creator.findUnique({ where: { id: claimable.id } });
      if (fresh) return fresh;
    }
    return reReadOrCreate(userId);
  }

  return createForUser(userId);
}

/**
 * Move a claimed creator's packs onto the account's own, take the higher
 * allowance, and delete the husk.
 *
 * One interactive transaction, which this app already runs against Turso in
 * production. The re-read inside it is the point: the row may have been
 * claimed by another request between the findMany above and this call, and
 * the `userId: null` check has to be made against what is in the database
 * now, not against what we read a moment ago.
 */
async function mergeIntoOwn(own: Creator, orphan: Creator): Promise<Creator> {
  await db.$transaction(async (tx) => {
    const fresh = await tx.creator.findUnique({ where: { id: orphan.id } });
    if (!fresh || fresh.userId !== null) return;

    await tx.quizPack.updateMany({ where: { creatorId: orphan.id }, data: { creatorId: own.id } });
    await tx.creator.update({ where: { id: own.id }, data: mergeAllowance(own, fresh) });
    await tx.creator.delete({ where: { id: orphan.id } });
  });

  const merged = await db.creator.findUnique({ where: { id: own.id } });
  // The account's own creator cannot vanish under us — nothing in this file
  // deletes it — but the type says it can, so say what we would do about it.
  return merged ?? own;
}

async function createForUser(userId: string): Promise<Creator> {
  try {
    // A `deviceKey` is still required by the schema and still unique. It is
    // no longer an identity — nothing reads it back for an account-created
    // creator — so it gets a value that could never collide with a cookie.
    return await db.creator.create({ data: { userId, deviceKey: randomUUID() } });
  } catch {
    // Almost certainly P2002 on Creator.userId: a concurrent request for the
    // same account got there first. That unique index is exactly what stops
    // one person ending up with two creators (and two free allowances), so
    // losing this race is the system working.
    return reReadOrCreate(userId);
  }
}

async function reReadOrCreate(userId: string): Promise<Creator> {
  const existing = await db.creator.findUnique({ where: { userId } });
  if (existing) return existing;

  // Not a loop: this only runs after a write that failed *because* something
  // else got there first, so one more attempt settles it. The second catch
  // exists because the alternative — letting a P2002 out of here — would turn
  // a race this code has already handled into a 500 on a host page.
  try {
    return await db.creator.create({ data: { userId, deviceKey: randomUUID() } });
  } catch (err) {
    const settled = await db.creator.findUnique({ where: { userId } });
    if (settled) return settled;
    throw err;
  }
}
