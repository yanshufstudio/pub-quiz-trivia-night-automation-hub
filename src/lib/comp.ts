import { normaliseMailbox } from "@/lib/email-normalise";

/**
 * Owner comp (PRC4): accounts that get Pro without a Paddle subscription —
 * the owner's own, for running real quiz nights on production.
 *
 * - Server-only: never NEXT_PUBLIC_, so it is not in the browser bundle, and
 *   nothing a browser sends can add to it.
 * - Comma-separated; each entry and the account's address are compared by
 *   mailbox (normaliseMailbox), the same rule as the free allowance and the
 *   trial, so "Owner+tag@Example.com" matches "owner@example.com".
 * - No database write and no subscription: it applies where the variable is
 *   set and stops the moment it is removed. Unset or blank comps nobody.
 * - Comped accounts are Pro in every other respect, so the daily ceiling and
 *   the Pro limits still bound them.
 *
 * Read per call, like the other limits, so a change in the Vercel dashboard
 * applies on the next request after a redeploy.
 */
export const PRO_COMP_EMAILS_ENV = "PRO_COMP_EMAILS";

export function isCompEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const listed = (process.env[PRO_COMP_EMAILS_ENV] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(normaliseMailbox);
  if (listed.length === 0) return false;
  return listed.includes(normaliseMailbox(email));
}
