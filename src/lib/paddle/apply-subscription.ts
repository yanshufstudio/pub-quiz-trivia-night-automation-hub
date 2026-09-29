import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isNewerEvent, statusToPlan } from "./plan";
import { shouldRollProPeriod } from "@/lib/pro-limits";
import { priceOwnership } from "./prices";
import { paddleEnv } from "./config";
import { recordTrialClaim } from "@/lib/trial";

export type SubscriptionEvent = {
  eventId: string;
  eventType: string;
  occurredAt: Date;
  subscriptionId: string;
  customerId: string;
  status: string;
  /**
   * Paddle's `current_billing_period.starts_at`, when the event carries one.
   *
   * It is what rolls proPacksGeneratedInPeriod (M8): /refunds' terms are stated
   * per billing period, so the boundary has to be Paddle's rather than a clock
   * of ours. Null for an event that reports no period — a cancellation, or a
   * status change outside a period — and a null never rolls anything.
   */
  currentBillingPeriodStartsAt: Date | null;
  /**
   * Every price id the event names, in the order the payload lists them.
   *
   * The Paddle account also sells another product, and every notification on the
   * account reaches this endpoint, so this is how an event about that product is
   * recognised and dropped (C2). Empty for an event whose items we cannot read,
   * which is treated as "cannot tell" rather than as "not ours" — see
   * priceOwnership.
   */
  priceIds: readonly string[];
  /** From customData, and only if its signature verified (checkout-token.ts). */
  verifiedCreatorId: string | null;
};

/**
 * - applied: the creator's subscription fields and plan were updated.
 * - duplicate: this event id was applied before; nothing was done.
 * - stale: older than what the creator already has; recorded, not applied.
 * - superseded: about a subscription the creator no longer holds, and it
 *   would take Pro away; recorded, not applied (see below).
 * - unmatched: no creator could be found. Nothing is recorded, so the route
 *   answers 500 and Paddle retries — see the webhook route for why.
 * - foreign-price: the event is about a product we do not sell. Acknowledged and
 *   ignored without touching the database (C2).
 */
export type ApplyResult =
  | "applied"
  | "duplicate"
  | "stale"
  | "superseded"
  | "unmatched"
  | "foreign-price";

type Tx = Prisma.TransactionClient;

/**
 * Which creator an event is about.
 *
 * The stored binding wins: once a subscription has been attached to a
 * creator, every later event for it goes there, whatever its customData
 * says and whether or not its signature still verifies (it will not, after
 * a BETTER_AUTH_SECRET rotation). The signed creator id is only consulted
 * for a subscription nobody holds yet — in practice its first event.
 *
 * Nothing here trusts an unsigned id. PR #4 did, taking customData.creatorId
 * at face value, and it came from a cookie.
 */
async function creatorFor(tx: Tx, event: SubscriptionEvent) {
  const bound = await tx.creator.findUnique({ where: { paddleSubscriptionId: event.subscriptionId } });
  if (bound) return bound;
  if (!event.verifiedCreatorId) return null;
  return tx.creator.findUnique({ where: { id: event.verifiedCreatorId } });
}

async function record(tx: Tx, event: SubscriptionEvent) {
  await tx.paddleEvent.create({
    data: { eventId: event.eventId, type: event.eventType, occurredAt: event.occurredAt },
  });
}

/**
 * Apply one `subscription.*` event, exactly once.
 *
 * The event is recorded in the same transaction as the change it makes. PR #4
 * recorded it first and applied it afterwards, so a failure in between (a
 * database blip, a deploy) answered 500, Paddle retried, the retry found the
 * event already recorded and acknowledged it as a duplicate — and the change
 * was never made. Here a failure rolls both back and the retry applies it.
 */
export async function applySubscriptionEvent(event: SubscriptionEvent): Promise<ApplyResult> {
  // Before anything else, and before any database work: is this even our
  // product? The Paddle account also sells Or Zarua, and every notification on
  // the account arrives here (C2). Only a positive "these prices are not ours"
  // drops an event — an event we cannot classify keeps whatever handling it had,
  // because dropping a real subscription.canceled would leave somebody on Pro
  // after they stopped paying.
  //
  // Dropped without recording it, deliberately: the PaddleEvent table exists to
  // make *our* events idempotent, and filling it with another product's traffic
  // would make it useless for reading. Paddle needs no more than the 200 the
  // route answers.
  if (priceOwnership(event.priceIds) === "foreign") return "foreign-price";

  try {
    return await db.$transaction(async (tx) => {
      if (await tx.paddleEvent.findUnique({ where: { eventId: event.eventId } })) return "duplicate";

      const creator = await creatorFor(tx, event);
      if (!creator) return "unmatched";

      // A creator holds one subscription at a time: the one in
      // paddleSubscriptionId. A host who moves from monthly to yearly buys
      // the new one and then cancels the old one, and that cancellation must
      // not switch Pro off while the new subscription is paying for it. So an
      // event about a subscription the creator no longer holds may *grant*
      // Pro (a new purchase takes over the binding) but never removes it.
      if (
        creator.paddleSubscriptionId &&
        creator.paddleSubscriptionId !== event.subscriptionId &&
        statusToPlan(event.status) === "FREE"
      ) {
        await record(tx, event);
        return "superseded";
      }

      if (!isNewerEvent(event.occurredAt, creator.subscriptionUpdatedAt)) {
        await record(tx, event);
        return "stale";
      }

      // A new billing period zeroes the Pro pack count (M8). Rolled here, in
      // the same transaction as the event that reports it, so the count and
      // the period it belongs to can never be written apart — and only
      // forwards: a retried or out-of-order event carrying an older period
      // start must not reset a count the current period has accrued.
      const rollsPeriod = shouldRollProPeriod(
        event.currentBillingPeriodStartsAt,
        creator.proPeriodStartedAt
      );

      await tx.creator.update({
        where: { id: creator.id },
        data: {
          plan: statusToPlan(event.status),
          // Which Paddle this grant came from (C1). Written on every applied
          // event, not only the ones that grant: it records the environment of
          // the deployment that last spoke for this subscription, so a row can
          // never be left claiming Pro under an environment that did not grant
          // it. A sandbox value makes the row FREE on production, and vice
          // versa — see effectivePlan in src/lib/creator.ts.
          proEnvironment: paddleEnv(),
          subscriptionStatus: event.status,
          subscriptionUpdatedAt: event.occurredAt,
          paddleSubscriptionId: event.subscriptionId,
          paddleCustomerId: event.customerId,
          ...(rollsPeriod
            ? {
                proPeriodStartedAt: event.currentBillingPeriodStartsAt,
                proPacksGeneratedInPeriod: 0,
              }
            : {}),
        },
      });
      // PRC8: the checkout offers a trial only where none was claimed.
      if (event.status === "trialing") await recordTrialClaim(tx, creator, event.subscriptionId);
      await record(tx, event);
      return "applied";
    });
  } catch (err) {
    // Two deliveries of one event racing past the duplicate check: the second
    // insert hits the primary key and its whole transaction rolls back. Only
    // call it a duplicate if the event row really is there now — any other
    // unique violation is a real failure and must surface as a 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      if (await db.paddleEvent.findUnique({ where: { eventId: event.eventId } })) return "duplicate";
    }
    throw err;
  }
}
