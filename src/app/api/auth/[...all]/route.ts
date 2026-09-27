import { toNextJsHandler } from "better-auth/next-js";
import { assertAuthConfigured, auth } from "@/lib/auth";
import { reserveSignInCode } from "@/lib/sign-in-limits";
import {
  SIGN_IN_CODES_PAUSED_CODE,
  SIGN_IN_CODES_PAUSED_MESSAGE,
  TOO_MANY_CODES_FOR_ADDRESS_CODE,
  TOO_MANY_CODES_FOR_ADDRESS_MESSAGE,
} from "@/lib/sign-in-limit-messages";

/**
 * Every Better Auth endpoint: /api/auth/sign-in/social, /api/auth/callback/
 * google, /api/auth/email-otp/send-verification-otp,
 * /api/auth/sign-in/email-otp, /api/auth/sign-out, /api/auth/get-session.
 *
 * Note what is NOT in that list any more: there is no GET that spends a
 * sign-in secret. That is deliberate — see src/lib/auth.ts.
 *
 * This is the one route under src/app/api that is NOT gated on a session —
 * it is how a session is obtained. src/lib/auth-guard.ts explains the rest.
 *
 * `assertAuthConfigured` is what makes a production deploy without
 * BETTER_AUTH_SECRET fail loudly instead of signing cookies with Better
 * Auth's development default. It is here rather than at module load so the
 * build does not need the secret; see its comment in src/lib/auth.ts.
 */

const handlers = toNextJsHandler(auth);

/** The one path that makes us send mail. */
const SEND_CODE_PATH = "/email-otp/send-verification-otp";

/**
 * How many sign-in codes we will email, enforced here rather than deeper (M2).
 *
 * Resend's free plan allows 100 emails a day and that allowance is **shared
 * with another product on the same account**, so this is an external number
 * rather than politeness: once it is gone, every later sign-in email silently
 * fails to send, for both products.
 *
 * It has to be at this boundary. The obvious home is the `sendVerificationOTP`
 * callback in src/lib/auth.ts, but Better Auth swallows whatever that callback
 * throws: the endpoint answers 200 {"success":true} and no mail goes out, so
 * the person is shown a "check your email" screen for a code that was never
 * coming. Refusing here is the only way to answer 429 with something the form
 * can read back (src/lib/sign-in-errors.ts).
 *
 * A consequence worth stating: `auth.api.sendVerificationOTP` called in-process
 * does not pass through this, so the test fixtures' sign-ins are not counted.
 * That is wanted in both directions — the cap exists to bound what the internet
 * can make us send, and counting the suite's own sign-ins would have every
 * integration file start failing once it had signed in sixty times.
 */
async function refuseFloodedSignInCode(req: Request): Promise<Response | null> {
  if (!new URL(req.url).pathname.endsWith(SEND_CODE_PATH)) return null;

  // Read a copy: the body has to stay unconsumed for the real handler.
  let body: unknown;
  try {
    body = await req.clone().json();
  } catch {
    // Not JSON. Better Auth's own validation should answer that, not this.
    return null;
  }

  const { email, type } = (body ?? {}) as { email?: unknown; type?: unknown };
  // Only the sign-in flow sends anything (see sendVerificationOTP), and an
  // address we cannot read is Better Auth's to reject.
  if (type !== "sign-in" || typeof email !== "string" || email.trim() === "") return null;

  const permission = await reserveSignInCode(email);
  if (permission.allowed) return null;

  // 429 for both, because both are throttles that reset — but with different
  // sentences and a code the form can branch on without matching prose. The
  // body is shaped like Better Auth's own errors so the client surfaces it the
  // same way.
  const global = permission.reason === "global";
  return Response.json(
    {
      code: global ? SIGN_IN_CODES_PAUSED_CODE : TOO_MANY_CODES_FOR_ADDRESS_CODE,
      message: global ? SIGN_IN_CODES_PAUSED_MESSAGE : TOO_MANY_CODES_FOR_ADDRESS_MESSAGE,
    },
    { status: 429 }
  );
}

export async function GET(req: Request) {
  assertAuthConfigured();
  return handlers.GET(req);
}

export async function POST(req: Request) {
  assertAuthConfigured();

  const refusal = await refuseFloodedSignInCode(req);
  if (refusal) return refusal;

  const res = await handlers.POST(req);

  // Better Auth rejected it itself — its own per-IP rule, or a malformed
  // address. No mail was sent, so the day's shared allowance should not be a
  // unit down. (A *send* failure cannot be detected here: Better Auth answers
  // 200 for those too, which is why the reservation is not released on 2xx.)
  if (!res.ok) await releaseIfReserved(req);

  return res;
}

/**
 * Give back the unit taken above, for a request Better Auth then refused.
 *
 * Re-derived rather than threaded through, because `refuseFloodedSignInCode`
 * returns null on the happy path and holding the handle would mean restructuring
 * the handler around a case that is rare and cheap to recompute.
 */
async function releaseIfReserved(req: Request): Promise<void> {
  if (!new URL(req.url).pathname.endsWith(SEND_CODE_PATH)) return;
  try {
    const body = (await req.clone().json()) as { email?: unknown; type?: unknown };
    if (body.type !== "sign-in" || typeof body.email !== "string") return;
    const { releaseSignInCode } = await import("@/lib/sign-in-limits");
    await releaseSignInCode(body.email);
  } catch {
    // Bookkeeping. Never worth failing a response over.
  }
}
