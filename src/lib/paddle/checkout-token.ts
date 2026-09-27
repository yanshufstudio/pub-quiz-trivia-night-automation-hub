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
 *
 * **The signature also expires (L11).** It used to be valid for ever, which made
 * a leaked one — from a shared browser, a screenshot of a network panel, a proxy
 * log — a permanent capability to point a subscription at that account. The same
 * reasoning that makes rotation survivable makes an expiry survivable: only the
 * *first* event for a subscription consults customData at all, and that event
 * arrives within seconds of the checkout completing.
 *
 * The window is deliberately generous rather than tight, because the cost of it
 * being too short is much worse than the benefit of it being shorter. Paddle
 * retries a failed delivery for three days, so a first event held up by an outage
 * at either end must still be able to bind its subscription; a week clears that
 * with room. What it buys is that a signature is not a key to an account for the
 * rest of time.
 */

const KEY_LABEL = "triviafoundry:paddle-checkout:v1";

/**
 * How long a signed creator id stays valid. Seven days: longer than Paddle's
 * three-day retry window for a first delivery, and not for ever.
 */
export const CHECKOUT_SIGNATURE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class CheckoutSigningError extends Error {}

function signingKey(secret: string | undefined): Buffer {
  if (!secret) throw new CheckoutSigningError("BETTER_AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(KEY_LABEL).digest();
}

/**
 * `<issuedAtMs>.<mac>`, where the MAC covers both parts — so the timestamp cannot
 * be edited any more than the id can. It stays inside `customData.creatorSig`, so
 * the shape Paddle echoes back is unchanged and nothing else had to learn about
 * it.
 */
export function signCreatorId(
  creatorId: string,
  secret = process.env.BETTER_AUTH_SECRET,
  issuedAtMs: number = Date.now()
): string {
  const issuedAt = String(Math.floor(issuedAtMs));
  return `${issuedAt}.${mac(creatorId, issuedAt, secret)}`;
}

function mac(creatorId: string, issuedAt: string, secret: string | undefined): string {
  return createHmac("sha256", signingKey(secret)).update(`${issuedAt}.${creatorId}`).digest("base64url");
}

/**
 * The creator id from a checkout's customData, or null if it is missing or
 * its signature does not match. Never throws on bad input: customData comes
 * from Paddle, which got it from a browser.
 */
export function verifiedCreatorId(
  customData: Record<string, unknown> | null | undefined,
  secret = process.env.BETTER_AUTH_SECRET,
  now: number = Date.now()
): string | null {
  const creatorId = customData?.creatorId;
  const sig = customData?.creatorSig;
  if (typeof creatorId !== "string" || typeof sig !== "string" || !creatorId || !sig) return null;
  if (!secret) return null;

  // `<issuedAtMs>.<mac>`. A signature without the timestamp is one this build did
  // not make — including every signature made before L11 — and is refused rather
  // than grandfathered, because accepting the un-expiring form for ever would be
  // the same as not having an expiry.
  const dot = sig.indexOf(".");
  if (dot <= 0) return null;
  const issuedAt = sig.slice(0, dot);
  if (!/^\d+$/.test(issuedAt)) return null;

  // The MAC is checked before the clock, so an edited timestamp cannot buy an
  // extension and a forged one cannot be distinguished from an expired one by
  // how long the check takes.
  const expected = Buffer.from(mac(creatorId, issuedAt, secret));
  const actual = Buffer.from(sig.slice(dot + 1));
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;

  const age = now - Number(issuedAt);
  // A signature from the future is as wrong as an expired one: it would mean a
  // clock problem or a crafted value, and either way it is not something to
  // extend trust to.
  if (age < 0 || age > CHECKOUT_SIGNATURE_TTL_MS) return null;

  return creatorId;
}
