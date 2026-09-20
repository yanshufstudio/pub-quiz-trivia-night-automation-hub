import { NextRequest, NextResponse } from "next/server";
import { FREE_LIMIT, withRolledPeriod } from "@/lib/creator";
import { hostSessionForRequest, unauthorized } from "@/lib/auth-guard";

/**
 * The allowance readout /create shows above the wizard.
 *
 * It used to answer a default "FREE, 0 used" to anyone with no cookie, which
 * was honest when a cookie was identity: a visitor with no cookie really did
 * have a full allowance waiting. It is not honest now — there is no
 * allowance without an account — so it asks for one.
 */
export async function GET(req: NextRequest) {
  const host = await hostSessionForRequest(req);
  if (!host) return unauthorized();

  const rolled = withRolledPeriod(host.creator);
  return NextResponse.json({
    plan: rolled.plan,
    packsGeneratedInPeriod: rolled.packsGeneratedInPeriod,
    limit: FREE_LIMIT,
    email: host.user.email,
  });
}
