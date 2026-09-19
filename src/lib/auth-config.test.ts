import { describe, expect, it } from "vitest";
import { AUTH_SESSION_MODEL, AuthNotConfiguredError, assertAuthConfigured, auth, isGoogleSignInConfigured } from "@/lib/auth";

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
