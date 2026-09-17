import { NextRequest, NextResponse } from "next/server";
import { EventName, Paddle, type EventEntity } from "@paddle/paddle-node-sdk";
import { webhookSecret } from "@/lib/paddle/config";
import { applyCustomerEvent, applySubscriptionEvent, recordEvent } from "@/lib/paddle/apply-subscription";

const SUBSCRIPTION_EVENTS = new Set<string>([
  EventName.SubscriptionCreated,
  EventName.SubscriptionUpdated,
  EventName.SubscriptionActivated,
  EventName.SubscriptionCanceled,
  EventName.SubscriptionPastDue,
  EventName.SubscriptionPaused,
  EventName.SubscriptionResumed,
  EventName.SubscriptionTrialing,
]);

// Verification only needs the secret, not the API key, so a bare Paddle
// instance is fine here and keeps this route independent of PADDLE_API_KEY.
const verifier = new Paddle("unused-for-verification");

/**
 * Paddle delivers at least once and retries any non-2xx for up to three
 * days. Rules: 400 for a request that can never verify (no signature/body),
 * 500 for anything that throws (bad signature, DB down) so Paddle retries,
 * 200 for everything else including duplicates and events we do not use.
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("paddle-signature") ?? "";
  const rawBody = await req.text();
  if (!signature || !rawBody) {
    return NextResponse.json({ error: "Missing signature or body" }, { status: 400 });
  }

  let event: EventEntity;
  try {
    event = await verifier.webhooks.unmarshal(rawBody, webhookSecret(), signature);
  } catch (err) {
    console.error("paddle webhook: verification failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }

  try {
    const occurredAt = new Date(event.occurredAt);
    if ((await recordEvent(event.eventId, event.eventType, occurredAt)) === "duplicate") {
      return NextResponse.json({ received: true, result: "duplicate" });
    }

    if (SUBSCRIPTION_EVENTS.has(event.eventType)) {
      const sub = event.data as {
        id: string;
        status: string;
        customerId: string;
        customData: Record<string, unknown> | null;
      };
      const creatorId = typeof sub.customData?.creatorId === "string" ? sub.customData.creatorId : null;
      const result = await applySubscriptionEvent({
        occurredAt,
        subscriptionId: sub.id,
        customerId: sub.customerId,
        status: sub.status,
        creatorId,
        email: null,
      });
      if (result === "unmatched") {
        console.error("paddle webhook: no creator for subscription", sub.id, "creatorId", creatorId);
      }
      return NextResponse.json({ received: true, result });
    }

    if (event.eventType === EventName.CustomerUpdated || event.eventType === EventName.CustomerCreated) {
      const customer = event.data as { id: string; email: string };
      await applyCustomerEvent({ customerId: customer.id, email: customer.email });
      return NextResponse.json({ received: true, result: "applied" });
    }

    return NextResponse.json({ received: true, result: "ignored" });
  } catch (err) {
    console.error("paddle webhook: processing failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
