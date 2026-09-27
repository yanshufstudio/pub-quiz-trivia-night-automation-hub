import { NextRequest, NextResponse } from "next/server";
import { hostSessionForRequest, unauthorized } from "@/lib/auth-guard";
import { getPaddle } from "@/lib/paddle/client";
import { CONTACT_EMAIL } from "@/lib/site";

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

  // Paddle's API can be down, rate-limit us, or refuse a customer id it no
  // longer recognises, and the SDK throws for all of it. Unhandled, that came
  // out as a 500 and the page showed nothing useful — on the one button a
  // paying customer presses when something is already wrong with their billing
  // (L14). The cause goes to the log; the customer gets a sentence and the
  // address that can actually help them.
  try {
    const session = await getPaddle().customerPortalSessions.create(
      paddleCustomerId,
      paddleSubscriptionId ? [paddleSubscriptionId] : []
    );
    return NextResponse.json({ url: session.urls.general.overview });
  } catch (err) {
    console.error("paddle portal: could not create a customer portal session", err);
    return NextResponse.json(
      {
        error:
          "We couldn't open the billing portal just now. Please try again in a moment — " +
          `or manage your subscription directly at paddle.net, or email ${CONTACT_EMAIL}.`,
      },
      { status: 502 }
    );
  }
}
