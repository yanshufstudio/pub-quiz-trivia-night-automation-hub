import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/paddle/webhook/route";
import { db } from "@/lib/db";
import {
  TEST_WEBHOOK_SECRET,
  customerPayload,
  payoutPayload,
  signedCustomData,
  signedWebhookRequest,
  subscriptionPayload,
} from "./paddle-fixtures";

/**
 * The webhook is the only thing that switches Pro on or off, so these drive
 * it through the real route with Paddle-signed requests — the same signature
 * scheme Paddle uses, verified by Paddle's own SDK.
 */

beforeEach(() => vi.stubEnv("PADDLE_NOTIFICATION_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET));
afterEach(() => vi.unstubAllEnvs());

async function creator() {
  return db.creator.create({ data: { deviceKey: `wh-${Math.random().toString(36).slice(2)}` } });
}

const reread = (id: string) => db.creator.findUniqueOrThrow({ where: { id } });

describe("POST /api/paddle/webhook — who it believes", () => {
  it("400s without a signature header", async () => {
    const res = await POST(new NextRequest("http://localhost:3000/api/paddle/webhook", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
  });

  it("500s on a bad Paddle signature and writes nothing", async () => {
    const c = await creator();
    const payload = subscriptionPayload({ customData: signedCustomData(c.id) });
    const res = await POST(signedWebhookRequest(payload, "wrong-secret"));
    expect(res.status).toBe(500);
    expect((await reread(c.id)).plan).toBe("FREE");
    expect(await db.paddleEvent.findUnique({ where: { eventId: payload.event_id } })).toBeNull();
  });

  it("500s on a stale Paddle timestamp", async () => {
    const c = await creator();
    const res = await POST(
      signedWebhookRequest(subscriptionPayload({ customData: signedCustomData(c.id) }), TEST_WEBHOOK_SECRET, {
        ts: Math.floor(Date.now() / 1000) - 60,
      })
    );
    expect(res.status).toBe(500);
  });

  it("switches Pro on for the creator the checkout signed for", async () => {
    const c = await creator();
    const payload = subscriptionPayload({ customData: signedCustomData(c.id), subscriptionId: `sub_${c.id}`, customerId: `ctm_${c.id}` });
    const res = await POST(signedWebhookRequest(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, result: "applied" });

    const after = await reread(c.id);
    expect(after.plan).toBe("PRO");
    expect(after.subscriptionStatus).toBe("active");
    expect(after.paddleSubscriptionId).toBe(`sub_${c.id}`);
    expect(after.paddleCustomerId).toBe(`ctm_${c.id}`);
    expect(await db.paddleEvent.findUnique({ where: { eventId: payload.event_id } })).not.toBeNull();
  });

  it("does not switch Pro on for an id without a valid signature — the PR #4 hole", async () => {
    // An unsigned id is what PR #4 trusted (it came from a cookie), and an
    // edited id arrives carrying the signature for a different one.
    const victim = await creator();
    const attacker = await creator();
    for (const customData of [
      { creatorId: victim.id },
      { creatorId: victim.id, creatorSig: signedCustomData(attacker.id).creatorSig },
    ]) {
      const payload = subscriptionPayload({ customData });
      const res = await POST(signedWebhookRequest(payload));
      expect(res.status, JSON.stringify(customData)).toBe(500);
      expect(await res.json()).toMatchObject({ result: "unmatched" });
      expect(await db.paddleEvent.findUnique({ where: { eventId: payload.event_id } })).toBeNull();
    }
    expect((await reread(victim.id)).plan).toBe("FREE");
    expect((await reread(victim.id)).paddleSubscriptionId).toBeNull();
  });

  it("answers 500 for a creator it cannot find, and applies the same event once it can", async () => {
    // Not recorded, so Paddle's retry is a real second attempt — the case
    // this matters for is configuration that is fixed in between.
    const payload = subscriptionPayload({ customData: signedCustomData("creator-that-does-not-exist-yet") });
    const first = await POST(signedWebhookRequest(payload));
    expect(first.status).toBe(500);

    await db.creator.create({ data: { id: "creator-that-does-not-exist-yet", deviceKey: `late-${Date.now()}` } });
    const retry = await POST(signedWebhookRequest(payload));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ received: true, result: "applied" });
    expect((await reread("creator-that-does-not-exist-yet")).plan).toBe("PRO");
  });
});

describe("POST /api/paddle/webhook — what it does", () => {
  it("acknowledges a duplicate event without re-applying it", async () => {
    const c = await creator();
    const payload = subscriptionPayload({ customData: signedCustomData(c.id), subscriptionId: `sub_${c.id}` });
    await POST(signedWebhookRequest(payload));
    await db.creator.update({ where: { id: c.id }, data: { plan: "FREE" } });

    const res = await POST(signedWebhookRequest(payload));
    expect(await res.json()).toEqual({ received: true, result: "duplicate" });
    expect((await reread(c.id)).plan).toBe("FREE");
  });

  it("follows the stored binding once it exists, signature or not", async () => {
    // Every later event for a subscription goes where its first one went —
    // including after a BETTER_AUTH_SECRET rotation, when the signature on
    // the subscription's customData no longer verifies.
    const c = await creator();
    await POST(
      signedWebhookRequest(
        subscriptionPayload({ customData: signedCustomData(c.id), subscriptionId: `sub_${c.id}`, occurredAt: "2026-09-09T10:00:00Z" })
      )
    );
    const res = await POST(
      signedWebhookRequest(
        subscriptionPayload({
          eventType: "subscription.canceled",
          status: "canceled",
          customData: { creatorId: c.id, creatorSig: "signed-with-a-secret-since-rotated" },
          subscriptionId: `sub_${c.id}`,
          occurredAt: "2026-09-09T10:00:05Z",
        })
      )
    );
    expect(await res.json()).toEqual({ received: true, result: "applied" });
    const after = await reread(c.id);
    expect(after.plan).toBe("FREE");
    expect(after.subscriptionStatus).toBe("canceled");
  });

  it("ignores an older event that arrives after a newer one", async () => {
    const c = await creator();
    const sub = `sub_${c.id}`;
    await POST(signedWebhookRequest(subscriptionPayload({ customData: signedCustomData(c.id), subscriptionId: sub, eventType: "subscription.canceled", status: "canceled", occurredAt: "2026-09-09T10:00:10Z" })));
    const res = await POST(signedWebhookRequest(subscriptionPayload({ customData: signedCustomData(c.id), subscriptionId: sub, status: "active", occurredAt: "2026-09-09T10:00:00Z" })));
    expect(await res.json()).toEqual({ received: true, result: "stale" });
    expect((await reread(c.id)).plan).toBe("FREE");
  });

  it("keeps Pro when a host switches plans: buys yearly, then cancels monthly", async () => {
    const c = await creator();
    const monthly = `sub_m_${c.id}`;
    const yearly = `sub_y_${c.id}`;
    await POST(signedWebhookRequest(subscriptionPayload({ customData: signedCustomData(c.id), subscriptionId: monthly, occurredAt: "2026-09-09T10:00:00Z" })));
    await POST(signedWebhookRequest(subscriptionPayload({ customData: signedCustomData(c.id), subscriptionId: yearly, occurredAt: "2026-09-10T10:00:00Z" })));
    expect((await reread(c.id)).paddleSubscriptionId).toBe(yearly);

    // The old monthly subscription's cancellation arrives last and is newer
    // than anything stored. Before this rule it switched Pro off, and bound
    // the account back to the subscription it had just cancelled.
    const res = await POST(
      signedWebhookRequest(
        subscriptionPayload({ eventType: "subscription.canceled", status: "canceled", customData: signedCustomData(c.id), subscriptionId: monthly, occurredAt: "2026-09-11T10:00:00Z" })
      )
    );
    expect(await res.json()).toEqual({ received: true, result: "superseded" });
    const after = await reread(c.id);
    expect(after.plan).toBe("PRO");
    expect(after.paddleSubscriptionId).toBe(yearly);
  });

  it("stays Pro through past_due (Paddle is still retrying the card) and drops on paused", async () => {
    const c = await creator();
    const sub = `sub_${c.id}`;
    await POST(signedWebhookRequest(subscriptionPayload({ customData: signedCustomData(c.id), subscriptionId: sub, occurredAt: "2026-09-09T10:00:00Z" })));
    await POST(signedWebhookRequest(subscriptionPayload({ eventType: "subscription.past_due", status: "past_due", subscriptionId: sub, occurredAt: "2026-09-09T11:00:00Z" })));
    expect((await reread(c.id)).plan).toBe("PRO");
    await POST(signedWebhookRequest(subscriptionPayload({ eventType: "subscription.paused", status: "paused", subscriptionId: sub, occurredAt: "2026-09-09T12:00:00Z" })));
    expect((await reread(c.id)).plan).toBe("FREE");
  });

  it("acknowledges customer events and stores nothing from them", async () => {
    const c = await creator();
    await POST(signedWebhookRequest(subscriptionPayload({ customData: signedCustomData(c.id), subscriptionId: `sub_${c.id}`, customerId: `ctm_${c.id}` })));
    const res = await POST(signedWebhookRequest(customerPayload({ customerId: `ctm_${c.id}`, email: `buyer-${c.id}@example.com` })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, result: "ignored" });
    // PR #4 copied the Paddle customer's email here; nothing does now.
    expect((await reread(c.id)).email).toBeNull();
  });

  it("200s and ignores an unrelated event type", async () => {
    const res = await POST(signedWebhookRequest(payoutPayload()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, result: "ignored" });
  });
});
