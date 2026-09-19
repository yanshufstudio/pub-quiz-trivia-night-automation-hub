import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { capturedSignInLinks, linkCaptureEnabled } from "@/lib/sign-in-email";

/**
 * A signed-in host, for tests that exercise a gated route.
 *
 * It signs in for real — mails a magic link (into the in-memory capture),
 * reads the link back, verifies it, and keeps the session cookie Better Auth
 * set. Nothing is hand-forged, so a test that passes here is evidence the
 * actual sign-in path works rather than evidence that a fixture matches a
 * guard's expectations.
 */

export type TestHost = {
  email: string;
  userId: string;
  /** The Creator that carries this account's packs and free allowance. */
  id: string;
  /** Spread onto a request: `{ ...host.cookieHeader }`. */
  cookieHeader: Record<string, string>;
  /** Just the cookie value, for building a mixed cookie header by hand. */
  cookie: string;
};

/** The link the last `signInMagicLink` produced, as a URL. */
export function lastSignInLink(): URL {
  const link = capturedSignInLinks().at(-1);
  if (!link) {
    throw new Error(
      linkCaptureEnabled()
        ? "No sign-in link was captured — did the send fail?"
        : `Sign-in link capture is off (NODE_ENV=${process.env.NODE_ENV}, SIGN_IN_LINK_CAPTURE=${process.env.SIGN_IN_LINK_CAPTURE}, RESEND_API_KEY ${process.env.RESEND_API_KEY ? "set" : "unset"})`
    );
  }
  return new URL(link.url);
}

/** Ask for a magic link for `email`; returns the token from the captured link. */
export async function requestMagicLink(email: string, extraHeaders: Record<string, string> = {}): Promise<string> {
  await auth.api.signInMagicLink({
    body: { email, callbackURL: "/packs" },
    headers: new Headers({ "content-type": "application/json", ...extraHeaders }),
  });
  const token = lastSignInLink().searchParams.get("token");
  if (!token) throw new Error("Captured sign-in link carried no token");
  return token;
}

/**
 * Redeem a magic-link token. Returns the raw response so a test can assert on
 * a *failed* redemption (reuse, expiry) as well as a successful one.
 */
export function redeemMagicLink(token: string, cookie?: string): Promise<Response> {
  return auth.api.magicLinkVerify({
    query: { token },
    headers: new Headers(cookie ? { cookie } : {}),
    asResponse: true,
  });
}

/** The `cookie:` header value carrying whatever a response set. */
export function cookieFromResponse(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .filter((pair) => !pair.endsWith("="))
    .join("; ");
}

/**
 * Sign in as `email` (a fresh random address by default) and return the
 * cookie plus the ids behind it.
 *
 * `legacyCookie` is a `pq_creator` value to present during sign-in, which is
 * how a test drives the claim path in src/lib/creator-claim.ts.
 */
export async function signInTestHost(
  email: string = `host-${Math.random().toString(36).slice(2)}@example.test`,
  { legacyCookie }: { legacyCookie?: string } = {}
): Promise<TestHost> {
  const token = await requestMagicLink(email);
  const res = await redeemMagicLink(token);
  const cookie = cookieFromResponse(res);
  if (!cookie) {
    throw new Error(`Sign-in produced no session cookie (status ${res.status})`);
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user row for ${email} after sign-in`);

  // Resolving the creator is what runs the claim, so it happens through the
  // same guard the app uses rather than through a test-only shortcut.
  const { hostSession } = await import("@/lib/auth-guard");
  const host = await hostSession(
    new Headers({ cookie: legacyCookie ? `${cookie}; ${legacyCookie}` : cookie })
  );
  if (!host) throw new Error("hostSession rejected a cookie it had just been given");

  return {
    email,
    userId: user.id,
    id: host.creator.id,
    cookie,
    cookieHeader: { cookie },
  };
}
