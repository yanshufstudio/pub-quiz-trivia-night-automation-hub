import { afterEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { applySubscriptionEvent, type SubscriptionEvent } from "@/lib/paddle/apply-subscription";

/**
 * Exactly-once, at the level below the route: an event is recorded if and
 * only if the change it describes was made.
 */

afterEach(() => vi.restoreAllMocks());

async function creator() {
  return db.creator.create({ data: { deviceKey: `apply-${Math.random().toString(36).slice(2)}` } });
}

let n = 0;
function event(creatorId: string, overrides: Partial<SubscriptionEvent> = {}): SubscriptionEvent {
  n += 1;
  return {
    eventId: `evt_apply_${Date.now()}_${n}`,
    eventType: "subscription.created",
    occurredAt: new Date("2026-09-09T10:00:00Z"),
    subscriptionId: `sub_${creatorId}`,
    customerId: `ctm_${creatorId}`,
    status: "active",
    verifiedCreatorId: creatorId,
    ...overrides,
  };
}

/** Run the next transaction with a client whose creator.update fails once —
 * a database blip between recording the event and applying it. */
function failNextCreatorUpdate() {
  const real = db.$transaction.bind(db) as (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => Promise<unknown>;
  vi.spyOn(db, "$transaction").mockImplementationOnce(((fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
    real((tx) =>
      fn(
        new Proxy(tx, {
          get(target, prop, receiver) {
            if (prop !== "creator") return Reflect.get(target, prop, receiver);
            return new Proxy(target.creator, {
              get(c, q, r) {
                if (q === "update") return async () => { throw new Error("database blip"); };
                return Reflect.get(c, q, r);
              },
            });
          },
        })
      )
    )) as never);
}

describe("applySubscriptionEvent", () => {
  it("leaves no record when the change fails, so Paddle's retry applies it", async () => {
    // PR #4 recorded the event first and applied it afterwards: a failure in
    // between answered 500, and the retry was then acknowledged as a
    // duplicate and never applied. The subscription stayed paid and off.
    const c = await creator();
    const e = event(c.id);

    failNextCreatorUpdate();
    await expect(applySubscriptionEvent(e)).rejects.toThrow("database blip");
    expect(await db.paddleEvent.findUnique({ where: { eventId: e.eventId } })).toBeNull();
    expect((await db.creator.findUniqueOrThrow({ where: { id: c.id } })).plan).toBe("FREE");

    expect(await applySubscriptionEvent(e)).toBe("applied");
    expect((await db.creator.findUniqueOrThrow({ where: { id: c.id } })).plan).toBe("PRO");
  });

  it("applies a delivery once when Paddle sends it twice at the same moment", async () => {
    const c = await creator();
    const e = event(c.id);
    const results = await Promise.all([applySubscriptionEvent(e), applySubscriptionEvent(e)]);
    expect(results.sort()).toEqual(["applied", "duplicate"]);
    expect(await db.paddleEvent.count({ where: { eventId: e.eventId } })).toBe(1);
  });

  it("records nothing for an event it cannot place", async () => {
    const e = event("no-such-creator");
    expect(await applySubscriptionEvent(e)).toBe("unmatched");
    expect(await db.paddleEvent.findUnique({ where: { eventId: e.eventId } })).toBeNull();
  });

  it("never takes an unsigned id: without verifiedCreatorId an unbound subscription is unmatched", async () => {
    const c = await creator();
    expect(await applySubscriptionEvent(event(c.id, { verifiedCreatorId: null }))).toBe("unmatched");
    expect((await db.creator.findUniqueOrThrow({ where: { id: c.id } })).plan).toBe("FREE");
  });

  it("sends later events for a bound subscription to its creator, whatever id they carry", async () => {
    const owner = await creator();
    const other = await creator();
    const sub = `sub_bound_${owner.id}`;
    expect(await applySubscriptionEvent(event(owner.id, { subscriptionId: sub }))).toBe("applied");

    // A later event naming a different (validly signed) creator still goes to
    // the subscription's owner: the binding is what decides.
    const later = event(other.id, {
      subscriptionId: sub,
      status: "canceled",
      eventType: "subscription.canceled",
      occurredAt: new Date("2026-09-09T10:05:00Z"),
    });
    expect(await applySubscriptionEvent(later)).toBe("applied");
    expect((await db.creator.findUniqueOrThrow({ where: { id: owner.id } })).plan).toBe("FREE");
    expect((await db.creator.findUniqueOrThrow({ where: { id: other.id } })).paddleSubscriptionId).toBeNull();
  });
});
