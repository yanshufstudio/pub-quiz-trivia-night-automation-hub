import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { capturedSignInEmails, signInEmailCaptureEnabled } from "@/lib/sign-in-email";

/**
 * A signed-in host, for tests that exercise a gated route.
 *
 * It signs in for real — mails a sign-in code (into the in-memory capture),
 * reads the code back, submits it, and keeps the session cookie Better Auth
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

/** The email the last `requestSignInCode` produced. */
export function lastSignInEmail(): { email: string; code: string; url: string } {
  const sent = capturedSignInEmails().at(-1);
  if (!sent) {
    throw new Error(
      signInEmailCaptureEnabled()
        ? "No sign-in email was captured — did the send fail?"
        : `Sign-in email capture is off (NODE_ENV=${process.env.NODE_ENV}, SIGN_IN_EMAIL_CAPTURE=${process.env.SIGN_IN_EMAIL_CAPTURE}, RESEND_API_KEY ${process.env.RESEND_API_KEY ? "set" : "unset"})`
    );
  }
  return sent;
}

/** Ask for a sign-in code for `email`; returns the six digits that were sent. */
export async function requestSignInCode(
  email: string,
  extraHeaders: Record<string, string> = {}
): Promise<string> {
  await auth.api.sendVerificationOTP({
    body: { email, type: "sign-in" },
    headers: new Headers({ "content-type": "application/json", ...extraHeaders }),
  });
  const sent = lastSignInEmail();
  if (sent.email !== email) throw new Error(`Captured a sign-in email for ${sent.email}, not ${email}`);
  return sent.code;
}

/**
 * Submit a sign-in code. Returns the raw response so a test can assert on a
 * *failed* submission (reuse, expiry, wrong digits) as well as a successful
 * one — `asResponse` is what stops Better Auth throwing the failure instead
 * of returning it.
 */
export function submitSignInCode(email: string, code: string, cookie?: string): Promise<Response> {
  return auth.api
    .signInEmailOTP({
      body: { email, otp: code },
      headers: new Headers(cookie ? { cookie } : {}),
      asResponse: true,
    })
    .catch((err: unknown) => {
      // A rejected submission arrives as an APIError carrying the response it
      // would have sent. Tests want to read that; only a genuinely broken
      // call should throw out of here.
      if (err && typeof err === "object" && "response" in err && err.response instanceof Response) {
        return err.response;
      }
      throw err;
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
  const code = await requestSignInCode(email);
  const res = await submitSignInCode(email, code);
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
