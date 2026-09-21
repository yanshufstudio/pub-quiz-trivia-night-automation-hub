import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isNewerEvent, statusToPlan } from "./plan";

export type SubscriptionEvent = {
  eventId: string;
  eventType: string;
  occurredAt: Date;
  subscriptionId: string;
  customerId: string;
  status: string;
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
 */
export type ApplyResult = "applied" | "duplicate" | "stale" | "superseded" | "unmatched";

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

      await tx.creator.update({
        where: { id: creator.id },
        data: {
          plan: statusToPlan(event.status),
          subscriptionStatus: event.status,
          subscriptionUpdatedAt: event.occurredAt,
          paddleSubscriptionId: event.subscriptionId,
          paddleCustomerId: event.customerId,
        },
      });
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
