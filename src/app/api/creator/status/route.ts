import { NextRequest, NextResponse } from "next/server";
import { FREE_LIMIT, getCreatorReadOnly, withRolledPeriod } from "@/lib/creator";

export async function GET(req: NextRequest) {
  const creator = await getCreatorReadOnly(req);
  if (!creator) {
    return NextResponse.json({
      plan: "FREE",
      packsGeneratedInPeriod: 0,
      limit: FREE_LIMIT,
      hasSubscription: false,
      subscriptionStatus: null,
    });
  }

  const rolled = withRolledPeriod(creator);
  return NextResponse.json({
    plan: rolled.plan,
    packsGeneratedInPeriod: rolled.packsGeneratedInPeriod,
    limit: FREE_LIMIT,
    hasSubscription: rolled.paddleSubscriptionId !== null,
    subscriptionStatus: rolled.subscriptionStatus,
  });
}
