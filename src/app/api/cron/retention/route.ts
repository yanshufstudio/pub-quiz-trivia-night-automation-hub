import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { sweepExpiredAuthRows } from "@/lib/retention";

/**
 * The daily retention sweep, called by Vercel Cron (see vercel.json).
 *
 * A GET because that is what Vercel's scheduler sends. A GET that deletes
 * would be the wrong shape anywhere a link could reach it — a mail filter or
 * a crawler would run it — but this one does nothing without the bearer
 * secret (src/lib/cron-auth.ts), which only the scheduler has; and what it
 * deletes has already expired, so even a stray authorised call only does
 * early what tomorrow's run would do anyway.
 *
 * Previews share the production database, so a preview that had the secret
 * could run this against production too. That is harmless for the same
 * reason — but Vercel only schedules crons on production deployments, and
 * there is no need to give CRON_SECRET a Preview value at all.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sweep = await sweepExpiredAuthRows();
  // Counts only — no identifiers, no addresses. This is what Vercel's cron
  // log shows for each run.
  console.info(`retention sweep: ${sweep.verifications} expired codes, ${sweep.sessions} expired sessions`);
  return NextResponse.json(sweep);
}
