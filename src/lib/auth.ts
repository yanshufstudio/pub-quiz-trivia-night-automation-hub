import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins/email-otp";
import { db } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rate-limit";
import { sendSignInEmail } from "@/lib/sign-in-email";
import { SITE_URL } from "@/lib/site";

/**
 * Host accounts.
 *
 * Until now a host was a `pq_creator` cookie: clearing cookies lost their
 * packs and handed them a fresh free allowance, and a Pro buyer who cleared
 * cookies lost what they had paid for. Neither is survivable once money is
 * involved, so identity moves to a real account held in our own Turso
 * database. Teams are untouched — they never sign in (see src/lib/auth-guard.ts
 * for exactly which surfaces are gated).
 *
 * No passwords: Google, or a code mailed to the address. Nothing to leak,
 * nothing to reset, nothing to store.
 */

/**
 * How long a sign-in code is good for, and how many wrong guesses it takes.
 *
 * Six digits is a million possibilities, which is only safe because the
 * budget is spent per *code* rather than per caller: five wrong answers and
 * Better Auth leaves the verification row consumed, so the code is dead
 * however many addresses the guessing arrives from. The per-IP rules further
 * down bound the noise; this bounds the attack.
 */
const SIGN_IN_CODE_TTL_SECONDS = 15 * 60;
const SIGN_IN_CODE_ATTEMPTS = 5;
const SIGN_IN_CODE_DIGITS = 6;

/** The page the emailed link opens. It consumes nothing; see its own file. */
export const SIGN_IN_CONFIRM_PATH = "/sign-in/confirm";

/**
 * The link in the sign-in email: our confirm page, carrying the address and
 * the same six digits the email prints.
 *
 * Why the link and the typed code are one secret rather than two. A mail
 * filter that fetches links in incoming mail (Microsoft 365 Safe Links,
 * Defender, Proofpoint) must not be able to spend anything, which is what
 * the confirm page guarantees — nothing there consumes until a person
 * presses the button. Given that, a second independent token would buy
 * nothing and cost plenty: two expiries, two attempt budgets, and a host who
 * clicks the link *and* types the code getting two sessions. One secret has
 * one lifetime and one single use, and that is the whole contract.
 */
export function signInConfirmURL(origin: string | URL, email: string, code: string): string {
  const url = new URL(SIGN_IN_CONFIRM_PATH, origin);
  url.searchParams.set("email", email);
  url.searchParams.set("code", code);
  return url.toString();
}

/**
 * `Session` is already taken in this schema — it is the *game* session a
 * quizmaster runs, the row behind a five-character join code. Better Auth's
 * own sign-in sessions therefore live in `authSession`. This is the single
 * most consequential line in this file: change it and Better Auth starts
 * reading and writing the table the live quiz runs on.
 */
export const AUTH_SESSION_MODEL = "authSession";

/**
 * Where this deployment thinks it is.
 *
 * Production sets BETTER_AUTH_URL and that is the whole answer. Preview
 * deployments get a different hostname on every push, which no environment
 * variable can keep up with, so they resolve the host from the request and
 * are bounded by `allowedHosts` instead.
 *
 * Google sign-in will NOT work on a preview: an OAuth redirect URI has to be
 * registered in Google Cloud ahead of time, and `*.vercel.app` cannot be. On
 * a preview, use the email code — it works on any host this accepts.
 */
function baseURLConfig() {
  const configured = process.env.BETTER_AUTH_URL;
  if (configured) return configured;

  // Off Vercel entirely — `npm run dev`, `next start`, the e2e suite on
  // port 4517. Returning undefined lets Better Auth resolve the origin from
  // the request, which is the only thing that works across all three
  // without hardcoding a port.
  const vercelHost = process.env.VERCEL_URL;
  if (!vercelHost) return undefined;

  return {
    allowedHosts: [new URL(SITE_URL).host, "*.vercel.app"],
    fallback: `https://${vercelHost}`,
    protocol: "https" as const,
  };
}

/**
 * Every origin allowed to carry a sign-in through. The canonical site, plus
 * whatever Vercel called this particular deployment.
 *
 * `VERCEL_URL` is the immutable per-deployment URL; `VERCEL_BRANCH_URL` is
 * the stable per-branch alias, and a preview reached through one must not
 * fail because the other was the one we listed.
 */
function trustedOrigins(): string[] {
  const origins = new Set<string>([SITE_URL]);
  if (process.env.BETTER_AUTH_URL) origins.add(process.env.BETTER_AUTH_URL);
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (host) origins.add(`https://${host}`);
  }
  return [...origins];
}

export class AuthNotConfiguredError extends Error {
  constructor(variable: string) {
    super(`${variable} must be set in production`);
    this.name = "AuthNotConfiguredError";
  }
}

