import { NextRequest, NextResponse } from "next/server";
import { EventName, Paddle, type EventEntity } from "@paddle/paddle-node-sdk";
import { webhookSecret } from "@/lib/paddle/config";
import { applySubscriptionEvent } from "@/lib/paddle/apply-subscription";
import { verifiedCreatorId } from "@/lib/paddle/checkout-token";

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

// Verification only needs the notification secret, not the API key, so a bare
// Paddle instance is enough here and keeps this route independent of
// PADDLE_API_KEY.
const verifier = new Paddle("unused-for-verification");

/**
 * Paddle's notifications, which are the only thing that turns Pro on or off.
 *
 * Paddle delivers at least once and retries anything that is not a 2xx for up
 * to three days. So:
 *
 *   400  no signature or no body — a request that can never verify.
 *   500  bad signature, a database failure, or an event whose creator cannot
 *        be found — all worth a retry.
 *   200  everything else: applied, a duplicate, stale, superseded, or an event
 *        type this app does not use.
 *
 * "Creator not found" retries on purpose. PR #4 answered 200 and logged it,
 * which acknowledged the event and dropped it for good. The usual cause is not
 * an attacker but configuration — a checkout signed by one deployment and
 * delivered to another, or a secret that was not set yet — and a retry means
 * the event applies once that is fixed, and shows up as a failing delivery in
 * Paddle's dashboard until it is, instead of a paid subscription quietly
 * attached to nobody.
 *
 * Customer events (`customer.created`/`updated`) are acknowledged and ignored.
 * PR #4 copied the Paddle customer's email onto the creator for a /restore
 * flow; with accounts the address is the account's, and nothing needs a copy.
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

  if (!SUBSCRIPTION_EVENTS.has(event.eventType)) {
    return NextResponse.json({ received: true, result: "ignored" });
  }

  try {
    const sub = event.data as {
      id: string;
      status: string;
      customerId: string;
      customData: Record<string, unknown> | null;
    };
    const result = await applySubscriptionEvent({
      eventId: event.eventId,
      eventType: event.eventType,
      occurredAt: new Date(event.occurredAt),
      subscriptionId: sub.id,
      customerId: sub.customerId,
      status: sub.status,
      verifiedCreatorId: verifiedCreatorId(sub.customData),
    });

    if (result === "unmatched") {
      // Ids only: no customer details in the log.
      console.error(
        "paddle webhook: no creator for subscription",
        sub.id,
        "event",
        event.eventId,
        typeof sub.customData?.creatorId === "string"
          ? "(customData names a creator, but its signature did not verify or that creator no longer exists)"
          : "(no creator in customData)"
      );
      return NextResponse.json({ received: false, result }, { status: 500 });
    }
    return NextResponse.json({ received: true, result });
  } catch (err) {
    console.error("paddle webhook: processing failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
