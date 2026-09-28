import { toNextJsHandler } from "better-auth/next-js";
import { assertAuthConfigured, auth } from "@/lib/auth";
import { isEmailTooLong, reserveSignInCode } from "@/lib/sign-in-limits";
import {
  EMAIL_TOO_LONG_CODE,
  EMAIL_TOO_LONG_MESSAGE,
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
 * The password-reset flow, refused in one voice (AUTH).
 *
 * `emailAndPassword: { enabled: false }` in src/lib/auth.ts means no account here
 * can have a password, and none can: sign-up refuses with
 * EMAIL_PASSWORD_SIGN_UP_DISABLED and `change-password` cannot find a credential
 * account to change. That part is sound and was measured — no credential row can
 * be created through any of these.
 *
 * What is not uniform is the *refusal*. Better Auth checks the feature flag on
 * some of these paths and not others, so probing them returns whatever the
 * request happened to fail on first:
 *
 *   POST /reset-password            400 INVALID_TOKEN
 *   POST /change-password           400 CREDENTIAL_ACCOUNT_NOT_FOUND (signed in)
 *   GET  /reset-password/<token>    400 VALIDATION_ERROR about callbackURL
 *   POST /request-password-reset    400 RESET_PASSWORD_DISABLED  ← the honest one
 *
 * None of those is exploitable and none is a lie, but three of the four answer a
 * question nobody asked and imply a password flow exists behind them. They are
 * answered here with the code Better Auth uses when it does check —
 * EMAIL_PASSWORD_DISABLED, the same one `sign-in/email` returns — so the whole
 * flow says one thing.
 *
 * Conditional on the config rather than hard-coded: if passwords are ever turned
 * on, this steps aside instead of becoming the lie it was written to prevent.
 * `request-password-reset` is left alone because it already refuses clearly, and
 * the paths Better Auth does not serve at all are left as 404s.
 */
const PASSWORD_FLOW_PATHS = [/\/reset-password(\/|$)/, /\/change-password$/];

const EMAIL_PASSWORD_DISABLED = {
  code: "EMAIL_PASSWORD_DISABLED",
  message: "Email and password is not enabled",
};

function refuseIfPasswordAuthDisabled(req: Request): Response | null {
  if (auth.options.emailAndPassword?.enabled) return null;
  const { pathname } = new URL(req.url);
  if (!PASSWORD_FLOW_PATHS.some((path) => path.test(pathname))) return null;
  return Response.json(EMAIL_PASSWORD_DISABLED, { status: 400 });
}

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

/**
 * The address a send-code request is asking for, or null if this request is not
 * one we cap.
 *
 * Takes the body as text rather than reading the request itself, because a
 * Request's body can only be consumed once and Better Auth needs the same bytes
 * afterwards. See POST.
 */
function signInAddressFrom(rawBody: string): string | null {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    // Not JSON. Better Auth's own validation should answer that, not this.
    return null;
  }
  const { email, type } = (body ?? {}) as { email?: unknown; type?: unknown };
  // Only the sign-in flow sends anything (see sendVerificationOTP), and an
  // address we cannot read is Better Auth's to reject.
  if (type !== "sign-in" || typeof email !== "string" || email.trim() === "") return null;
  return email;
}

/** 429 for both, because both are throttles that reset — but with different
 * sentences and a code the form can branch on without matching prose. The body
 * is shaped like Better Auth's own errors so the client surfaces it the same
 * way. */
function floodRefusal(reason: "address" | "global"): Response {
  const global = reason === "global";
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
  const disabled = refuseIfPasswordAuthDisabled(req);
  if (disabled) return disabled;
  return handlers.GET(req);
}

export async function POST(req: Request) {
  assertAuthConfigured();

  const disabled = refuseIfPasswordAuthDisabled(req);
  if (disabled) return disabled;

  if (!new URL(req.url).pathname.endsWith(SEND_CODE_PATH)) return handlers.POST(req);

  // Read the body here, once, and hand Better Auth a request carrying the same
  // bytes.
  //
  // The first version of this cloned the request twice — once to read the
  // address on the way in, once to release the reserved unit on the way out —
  // and the second clone could never work: Better Auth consumes the original
  // body, and `clone()` on a consumed Request throws. The throw landed in a
  // catch that called it bookkeeping, so the give-back below silently never
  // happened, and a request Better Auth itself rejected (a malformed address,
  // its own per-IP rule) still spent a unit of the address's hourly allowance
  // and of the day's shared one. Measured, not reasoned about: an "Invalid
  // email" 400 left the next request for that address refused with 429.
  const rawBody = await req.text().catch(() => null);
  if (rawBody === null) return handlers.POST(req);
  const forwarded = () =>
    new Request(req.url, { method: "POST", headers: req.headers, body: rawBody });

  const address = signInAddressFrom(rawBody);
  if (address === null) return handlers.POST(forwarded());

  /**
   * Too long to be a mailbox, refused before anything is created or sent.
   *
   * Ahead of the caps on purpose. An address like this should not spend a unit of
   * anybody's allowance on its way to being rejected — and it must not reach
   * Better Auth, which accepts an address of any length: measured with a
   * 20,000-character local part, it validated, wrote a verification row, and had
   * a code sent to it. In production that hands the address to Resend.
   *
   * 400, not 429, because this does not reset and retrying cannot help. The body
   * is shaped like the caps' refusals so the form reads it back the same way
   * (src/lib/sign-in-errors.ts).
   */
  if (isEmailTooLong(address)) {
    return Response.json({ code: EMAIL_TOO_LONG_CODE, message: EMAIL_TOO_LONG_MESSAGE }, { status: 400 });
  }

  const permission = await reserveSignInCode(address);
  if (!permission.allowed) return floodRefusal(permission.reason);

  const res = await handlers.POST(forwarded());

  // Better Auth rejected it itself — its own per-IP rule, or a malformed
  // address. No mail was sent, so neither allowance should be a unit down. (A
  // *send* failure cannot be detected here: Better Auth answers 200 for those
  // too, which is why the reservation is not released on 2xx.)
  //
  // `permission.release` rather than a release addressed by the address: it
  // gives back exactly the units this reservation took, is idempotent, and is a
  // no-op when the counter was unreachable and nothing was counted at all.
  if (!res.ok) {
    try {
      await permission.release();
    } catch (error) {
      console.error("sign-in code cap: could not give back a reserved unit", error);
    }
  }

  return res;
}