/**
 * A secret is not optional in production. Better Auth falls back to a
 * development default if none is given, and that default signs session
 * cookies — an unsigned-cookie identity is the exact failure this whole
 * change exists to stop, and a *publicly known* signing key would be it
 * again, one layer down.
 *
 * Checked per request rather than at module load, deliberately. Throwing at
 * import time makes `next build` itself depend on the secret: the build
 * evaluates this module while collecting page data, so a missing variable
 * fails the build rather than the request — which forces the secret into the
 * build environment and stops `npm run build` working locally without it.
 * This way the build is secret-free and production still refuses to serve an
 * insecurely-signed session, loudly, on the first request that needs one.
 */
export function assertAuthConfigured(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;
  if (!env.BETTER_AUTH_SECRET) throw new AuthNotConfiguredError("BETTER_AUTH_SECRET");
}

/**
 * Google is configured only when both halves are present. Passing an empty
 * client id would advertise a sign-in button that can only ever fail, so a
 * deploy without Google credentials simply has no Google button — the email
 * link still works. `/sign-in` reads the same predicate (see
 * `isGoogleSignInConfigured`).
 */
export function isGoogleSignInConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function socialProviders() {
  if (!isGoogleSignInConfigured()) return {};
  return {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  };
}

export const auth = betterAuth({
  // `provider: "sqlite"` is what the adapter's own types list, and it is
  // correct for libSQL: Turso speaks SQLite's dialect. The client passed in
  // is the same singleton the rest of the app uses, driver adapter and all.
  database: prismaAdapter(db, { provider: "sqlite" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: baseURLConfig(),
  trustedOrigins: trustedOrigins(),

  // Vercel terminates TLS and rewrites the Host header. Without this, a
  // preview deployment resolves its own base URL to the internal host and
  // every redirect lands somewhere that does not exist.
  advanced: { trustedProxyHeaders: true },

  session: { modelName: AUTH_SESSION_MODEL },

  // Explicit rather than inherited: there are no passwords here. A host
  // signs in with Google or with a link mailed to them, and there is
  // therefore no password to phish, leak, reuse or reset.
  emailAndPassword: { enabled: false },

  socialProviders: socialProviders(),

  /**
   * Better Auth's own limiter, pointed at the store the rest of the app
   * already uses (Upstash when configured, an in-process Map otherwise).
   * Its default is a private in-memory map, which on a serverless host is
   * one limiter per instance — i.e. no limit at all on the endpoints that
   * mail people links.
   *
   * `enabled: true` rather than the default: the default only turns this on
   * in production, and a limiter nothing exercises outside production is a
   * limiter nobody finds out is broken until it matters.
   */
  rateLimit: {
    enabled: true,
    customStorage: {
      consume: async (key, rule) => {
        const { allowed, retryAfterSeconds } = await consumeRateLimit(`better-auth:${key}`, {
          limit: rule.max,
          windowMs: rule.window * 1000,
        });
        return { allowed, retryAfter: allowed ? null : retryAfterSeconds };
      },
    },
    customRules: {
      // Every one of these sends mail or mints a session. Better Auth's own
      // defaults (100 per 10s overall, and the emailOTP plugin's 3 per 60s)
      // are a DoS guard, not a sign-in policy — and `customRules` is resolved
      // last, so these are what actually apply.
      //
      // Submitting a code is capped higher than asking for one because a
      // person fat-fingering six digits is ordinary; what stops a *guesser*
      // is the five-attempt budget carried on the code itself, which no
      // amount of changing address gets around.
      "/email-otp/send-verification-otp": { window: 60, max: 5 },
      "/sign-in/email-otp": { window: 60, max: 10 },
      "/sign-in/social": { window: 60, max: 10 },
    },
  },

  plugins: [
    emailOTP({
      otpLength: SIGN_IN_CODE_DIGITS,
      expiresIn: SIGN_IN_CODE_TTL_SECONDS,
      allowedAttempts: SIGN_IN_CODE_ATTEMPTS,

      // Hashed at rest. The code is a bearer credential with a 15-minute
      // life, and a database read — a leaked Turso token, a backup, a
      // support query run against production — should not hand anyone a live
      // one. The cost is that a code cannot be re-sent, only re-issued,
      // which is `resendStrategy`'s default anyway.
      storeOTP: "hashed",

      sendVerificationOTP: async ({ email, otp, type }, ctx) => {
        // Only the sign-in flow. The plugin also registers email-verification
        // and password-reset endpoints, which are reachable over HTTP even
        // though this app has neither feature; sending for those would let
        // anyone who knows an address have us mail it, and the mail would be
        // a code that does not open anything. Declining to send is the whole
        // handling they need.
        if (type !== "sign-in") return;

        // The origin Better Auth resolved for *this* request, which is the
        // only thing that is right on the production domain, on a preview
        // whose hostname changes every push, and on localhost in the e2e
        // suite. A leading-slash path replaces the base path, so the
        // `/api/auth` in there does not survive into the link.
        const origin = ctx?.context.baseURL ?? SITE_URL;
        await sendSignInEmail({ email, code: otp, url: signInConfirmURL(origin, email, otp) });
      },
    }),
  ],
});

export type AuthInstance = typeof auth;
