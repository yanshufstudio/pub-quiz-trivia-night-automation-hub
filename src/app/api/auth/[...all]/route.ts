import { toNextJsHandler } from "better-auth/next-js";
import { assertAuthConfigured, auth } from "@/lib/auth";

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

export async function GET(req: Request) {
  assertAuthConfigured();
  return handlers.GET(req);
}

export async function POST(req: Request) {
  assertAuthConfigured();
  return handlers.POST(req);
}
