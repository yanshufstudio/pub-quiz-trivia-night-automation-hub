import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins/magic-link";
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
 * No passwords: Google, or a link mailed to the address. Nothing to leak,
 * nothing to reset, nothing to store.
 */

const MAGIC_LINK_TTL_SECONDS = 15 * 60;

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
 * a preview, use the email link — it works on any host this accepts.
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
      // Both endpoints send mail or mint a session. The defaults (100 per 10s)
      // are a DoS guard, not a sign-in policy.
      "/sign-in/magic-link": { window: 60, max: 5 },
      "/magic-link/verify": { window: 60, max: 10 },
      "/sign-in/social": { window: 60, max: 10 },
    },
  },

  plugins: [
    magicLink({
      expiresIn: MAGIC_LINK_TTL_SECONDS,
      sendMagicLink: async ({ email, url }) => {
        await sendSignInEmail({ email, url });
      },
    }),
  ],
});

export type AuthInstance = typeof auth;
