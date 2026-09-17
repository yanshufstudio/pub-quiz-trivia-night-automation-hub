import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isNewerEvent, statusToPlan } from "./plan";

export type SubscriptionEventInput = {
  occurredAt: Date;
  subscriptionId: string;
  customerId: string;
  status: string;
  creatorId: string | null;
  email: string | null;
};

/** Insert the event id; a unique-constraint failure means Paddle retried an
 * event that was already applied. */
export async function recordEvent(eventId: string, type: string, occurredAt: Date): Promise<"new" | "duplicate"> {
  try {
    await db.paddleEvent.create({ data: { eventId, type, occurredAt } });
    return "new";
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "duplicate";
    throw err;
  }
}

/**
 * Binds the subscription to a Creator (by the creatorId carried in the
 * checkout's custom_data, else by an already-stored subscription id) and
 * writes the derived plan. Out-of-order retries are refused by timestamp.
 */
export async function applySubscriptionEvent(input: SubscriptionEventInput): Promise<"applied" | "stale" | "unmatched"> {
  const creator =
    (input.creatorId ? await db.creator.findUnique({ where: { id: input.creatorId } }) : null) ??
    (await db.creator.findUnique({ where: { paddleSubscriptionId: input.subscriptionId } }));
  if (!creator) return "unmatched";
  if (!isNewerEvent(input.occurredAt, creator.subscriptionUpdatedAt)) return "stale";

  await db.creator.update({
    where: { id: creator.id },
    data: {
      plan: statusToPlan(input.status),
      subscriptionStatus: input.status,
      subscriptionUpdatedAt: input.occurredAt,
      paddleSubscriptionId: input.subscriptionId,
      paddleCustomerId: input.customerId,
      ...(input.email ? { email: input.email } : {}),
    },
  });
  return "applied";
}

export async function applyCustomerEvent(input: { customerId: string; email: string }): Promise<void> {
  await db.creator.updateMany({
    where: { paddleCustomerId: input.customerId },
    data: { email: input.email },
  });
}
