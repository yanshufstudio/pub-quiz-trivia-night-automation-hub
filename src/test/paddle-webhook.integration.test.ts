import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/paddle/webhook/route";
import { db } from "@/lib/db";
import { customerPayload, payoutPayload, signedWebhookRequest, subscriptionPayload, TEST_WEBHOOK_SECRET } from "./paddle-fixtures";

beforeEach(() => vi.stubEnv("PADDLE_NOTIFICATION_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET));
afterEach(() => vi.unstubAllEnvs());

async function creator() {
  return db.creator.create({ data: { deviceKey: `wh-${Math.random().toString(36).slice(2)}` } });
}

describe("POST /api/paddle/webhook", () => {
  it("400s without a signature header", async () => {
    const res = await POST(new NextRequest("http://localhost:3000/api/paddle/webhook", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
  });

  it("500s on a bad signature and writes nothing", async () => {
    const c = await creator();
    const res = await POST(signedWebhookRequest(subscriptionPayload({ creatorId: c.id }), "wrong-secret"));
    expect(res.status).toBe(500);
    expect((await db.creator.findUniqueOrThrow({ where: { id: c.id } })).plan).toBe("FREE");
  });

  it("500s on a stale timestamp", async () => {
    const c = await creator();
    const res = await POST(signedWebhookRequest(subscriptionPayload({ creatorId: c.id }), TEST_WEBHOOK_SECRET, { ts: Math.floor(Date.now() / 1000) - 60 }));
    expect(res.status).toBe(500);
  });

  it("sets PRO on subscription.created and records the event", async () => {
    const c = await creator();
    const payload = subscriptionPayload({ creatorId: c.id, subscriptionId: `sub_${c.id}` });
    const res = await POST(signedWebhookRequest(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, result: "applied" });
    const after = await db.creator.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.plan).toBe("PRO");
    expect(after.paddleSubscriptionId).toBe(`sub_${c.id}`);
    expect(await db.paddleEvent.findUnique({ where: { eventId: payload.event_id } })).not.toBeNull();
  });

  it("acknowledges a duplicate event without re-applying", async () => {
    const c = await creator();
    const payload = subscriptionPayload({ creatorId: c.id, subscriptionId: `sub_${c.id}` });
    await POST(signedWebhookRequest(payload));
    await db.creator.update({ where: { id: c.id }, data: { plan: "FREE" } });
    const res = await POST(signedWebhookRequest(payload));
    expect(await res.json()).toEqual({ received: true, result: "duplicate" });
    expect((await db.creator.findUniqueOrThrow({ where: { id: c.id } })).plan).toBe("FREE");
  });

  it("sets FREE on subscription.canceled", async () => {
    const c = await creator();
    await POST(signedWebhookRequest(subscriptionPayload({ creatorId: c.id, subscriptionId: `sub_${c.id}`, occurredAt: "2026-09-09T10:00:00Z" })));
    const res = await POST(signedWebhookRequest(subscriptionPayload({ eventType: "subscription.canceled", status: "canceled", creatorId: null, subscriptionId: `sub_${c.id}`, occurredAt: "2026-09-09T10:00:05Z" })));
    expect(await res.json()).toEqual({ received: true, result: "applied" });
    expect((await db.creator.findUniqueOrThrow({ where: { id: c.id } })).plan).toBe("FREE");
  });

  it("200s with unmatched for an unknown creator", async () => {
    const res = await POST(signedWebhookRequest(subscriptionPayload({ creatorId: "nope", subscriptionId: "sub_nope" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, result: "unmatched" });
  });

  it("updates email on customer.updated", async () => {
    const c = await creator();
    await POST(signedWebhookRequest(subscriptionPayload({ creatorId: c.id, subscriptionId: `sub_${c.id}`, customerId: `ctm_${c.id}` })));
    const res = await POST(signedWebhookRequest(customerPayload({ customerId: `ctm_${c.id}`, email: `changed-${c.id}@example.com` })));
    expect(res.status).toBe(200);
    expect((await db.creator.findUniqueOrThrow({ where: { id: c.id } })).email).toBe(`changed-${c.id}@example.com`);
  });

  it("200s and ignores an unrelated event type", async () => {
    const res = await POST(signedWebhookRequest(payoutPayload()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, result: "ignored" });
  });
});
