import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applyCustomerEvent, applySubscriptionEvent, recordEvent } from "@/lib/paddle/apply-subscription";

async function creator() {
  return db.creator.create({ data: { deviceKey: `apply-${Math.random().toString(36).slice(2)}` } });
}

const t = (s: string) => new Date(`2026-09-09T10:00:${s}Z`);

describe("recordEvent", () => {
  it("returns new then duplicate for the same eventId", async () => {
    const id = `evt_${Math.random().toString(36).slice(2)}`;
    expect(await recordEvent(id, "subscription.created", t("00"))).toBe("new");
    expect(await recordEvent(id, "subscription.created", t("00"))).toBe("duplicate");
  });
});

describe("applySubscriptionEvent", () => {
  it("binds by creatorId and sets PRO for active", async () => {
    const c = await creator();
    const result = await applySubscriptionEvent({
      occurredAt: t("00"),
      subscriptionId: `sub_${c.id}`,
      customerId: "ctm_1",
      status: "active",
      creatorId: c.id,
      email: `buyer-${c.id}@example.com`,
    });
    expect(result).toBe("applied");
    const after = await db.creator.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.plan).toBe("PRO");
    expect(after.paddleSubscriptionId).toBe(`sub_${c.id}`);
    expect(after.paddleCustomerId).toBe("ctm_1");
    expect(after.email).toBe(`buyer-${c.id}@example.com`);
    expect(after.subscriptionUpdatedAt?.toISOString()).toBe(t("00").toISOString());
  });

  it("falls back to the stored subscription id when creatorId is missing", async () => {
    const c = await creator();
    await applySubscriptionEvent({ occurredAt: t("00"), subscriptionId: `sub_${c.id}`, customerId: "ctm_1", status: "active", creatorId: c.id, email: null });
    const result = await applySubscriptionEvent({ occurredAt: t("05"), subscriptionId: `sub_${c.id}`, customerId: "ctm_1", status: "canceled", creatorId: null, email: null });
    expect(result).toBe("applied");
    const after = await db.creator.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.plan).toBe("FREE");
    expect(after.subscriptionStatus).toBe("canceled");
  });

  it("ignores an event older than the stored one", async () => {
    const c = await creator();
    await applySubscriptionEvent({ occurredAt: t("10"), subscriptionId: `sub_${c.id}`, customerId: "ctm_1", status: "canceled", creatorId: c.id, email: null });
    const result = await applySubscriptionEvent({ occurredAt: t("05"), subscriptionId: `sub_${c.id}`, customerId: "ctm_1", status: "active", creatorId: c.id, email: null });
    expect(result).toBe("stale");
    const after = await db.creator.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.plan).toBe("FREE");
  });

  it("returns unmatched for an unknown creator and unknown subscription", async () => {
    const result = await applySubscriptionEvent({ occurredAt: t("00"), subscriptionId: "sub_nobody", customerId: "ctm_1", status: "active", creatorId: "does-not-exist", email: null });
    expect(result).toBe("unmatched");
  });

  it("keeps an existing email when the event carries none", async () => {
    const c = await creator();
    await applySubscriptionEvent({ occurredAt: t("00"), subscriptionId: `sub_${c.id}`, customerId: "ctm_1", status: "active", creatorId: c.id, email: `keep-${c.id}@example.com` });
    await applySubscriptionEvent({ occurredAt: t("01"), subscriptionId: `sub_${c.id}`, customerId: "ctm_1", status: "active", creatorId: c.id, email: null });
    const after = await db.creator.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.email).toBe(`keep-${c.id}@example.com`);
  });
});

describe("applyCustomerEvent", () => {
  it("updates email by paddleCustomerId and is a no-op for unknown customers", async () => {
    const c = await creator();
    await applySubscriptionEvent({ occurredAt: t("00"), subscriptionId: `sub_${c.id}`, customerId: `ctm_${c.id}`, status: "active", creatorId: c.id, email: `old-${c.id}@example.com` });
    await applyCustomerEvent({ customerId: `ctm_${c.id}`, email: `new-${c.id}@example.com` });
    await applyCustomerEvent({ customerId: "ctm_unknown", email: "nobody@example.com" });
    const after = await db.creator.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.email).toBe(`new-${c.id}@example.com`);
  });
});
