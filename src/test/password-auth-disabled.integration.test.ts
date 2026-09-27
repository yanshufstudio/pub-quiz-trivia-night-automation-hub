import { afterAll, describe, expect, it } from "vitest";
import { GET as authGet, POST as authPost } from "@/app/api/auth/[...all]/route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * The password flow refuses in one voice (AUTH).
 *
 * There are no passwords here — `emailAndPassword: { enabled: false }` in
 * src/lib/auth.ts — and that part was measured rather than assumed: sign-up
 * refuses, `change-password` cannot find a credential account to change, and no
 * credential row can be created through any of these paths.
 *
 * What was not uniform was the refusal. Better Auth checks the flag on some of
 * these paths and not others, so probing them answered whatever the request
 * happened to fail on first — INVALID_TOKEN on /reset-password,
 * CREDENTIAL_ACCOUNT_NOT_FOUND on /change-password, a VALIDATION_ERROR about
 * callbackURL on GET /reset-password/<token>. Each answers a question nobody
 * asked and implies a flow that is not there.
 */

const BASE = "http://localhost:3000/api/auth";

function post(path: string, body: unknown = {}) {
  return authPost(
    new Request(`${BASE}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify(body),
    })
  );
}

const DISABLED = { code: "EMAIL_PASSWORD_DISABLED", message: "Email and password is not enabled" };

afterAll(async () => {
  await db.$disconnect();
});

describe("the password-reset flow, with passwords disabled", () => {
  it("is the precondition these refusals depend on", () => {
    // The guard reads the config rather than hard-coding the answer, so if this
    // ever becomes true the guard steps aside — and this line is the reminder to
    // revisit the rest of this file rather than to delete it.
    expect(auth.options.emailAndPassword?.enabled).toBe(false);
  });

  it("refuses /reset-password as disabled, not as a bad token", async () => {
    const res = await post("reset-password", { newPassword: "hunter2hunter2", token: "made-up" });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual(DISABLED);
  });

  it("refuses /change-password as disabled, not as a missing credential", async () => {
    const res = await post("change-password", {
      newPassword: "hunter2hunter2",
      currentPassword: "whatever",
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual(DISABLED);
  });

  it("refuses the GET link Better Auth serves for a reset token", async () => {
    // This one used to answer a validation error about a missing callbackURL,
    // which is the shape of a flow that works.
    const res = await authGet(new Request(`${BASE}/reset-password/made-up-token`));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual(DISABLED);
  });

  it("says the same thing Better Auth says where Better Auth does check", async () => {
    // sign-in/email is not intercepted — Better Auth refuses it itself. The codes
    // match so the flow speaks with one vocabulary rather than two.
    const res = await post("sign-in/email", { email: "probe@example.test", password: "hunter2hunter2" });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: DISABLED.code });
  });

  it("leaves /request-password-reset to Better Auth, which already refuses clearly", async () => {
    // Deliberately not intercepted: it is the one path in this flow that checks
    // the flag itself, and its own code says exactly what is wrong. Pinning it
    // here is what stops the guard's patterns being loosened until they swallow
    // it — a mutation widening the first pattern to /password/ passed every other
    // test in this file.
    const res = await post("request-password-reset", { email: "probe@example.test" });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: "RESET_PASSWORD_DISABLED" });
  });

  it("leaves the paths that are actually used alone", async () => {
    // The guard matches on path, so the thing to prove is what it does *not*
    // match: the sign-in flow this product really uses must be untouched.
    const res = await post("email-otp/send-verification-otp", {
      email: `guard-probe-${Math.random().toString(36).slice(2)}@example.test`,
      type: "sign-in",
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true });
  });

  it("leaves no way to create a password credential", async () => {
    // The refusals above are about wording. This is the property they sit on top
    // of, and it is the one that would matter if it broke.
    const withPasswords = await db.account.count({ where: { password: { not: null } } });
    expect(withPasswords).toBe(0);
  });
});
