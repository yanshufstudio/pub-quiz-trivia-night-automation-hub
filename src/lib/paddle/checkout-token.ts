import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Which account a Paddle checkout pays for, in a form the browser cannot
 * change.
 *
 * Paddle's overlay checkout is opened from the browser, and the `customData`
 * it carries is whatever the browser passed in. Paddle copies it onto the
 * subscription and sends it back with every `subscription.*` event, which is
 * how the webhook knows whose Pro to switch on. PR #4 filled it with a
 * creator id taken from an unsigned cookie — attacker-controlled, so anyone
 * could point a subscription (and later its cancellation) at somebody else's
 * account. Taking the id from the session instead (src/app/api/billing/
 * checkout/route.ts) is necessary but not enough on its own: the id still
 * travels through the browser on its way to Paddle, and a browser can edit it.
 *
 * So the server signs it. The webhook trusts `customData.creatorId` only when
 * `customData.creatorSig` is the signature this module made for exactly that
 * id; an edited id arrives with a signature for a different one and is
 * refused. A signature can only be obtained by a signed-in host, for their
 * own creator.
 *
 * The key is derived from BETTER_AUTH_SECRET rather than being a new
 * variable. It is already set, separately, for Production and Preview — so
 * a sandbox checkout on a preview is signed and verified by the preview, and a
 * live one by production — and a derived subkey (HMAC of a fixed label) keeps
 * these signatures in a different domain from anything Better Auth signs
 * with the same secret.
 *
 * Rotating BETTER_AUTH_SECRET invalidates the signatures on existing
 * subscriptions. That is survivable by design: after the first event binds a
 * subscription, the webhook finds its creator by the stored
 * `paddleSubscriptionId`, not by `customData` (see apply-subscription.ts).
 */

const KEY_LABEL = "triviafoundry:paddle-checkout:v1";

export class CheckoutSigningError extends Error {}

function signingKey(secret: string | undefined): Buffer {
  if (!secret) throw new CheckoutSigningError("BETTER_AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(KEY_LABEL).digest();
}

export function signCreatorId(creatorId: string, secret = process.env.BETTER_AUTH_SECRET): string {
  return createHmac("sha256", signingKey(secret)).update(creatorId).digest("base64url");
}

/**
 * The creator id from a checkout's customData, or null if it is missing or
 * its signature does not match. Never throws on bad input: customData comes
 * from Paddle, which got it from a browser.
 */
export function verifiedCreatorId(
  customData: Record<string, unknown> | null | undefined,
  secret = process.env.BETTER_AUTH_SECRET
): string | null {
  const creatorId = customData?.creatorId;
  const sig = customData?.creatorSig;
  if (typeof creatorId !== "string" || typeof sig !== "string" || !creatorId || !sig) return null;
  if (!secret) return null;

  const expected = Buffer.from(signCreatorId(creatorId, secret));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length) return null;
  return timingSafeEqual(expected, actual) ? creatorId : null;
}
