import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as authRoute } from "@/app/api/auth/[...all]/route";
import { db } from "@/lib/db";
import {
  DAILY_LIMIT_ENV,
  PER_ADDRESS_HOURLY_ENV,
  __resetSignInLimitCounters,
} from "@/lib/sign-in-limits";
import {
  SIGN_IN_CODES_PAUSED_CODE,
  SIGN_IN_CODES_PAUSED_MESSAGE,
  TOO_MANY_CODES_FOR_ADDRESS_CODE,
  TOO_MANY_CODES_FOR_ADDRESS_MESSAGE,
} from "@/lib/sign-in-limit-messages";
import { capturedSignInEmails, clearCapturedSignInEmails } from "@/lib/sign-in-email";

/**
 * The caps, through Better Auth's own endpoint (M2).
 *
 * The unit tests pin the counting. This file pins the thing they cannot: that a
 * refusal actually reaches the caller as a 429 carrying a code the sign-in form
 * can recognise.
 *
 * It drives the route handler rather than `auth.api`, because that is where the
 * caps live and why. Raising them inside Better Auth's sendVerificationOTP
 * callback does not work: Better Auth swallows the throw, answers
 * 200 {"success":true}, and sends nothing — so the person gets a "check your
 * email" screen for a code that was never coming. That was measured, not
 * assumed.
 */

const savedEnv: Record<string, string | undefined> = {};
const KEYS = [PER_ADDRESS_HOURLY_ENV, DAILY_LIMIT_ENV];

// A distinct caller address per request: Better Auth's own per-IP rule
// (5 per 60s on this path) sits in front of these caps and would refuse first.
let ip = 0;
function headers() {
  ip += 1;
  return new Headers({
    "content-type": "application/json",
    "x-forwarded-for": `198.19.0.${(ip % 250) + 1}`,
  });
}

function send(email: string, type = "sign-in") {
  return authRoute(
    new Request("http://localhost:3000/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ email, type }),
    })
  );
}

function address(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2)}@example.test`;
}

beforeEach(() => {
  for (const k of KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  __resetSignInLimitCounters();
  clearCapturedSignInEmails();
});

afterEach(() => {
  for (const k of KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  __resetSignInLimitCounters();
  clearCapturedSignInEmails();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("asking for a sign-in code too often", () => {
  it("answers 429 with a code the form can recognise, after the address's allowance", async () => {
    process.env[PER_ADDRESS_HOURLY_ENV] = "2";
    const email = address("addrcap");

    expect((await send(email)).status).toBe(200);
    expect((await send(email)).status).toBe(200);

    const refused = await send(email);
    expect(refused.status).toBe(429);
    const body = await refused.json();
    expect(body.code).toBe(TOO_MANY_CODES_FOR_ADDRESS_CODE);
    expect(body.message).toBe(TOO_MANY_CODES_FOR_ADDRESS_MESSAGE);

    // Two emails, not three: the refusal did not send one.
    expect(capturedSignInEmails().filter((sent) => sent.email === email)).toHaveLength(2);
  });

  it("answers the paused message once the day's allowance is gone", async () => {
    process.env[DAILY_LIMIT_ENV] = "1";
    expect((await send(address("dayone"))).status).toBe(200);

    const refused = await send(address("daytwo"));
    expect(refused.status).toBe(429);
    const body = await refused.json();
    expect(body.code).toBe(SIGN_IN_CODES_PAUSED_CODE);
    expect(body.message).toBe(SIGN_IN_CODES_PAUSED_MESSAGE);
    // It points at the sign-in that still works.
    expect(body.message).toContain("Google");
  });

  it("does not mint a code it is not going to email", async () => {
    // A refused request that still burned one of the code's five attempts, or
    // left a verification row behind, would be a slow leak in both directions.
    process.env[DAILY_LIMIT_ENV] = "0";
    const email = address("nocode");
    const before = await db.verification.count();

    expect((await send(email)).status).toBe(429);

    expect(capturedSignInEmails().filter((sent) => sent.email === email)).toHaveLength(0);
    expect(await db.verification.count()).toBe(before);
  });

  it("still lets a different address through while one is capped", async () => {
    process.env[PER_ADDRESS_HOURLY_ENV] = "1";
    const capped = address("capped");
    expect((await send(capped)).status).toBe(200);
    expect((await send(capped)).status).toBe(429);
    expect((await send(address("other"))).status).toBe(200);
  });

  it("treats the same mailbox in different case as one address", async () => {
    process.env[PER_ADDRESS_HOURLY_ENV] = "1";
    const lower = address("caseless");
    expect((await send(lower)).status).toBe(200);
    expect((await send(lower.toUpperCase())).status).toBe(429);
  });
});
