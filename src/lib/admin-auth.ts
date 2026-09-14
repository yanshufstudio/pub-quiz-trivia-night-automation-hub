import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Operator override for destructive routes (currently just pack deletion).
 * This app has no user/account system, so a single shared secret in
 * ADMIN_TOKEN is the proportionate mechanism.
 *
 * It fails **closed**: with no ADMIN_TOKEN configured there is no operator
 * to override anything, so nobody is an admin and the route's own ownership
 * check decides. An earlier version returned true for every request when the
 * token was unset — convenient for a solo local checkout, but it meant a
 * deploy that forgot to set the variable handed pack deletion to the whole
 * internet, and the only thing standing between that default and a real
 * incident was every future caller remembering to check
 * isAdminTokenConfigured() first. A gate that is safe only when its callers
 * are careful is not a gate.
 */
export function isAuthorizedAdmin(req: NextRequest): boolean {
  const configured = process.env.ADMIN_TOKEN;
  if (!configured) return false;

  const provided = req.headers.get("x-admin-token");
  if (!provided) return false;

  const expected = Buffer.from(configured);
  const actual = Buffer.from(provided);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * Whether an admin override is even possible right now — i.e. whether the
 * operator has configured a token at all. Distinct from isAuthorizedAdmin,
 * which answers "is *this request* the operator". Useful for telling "no
 * operator exists" apart from "this caller isn't them", e.g. in an error
 * message or a health check.
 */
export function isAdminTokenConfigured(): boolean {
  return Boolean(process.env.ADMIN_TOKEN);
}
