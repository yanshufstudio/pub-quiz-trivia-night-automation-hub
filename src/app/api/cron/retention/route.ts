import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { sweepExpiredAuthRows } from "@/lib/retention";
import { countOf } from "@/lib/plural";

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
  //
  // Through `countOf`, so a sweep that removed one thing does not report "1
  // expired codes". All three counts, not just the newest: this line said
  // "1 expired codes" from the day it was written, and fixing only the third
  // would have produced "1 expired codes, 1 expired session", which reads worse
  // than either. It is a log line rather than a page, so nobody was ever misled
  // by it — but it is the same `s` the plural fix went round the product
  // removing, and countOf is right here.
  console.info(
    `retention sweep: ${countOf(sweep.verifications, "expired code")}, ` +
      `${countOf(sweep.sessions, "expired session")}, ` +
      `${countOf(sweep.mailboxAllowances, "orphaned mailbox allowance")}`
  );
  return NextResponse.json(sweep);
}
