import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { signCreatorId } from "@/lib/paddle/checkout-token";

export const TEST_WEBHOOK_SECRET = "pdl_ntfset_test_secret";

/** Paddle signs `"{ts}:{rawBody}"` with HMAC-SHA256 hex and sends
 * `paddle-signature: ts={ts};h1={hex}`. The SDK rejects a stale `ts`. */
export function signedWebhookRequest(payload: object, secret = TEST_WEBHOOK_SECRET, opts: { ts?: number } = {}) {
  const body = JSON.stringify(payload);
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const h1 = createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex");
  return new NextRequest("http://localhost:3000/api/paddle/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "paddle-signature": `ts=${ts};h1=${h1}` },
    body,
  });
}

let counter = 0;

/** Minimal subscription.* payload the SDK's fromJson accepts. Fields not
 * listed are left absent; the notification entity tolerates that. */
export function subscriptionPayload(overrides: {
  eventType?: string;
  eventId?: string;
  occurredAt?: string;
  subscriptionId?: string;
  customerId?: string;
  status?: string;
  /** The checkout's customData, as Paddle echoes it on the subscription.
   * Omitted means none. Use `signedCustomData` for what the app's own
   * checkout produces. */
  customData?: Record<string, unknown> | null;
  /**
   * The price ids the subscription's items name. `[]` (the default) means the
   * event names no price at all, which priceOwnership reads as "cannot tell"
   * rather than "not ours" — see src/lib/paddle/prices.ts. Pass ids to make an
   * event plainly ours or plainly another product's (C2).
   */
  priceIds?: readonly string[];
}) {
  counter += 1;
  const subscriptionId = overrides.subscriptionId ?? `sub_test_${counter}`;
  return {
    event_id: overrides.eventId ?? `evt_test_${Date.now()}_${counter}`,
    event_type: overrides.eventType ?? "subscription.created",
    occurred_at: overrides.occurredAt ?? new Date().toISOString(),
    notification_id: `ntf_test_${counter}`,
    data: {
      id: subscriptionId,
      status: overrides.status ?? "active",
      customer_id: overrides.customerId ?? "ctm_test",
      address_id: "add_test",
      business_id: null,
      currency_code: "USD",
      created_at: "2026-09-09T10:00:00Z",
      updated_at: "2026-09-09T10:00:00Z",
      started_at: null,
      first_billed_at: null,
      next_billed_at: null,
      paused_at: null,
      canceled_at: null,
      discount: null,
      collection_mode: "automatic",
      billing_details: null,
      current_billing_period: null,
      billing_cycle: { interval: "month", frequency: 1 },
      scheduled_change: null,
      items: (overrides.priceIds ?? []).map((priceId, index) => ({
        status: "active",
        quantity: 1,
        recurring: true,
        created_at: "2026-09-09T10:00:00Z",
        updated_at: "2026-09-09T10:00:00Z",
        previously_billed_at: null,
        next_billed_at: null,
        trial_dates: null,
        price: {
          id: priceId,
          product_id: `pro_test_${index}`,
          description: "Test price",
          type: "standard",
          name: null,
          billing_cycle: { interval: "month", frequency: 1 },
          trial_period: null,
          tax_mode: "account_setting",
          unit_price: { amount: "500", currency_code: "USD" },
          unit_price_overrides: [],
          quantity: { minimum: 1, maximum: 1 },
          status: "active",
          custom_data: null,
          import_meta: null,
          created_at: "2026-09-09T10:00:00Z",
          updated_at: "2026-09-09T10:00:00Z",
        },
      })),
      custom_data: overrides.customData ?? null,
      import_meta: null,
    },
  };
}

export function customerPayload(overrides: { customerId: string; email: string; eventId?: string }) {
  counter += 1;
  return {
    event_id: overrides.eventId ?? `evt_test_${Date.now()}_${counter}`,
    event_type: "customer.updated",
    occurred_at: new Date().toISOString(),
    notification_id: `ntf_test_${counter}`,
    data: {
      id: overrides.customerId,
      name: null,
      email: overrides.email,
      marketing_consent: false,
      status: "active",
      custom_data: null,
      locale: "en",
      created_at: "2026-09-09T10:00:00Z",
      updated_at: "2026-09-09T10:00:00Z",
      import_meta: null,
    },
  };
}

/** An event the app deliberately ignores, well-formed so the SDK parses it. */
export function payoutPayload(overrides: { eventId?: string } = {}) {
  counter += 1;
  return {
    event_id: overrides.eventId ?? `evt_test_${Date.now()}_${counter}`,
    event_type: "payout.paid",
    occurred_at: new Date().toISOString(),
    notification_id: `ntf_test_${counter}`,
    data: { id: `payout_test_${counter}`, remittance_reference: "ref", status: "paid", amount: "1.00", currency_code: "USD" },
  };
}

/** customData exactly as /api/billing/checkout builds it for `creatorId`. */
export function signedCustomData(creatorId: string) {
  return { creatorId, creatorSig: signCreatorId(creatorId) };
}
