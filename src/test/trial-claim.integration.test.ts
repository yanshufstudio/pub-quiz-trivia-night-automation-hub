import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { applySubscriptionEvent, type SubscriptionEvent } from "@/lib/paddle/apply-subscription";
import { trialMailboxKey, TRIAL_CLAIM_CONFLICT_LOG } from "@/lib/trial";
import { signInTestHost } from "./auth-fixture";

/**
 * PRC8: one trial per account and per mailbox. The webhook records the claim
 * on a subscription's first "trialing" event; the checkout reads it (PRC9).
 */

let n = 0;
function event(creatorId: string, overrides: Partial<SubscriptionEvent> = {}): SubscriptionEvent {
  n += 1;
  return {
    eventId: `evt_trial_${Date.now()}_${n}`,
    eventType: "subscription.created",
    occurredAt: new Date(Date.UTC(2026, 8, 10, 0, n)),
    subscriptionId: `sub_trial_${creatorId}`,
    customerId: `ctm_trial_${creatorId}`,
    status: "trialing",
    currentBillingPeriodStartsAt: null,
    priceIds: [],
    verifiedCreatorId: creatorId,
    ...overrides,
  };
}

function unique(local: string) {
  return `${local}${Math.random().toString(36).slice(2)}@gmail.com`;
}

describe("the trial claim (PRC8)", () => {
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await db.$disconnect();
  });

  it("is written on the first trialing event, keyed by the normalised mailbox", async () => {
    const email = unique("trial.host");
    const host = await signInTestHost(email);

    expect(await applySubscriptionEvent(event(host.id))).toBe("applied");

    const claim = await db.trialClaim.findUnique({ where: { creatorId: host.id } });
    expect(claim?.mailboxKey).toBe(trialMailboxKey(email));
    // A digest, never the address itself.
    expect(claim?.mailboxKey).not.toContain("@");
    // Same mailbox under a different spelling.
    expect(trialMailboxKey(email.replace("@", "+tag@").toUpperCase())).toBe(claim?.mailboxKey);
  });

  it("is written once, whatever follows", async () => {
    const host = await signInTestHost(unique("trial.again"));
    await applySubscriptionEvent(event(host.id));
    await applySubscriptionEvent(event(host.id, { eventType: "subscription.updated" }));
    await applySubscriptionEvent(event(host.id, { eventType: "subscription.updated", status: "active" }));

    expect(await db.trialClaim.count({ where: { creatorId: host.id } })).toBe(1);
  });

  it("is not written for a subscription that never trials", async () => {
    const host = await signInTestHost(unique("trial.none"));
    await applySubscriptionEvent(event(host.id, { status: "active" }));
    expect(await db.trialClaim.findUnique({ where: { creatorId: host.id } })).toBeNull();
  });

  it("still grants Pro when the mailbox already trialled on another account, and logs the race", async () => {
    // Two checkouts completed before the first webhook: the checkout could not
    // have known. Pro is granted — they are paying Paddle's trial — and the
    // owner is told.
    const local = `race${Math.random().toString(36).slice(2)}`;
    const first = await signInTestHost(`${local}@gmail.com`);
    const second = await signInTestHost(`${local}+second@gmail.com`);
    await applySubscriptionEvent(event(first.id));

    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await applySubscriptionEvent(event(second.id))).toBe("applied");

    expect((await db.creator.findUniqueOrThrow({ where: { id: second.id } })).plan).toBe("PRO");
    expect(await db.trialClaim.findUnique({ where: { creatorId: second.id } })).toBeNull();
    expect(errors.mock.calls.some(([message]) => String(message).startsWith(TRIAL_CLAIM_CONFLICT_LOG))).toBe(
      true
    );
  });
});
