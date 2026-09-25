import { NextRequest, NextResponse } from "next/server";
import { hostSessionForRequest, unauthorized } from "@/lib/auth-guard";
import { getPaddle } from "@/lib/paddle/client";

export const dynamic = "force-dynamic";

/**
 * A link into Paddle's customer portal for the signed-in host's subscription:
 * invoices, payment method, cancellation. "Manage subscription" on /pricing
 * calls this; /refunds tells a subscriber that is where cancelling happens.
 *
 * The creator comes from the session. PR #4's version read the `pq_creator`
 * cookie, and its error said "No subscription is attached to this browser" —
 * a subscription is attached to an account now.
 *
 * Answers 401 signed out, 409 when the account has never subscribed (nothing
 * to manage), and otherwise `{ url }` — a portal session Paddle mints per
 * request, which the page then navigates to.
 */
export async function POST(req: NextRequest) {
  const host = await hostSessionForRequest(req);
  if (!host) return unauthorized();

  const { paddleCustomerId, paddleSubscriptionId } = host.creator;
  if (!paddleCustomerId) {
    return NextResponse.json({ error: "This account has no subscription to manage." }, { status: 409 });
  }

  const session = await getPaddle().customerPortalSessions.create(
    paddleCustomerId,
    paddleSubscriptionId ? [paddleSubscriptionId] : []
  );
  return NextResponse.json({ url: session.urls.general.overview });
}
