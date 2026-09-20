import { afterAll, describe, expect, it } from "vitest";
import { SIGN_IN_CONFIRM_PATH, auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hostSession } from "@/lib/auth-guard";
import { capturedSignInEmails, signInEmailCaptureEnabled } from "@/lib/sign-in-email";
import {
  cookieFromResponse,
  lastSignInEmail,
  requestSignInCode,
  signInTestHost,
  submitSignInCode,
} from "./auth-fixture";

/**
 * The sign-in code itself: one use, then nothing.
 *
 * A sign-in secret travels through email, so the properties that matter are
 * that spending it twice does not mint two sessions, that an old one is
 * worthless, that guessing it is bounded — and, the reason this replaced a
 * magic link, that *fetching* the emailed URL spends nothing at all.
 */

const email = () => `code-${Math.random().toString(36).slice(2)}@example.test`;
const BASE = "http://localhost:3000";

/** The verification row behind a live code, by the identifier the plugin uses. */
function storedCodeFor(address: string) {
  return db.verification.findFirst({
    where: { identifier: `sign-in-otp-${address}` },
    orderBy: { createdAt: "desc" },
  });
}

describe("sign-in by emailed code", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("captures the email only because this is not production", () => {
    // The suite depends on this; src/lib/sign-in-email.test.ts is what proves
    // a production-shaped environment cannot reach it.
    expect(signInEmailCaptureEnabled()).toBe(true);
    expect(process.env.NODE_ENV).not.toBe("production");
  });

  it("mails one email carrying a six-digit code and a link to the confirm page", async () => {
    const address = email();
    const code = await requestSignInCode(address);
    const sent = lastSignInEmail();

    expect(code).toMatch(/^\d{6}$/);
    expect(sent.email).toBe(address);

    // The link is a page of ours. It carries the same code — one secret, not
    // two — and it is not under /api/auth, so there is nothing for Better
    // Auth to honour if something merely fetches it.
    const url = new URL(sent.url);
    expect(url.pathname).toBe(SIGN_IN_CONFIRM_PATH);
    expect(url.pathname.startsWith("/api/")).toBe(false);
    expect(url.searchParams.get("email")).toBe(address);
    expect(url.searchParams.get("code")).toBe(code);
  });

  it("has no GET anywhere that spends a code", async () => {
    // The failure this whole design exists to stop: a corporate mail filter
    // fetches every link in incoming mail before the person clicks, so any
    // GET that consumes is a GET a scanner will consume first. The old
    // magic link had exactly one (`GET /magic-link/verify`) and this asserts
    // there is no longer any such thing — the emailed URL is a page, and the
    // endpoint that spends the code refuses a GET.
    const address = email();
    const code = await requestSignInCode(address);
    const emailed = new URL(lastSignInEmail().url);

    for (const attempt of [
      `${BASE}/api/auth/sign-in/email-otp?email=${encodeURIComponent(address)}&otp=${code}`,
      `${BASE}/api/auth/magic-link/verify?token=${code}`,
      // The emailed URL itself, offered to the auth handler: it is not an
      // auth route, so there is nothing there to answer it.
      `${BASE}/api/auth${emailed.pathname}${emailed.search}`,
    ]) {
      const res = await auth.handler(new Request(attempt, { method: "GET" }));
      expect(res.status, `${attempt} answered ${res.status}`).not.toBe(200);
      expect(cookieFromResponse(res), `${attempt} set a session cookie`).toBe("");
    }

    // And after all of that the code is untouched and still works.
    expect(await storedCodeFor(address)).not.toBeNull();
    const res = await submitSignInCode(address, code);
    expect(cookieFromResponse(res)).toContain("better-auth.session_token=");
  });

  it("mints a session the first time, and names the account the code was for", async () => {
    const address = email();
    const code = await requestSignInCode(address);

    const res = await submitSignInCode(address, code);
    const cookie = cookieFromResponse(res);
    expect(cookie).toContain("better-auth.session_token=");

    const host = await hostSession(new Headers({ cookie }));
    expect(host?.user.email).toBe(address);
    // Holding a code sent to an address is itself the proof of it.
    const user = await db.user.findUniqueOrThrow({ where: { email: address } });
    expect(user.emailVerified).toBe(true);
  });

  it("fails on reuse, and mints no second session", async () => {
    const address = email();
    const code = await requestSignInCode(address);
    expect(cookieFromResponse(await submitSignInCode(address, code))).toContain("better-auth.session_token=");

    const again = await submitSignInCode(address, code);
    expect(cookieFromResponse(again)).toBe("");
    expect(again.status).toBe(400);
    // The row is gone, which is what makes "once" a database fact rather
    // than a check that could be raced.
    expect(await storedCodeFor(address)).toBeNull();
  });

  it("fails once it has expired, even though it was never used", async () => {
    const address = email();
    const code = await requestSignInCode(address);

    // Age the stored verification past its 15-minute life rather than
    // waiting: the row's expiry is what the plugin actually checks.
    const stored = await storedCodeFor(address);
    expect(stored, "the sign-in code should have a verification row").toBeTruthy();
    await db.verification.update({
      where: { id: stored!.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const res = await submitSignInCode(address, code);
    expect(cookieFromResponse(res)).toBe("");
    // And nobody was created off the back of it.
    expect(await db.user.findUnique({ where: { email: address } })).toBeNull();
  });

  it("dies after five wrong guesses, and the right code no longer works either", async () => {
    const address = email();
    const code = await requestSignInCode(address);
    const wrong = code === "000000" ? "111111" : "000000";

    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await submitSignInCode(address, wrong);
      expect(cookieFromResponse(res), `guess ${attempt} signed someone in`).toBe("");
    }

    // Six digits is a million possibilities; five guesses is the reason that
    // is enough. The budget is spent per code, not per caller, so a guesser
    // gains nothing by arriving from somewhere else.
    const res = await submitSignInCode(address, code);
    expect(cookieFromResponse(res)).toBe("");
    expect(await db.user.findUnique({ where: { email: address } })).toBeNull();
  });

  it("asking for a fresh code retires the old one", async () => {
    const address = email();
    const first = await requestSignInCode(address);
    const second = await requestSignInCode(address);
    expect(second).not.toBe(first);

    expect(cookieFromResponse(await submitSignInCode(address, first))).toBe("");
    expect(cookieFromResponse(await submitSignInCode(address, second))).toContain(
      "better-auth.session_token="
    );
  });

  it("reuses the same account and the same creator when the person signs in again", async () => {
    const address = email();
    const first = await signInTestHost(address);
    const second = await signInTestHost(address);

    expect(second.userId).toBe(first.userId);
    expect(second.id).toBe(first.id);
    expect(second.cookie).not.toBe(first.cookie);
    expect(await db.user.count({ where: { email: address } })).toBe(1);
  });

  it("invalidates the session server-side on sign-out", async () => {
    const host = await signInTestHost();
    expect(await hostSession(new Headers({ cookie: host.cookie }))).not.toBeNull();

    await auth.api.signOut({ headers: new Headers({ cookie: host.cookie }) });

    // The browser may still hold the cookie; it is worth nothing.
    expect(await hostSession(new Headers({ cookie: host.cookie }))).toBeNull();
  });

  it("sends a code for an address that has never signed in, without saying so", async () => {
    // Sign-up and sign-in are the same action here, and the response must not
    // let the form be used to test whether an address has an account.
    const address = email();
    expect(await db.user.findUnique({ where: { email: address } })).toBeNull();
    await requestSignInCode(address);
    expect(capturedSignInEmails().at(-1)?.email).toBe(address);
  });

  it("answers a known and an unknown address identically", async () => {
    const known = (await signInTestHost()).email;
    const unknown = email();

    const responses = await Promise.all(
      [known, unknown].map((address) =>
        auth.handler(
          new Request(`${BASE}/api/auth/email-otp/send-verification-otp`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.60" },
            body: JSON.stringify({ email: address, type: "sign-in" }),
          })
        )
      )
    );

    const bodies = await Promise.all(responses.map((res) => res.text()));
    expect(responses.map((res) => res.status)).toEqual([200, 200]);
    expect(bodies[0]).toBe(bodies[1]);
  });
});

describe("Better Auth's rate limiting, on the store the rest of the app uses", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  function send(ip: string) {
    return auth.handler(
      new Request(`${BASE}/api/auth/email-otp/send-verification-otp`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ email: email(), type: "sign-in" }),
      })
    );
  }

  it("caps sign-in code requests from one caller at 5 a minute", async () => {
    // Through the real HTTP handler, which is where the limiter runs — the
    // custom storage in src/lib/auth.ts is what carries the count, so on a
    // deploy with Upstash configured this is one limiter, not one per
    // serverless instance.
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await send("198.51.100.41")).status);

    expect(statuses.filter((s) => s === 200)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(3);
  });

  it("counts a different caller separately", async () => {
    expect((await send("198.51.100.42")).status).toBe(200);
  });

  it("caps code submissions from one caller at 10 a minute", async () => {
    // The per-code budget above is what stops a code being guessed; this is
    // what stops one caller spraying guesses across many addresses.
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await auth.handler(
        new Request(`${BASE}/api/auth/sign-in/email-otp`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.43" },
          body: JSON.stringify({ email: email(), otp: "000000" }),
        })
      );
      statuses.push(res.status);
    }

    expect(statuses.filter((s) => s === 429)).toHaveLength(2);
  });
});
