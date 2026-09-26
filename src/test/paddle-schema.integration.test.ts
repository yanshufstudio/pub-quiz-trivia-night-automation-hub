import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";

describe("paddle schema", () => {
  it("stores subscription fields on Creator and dedupes PaddleEvent by eventId", async () => {
    const nonce = Math.random().toString(36).slice(2);
    const creator = await db.creator.create({
      data: {
        deviceKey: `schema-${nonce}`,
        email: `buyer-${nonce}@example.com`,
        paddleCustomerId: "ctm_test",
        paddleSubscriptionId: `sub_${nonce}`,
        subscriptionStatus: "active",
        subscriptionUpdatedAt: new Date("2026-09-09T10:00:00Z"),
        plan: "PRO",
      },
    });
    expect(creator.paddleSubscriptionId).toBe(`sub_${nonce}`);

    await db.paddleEvent.create({
      data: { eventId: `evt_dup_${nonce}`, type: "subscription.created", occurredAt: new Date() },
    });
    await expect(
      db.paddleEvent.create({
        data: { eventId: `evt_dup_${nonce}`, type: "subscription.created", occurredAt: new Date() },
      })
    ).rejects.toThrow();

    const token = await db.restoreToken.create({
      data: { tokenHash: `hash_${nonce}`, creatorId: creator.id, expiresAt: new Date(Date.now() + 60_000) },
    });
    expect(token.usedAt).toBeNull();
  });
});
