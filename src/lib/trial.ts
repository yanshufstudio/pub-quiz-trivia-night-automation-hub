import { createHash } from "node:crypto";
import type { Creator, Prisma } from "@prisma/client";
import { normaliseMailbox } from "@/lib/email-normalise";

/**
 * One Pro trial per account and per mailbox (PRC8).
 *
 * The same mailbox rule as the free allowance: "someone+1@gmail.com" and
 * "some.one@googlemail.com" are one inbox, so they share one trial. The key has
 * the same shape as freeAllowanceKey — a versioned sha256 — so no address is
 * stored.
 */
export function trialMailboxKey(email: string): string {
  return `v1.${createHash("sha256").update(normaliseMailbox(email)).digest("hex")}`;
}

/** Logged when a trial starts that the claim table says should not have: two
 * checkouts completed before the first webhook could record the first trial.
 * Worth alerting on — the owner may want to cancel the second trial. */
export const TRIAL_CLAIM_CONFLICT_LOG = "trial-claim-conflict";

/**
 * Record this creator's trial, inside the webhook's transaction.
 *
 * Pro is granted either way: the subscription is real, and the checkout is
 * where a second trial is refused. What this cannot refuse — a race it only
 * learns about afterwards — it logs.
 */
export async function recordTrialClaim(
  tx: Prisma.TransactionClient,
  creator: Pick<Creator, "id" | "userId">,
  subscriptionId: string
): Promise<void> {
  const own = await tx.trialClaim.findUnique({ where: { creatorId: creator.id } });
  if (own) {
    if (own.subscriptionId !== subscriptionId) {
      console.error(
        `${TRIAL_CLAIM_CONFLICT_LOG}: creator ${creator.id} started a second trial ` +
          `(${subscriptionId}; first was ${own.subscriptionId})`
      );
    }
    return;
  }

  const user = creator.userId ? await tx.user.findUnique({ where: { id: creator.userId } }) : null;
  if (!user) {
    console.error(`${TRIAL_CLAIM_CONFLICT_LOG}: creator ${creator.id} started a trial with no account to key it by`);
    return;
  }

  const mailboxKey = trialMailboxKey(user.email);
  const taken = await tx.trialClaim.findUnique({ where: { mailboxKey } });
  if (taken) {
    console.error(
      `${TRIAL_CLAIM_CONFLICT_LOG}: creator ${creator.id} started a trial (${subscriptionId}) on a ` +
        `mailbox that already trialled on creator ${taken.creatorId}`
    );
    return;
  }

  await tx.trialClaim.create({ data: { mailboxKey, creatorId: creator.id, subscriptionId } });
}
