import { NextRequest, NextResponse } from "next/server";
import { hostSessionForRequest, unauthorized } from "@/lib/auth-guard";
import { PaddleConfigError, publicPaddleConfig } from "@/lib/paddle/config";
import { CheckoutSigningError, signCreatorId } from "@/lib/paddle/checkout-token";

export const dynamic = "force-dynamic";

/**
 * Everything the /pricing page needs to open Paddle's checkout for the
 * signed-in host: which price, and the customData that tells the webhook
 * whose Pro this is.
 *
 * The creator id comes from the session and nowhere else, and it is signed
 * (src/lib/paddle/checkout-token.ts) because it has to pass through the
 * browser to reach Paddle. PR #4 minted it from a cookie via
 * /api/creator/ensure, which no longer exists.
 *
 * The account's email goes to Paddle's checkout as a prefill, so the host
 * does not retype it and the Paddle customer matches the account. They can
 * still change it there; the subscription is tied to the account by the
 * signed id, not by the address.
 *
 * Answers:
 *   401  not signed in.
 *   400  no valid `interval`.
 *   409  already on Pro — a second subscription would double-bill them;
 *        /pricing shows Manage subscription instead.
 *   503  checkout is not configured on this deployment (the NEXT_PUBLIC_PADDLE_*
 *        values or the signing secret are missing). Production cannot get
 *        here: next.config.ts fails the build without the public values.
 */
export async function POST(req: NextRequest) {
  const host = await hostSessionForRequest(req);
  if (!host) return unauthorized();

  const body = (await req.json().catch(() => null)) as { interval?: unknown } | null;
  const interval = body?.interval;
  if (interval !== "month" && interval !== "year") {
    return NextResponse.json({ error: "interval must be \"month\" or \"year\"" }, { status: 400 });
  }

  if (host.creator.plan === "PRO") {
    return NextResponse.json({ error: "You are already on Pro.", alreadyPro: true }, { status: 409 });
  }

  let config: ReturnType<typeof publicPaddleConfig>;
  let creatorSig: string;
  try {
    config = publicPaddleConfig();
    creatorSig = signCreatorId(host.creator.id);
  } catch (err) {
    if (err instanceof PaddleConfigError || err instanceof CheckoutSigningError) {
      return NextResponse.json(
        { error: "Checkout is not switched on for this deployment.", notConfigured: true },
        { status: 503 }
      );
    }
    throw err;
  }

  return NextResponse.json({
    priceId: interval === "month" ? config.priceMonthly : config.priceAnnual,
    customData: { creatorId: host.creator.id, creatorSig },
    customerEmail: host.user.email,
  });
}
