import { describe, expect, it } from "vitest";
import {
  AUTH_SESSION_MODEL,
  AuthNotConfiguredError,
  SIGN_IN_CONFIRM_PATH,
  assertAuthConfigured,
  auth,
  isGoogleSignInConfigured,
  signInConfirmURL,
} from "@/lib/auth";

/**
 * The production guard on BETTER_AUTH_SECRET.
 *
 * Better Auth falls back to a development default when no secret is given,
 * and that default signs session cookies. A published signing key is the
 * unsigned-cookie problem again, so production must refuse rather than serve
 * on one — but the *build* must not need the secret, which is why this is a
 * function called per request instead of a throw at module load.
 */
describe("assertAuthConfigured", () => {
  it("throws in production when the secret is missing or empty", () => {
    for (const secret of [undefined, ""]) {
      expect(() =>
        assertAuthConfigured({ NODE_ENV: "production", BETTER_AUTH_SECRET: secret } as NodeJS.ProcessEnv)
      ).toThrow(AuthNotConfiguredError);
    }
  });

  it("names the variable, so the log says what to set", () => {
    expect(() => assertAuthConfigured({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toThrow(
      /BETTER_AUTH_SECRET/
    );
  });

  it("passes in production once the secret is set", () => {
    expect(() =>
      assertAuthConfigured({ NODE_ENV: "production", BETTER_AUTH_SECRET: "a-real-secret" } as NodeJS.ProcessEnv)
    ).not.toThrow();
  });

  it("does not block local development or the test suite", () => {
    for (const env of ["development", "test", undefined]) {
      expect(() => assertAuthConfigured({ NODE_ENV: env } as NodeJS.ProcessEnv)).not.toThrow();
    }
  });
});

describe("the session model name", () => {
  /**
   * `Session` in this schema is the *game* session a quizmaster runs — the
   * row behind a five-character join code, with its teams and answers. If
   * Better Auth's sessions were ever pointed at it, sign-in would start
   * writing to the table the live quiz runs on, and the failure would show
   * up as a corrupted quiz night rather than as a broken login.
   */
  it("keeps Better Auth's sessions out of the game-session table", () => {
    expect(AUTH_SESSION_MODEL).toBe("authSession");
    expect(auth.options.session?.modelName).toBe(AUTH_SESSION_MODEL);
    expect(auth.options.session?.modelName).not.toBe("session");
  });
});

describe("isGoogleSignInConfigured", () => {
  /** `ProcessEnv` requires NODE_ENV (next typegen adds that), so build the
   * cases on top of a minimal one rather than casting a bare literal. */
  const env = (extra: Record<string, string>): NodeJS.ProcessEnv =>
    ({ NODE_ENV: "test", ...extra }) as NodeJS.ProcessEnv;

  it("needs both halves — half a Google client is a button that can only fail", () => {
    expect(isGoogleSignInConfigured(env({ GOOGLE_CLIENT_ID: "id" }))).toBe(false);
    expect(isGoogleSignInConfigured(env({ GOOGLE_CLIENT_SECRET: "secret" }))).toBe(false);
    expect(isGoogleSignInConfigured(env({}))).toBe(false);
    expect(isGoogleSignInConfigured(env({ GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" }))).toBe(false);
  });

  it("is on with both", () => {
    expect(isGoogleSignInConfigured(env({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" }))).toBe(true);
  });
});

describe("the emailed sign-in link", () => {
  /**
   * The property the whole flow rests on: the URL that goes in an email is a
   * page of ours, and nothing under /api/auth. A corporate mail filter
   * fetches links in incoming mail before the person clicks, so anything
   * that consumes on GET is consumed by the filter first — which is exactly
   * how the magic link this replaced kept telling hosts their link had
   * "already been used".
   */
  it("points at a page of ours, never at an auth endpoint", () => {
    const url = new URL(signInConfirmURL("https://triviafoundry.com", "host@example.test", "123456"));
    expect(url.pathname).toBe(SIGN_IN_CONFIRM_PATH);
    expect(url.pathname.startsWith("/api/")).toBe(false);
    expect(url.searchParams.get("email")).toBe("host@example.test");
    expect(url.searchParams.get("code")).toBe("123456");
  });

  it("takes only the origin from the base URL Better Auth resolved", () => {
    // `ctx.context.baseURL` carries the /api/auth base path. A leading-slash
    // path replaces it, and this is the test that keeps it that way.
    const url = new URL(signInConfirmURL("http://localhost:4517/api/auth", "a@b.test", "000111"));
    expect(url.origin).toBe("http://localhost:4517");
    expect(url.pathname).toBe(SIGN_IN_CONFIRM_PATH);
  });

  it("escapes an address that would otherwise change the query", () => {
    const url = new URL(signInConfirmURL("https://x.test", "a+b&code=999999@example.test", "123456"));
    expect(url.searchParams.get("email")).toBe("a+b&code=999999@example.test");
    expect(url.searchParams.get("code")).toBe("123456");
  });
});

describe("the sign-in code's limits", () => {
  // The code's own six digits, 15-minute life and five-guess budget are
  // behaviour, not configuration to read back, and they are pinned where
  // they can actually be exercised —
  // src/test/sign-in-code.integration.test.ts. What is worth asserting here
  // is which plugin is wired at all.
  it("signs people in with a code, and no longer with a link that GET consumes", () => {
    const ids = (auth.options.plugins ?? []).map((plugin) => plugin.id);
    expect(ids).toContain("email-otp");
    expect(ids).not.toContain("magic-link");
  });

  it("caps both new endpoints on our own limiter, not Better Auth's defaults", () => {
    // customRules is resolved last (after the plugin's own 3-per-60s), so
    // these are the numbers that actually apply.
    const rules = auth.options.rateLimit?.customRules ?? {};
    expect(rules["/email-otp/send-verification-otp"]).toEqual({ window: 60, max: 5 });
    expect(rules["/sign-in/email-otp"]).toEqual({ window: 60, max: 10 });
    // And nothing is left pointing at the flow this replaced.
    expect(Object.keys(rules).some((path) => path.includes("magic-link"))).toBe(false);
  });
});
