import { afterAll, describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hostSession } from "@/lib/auth-guard";
import { capturedSignInLinks, linkCaptureEnabled } from "@/lib/sign-in-email";
import { cookieFromResponse, redeemMagicLink, requestMagicLink, signInTestHost } from "./auth-fixture";

/**
 * The magic link itself: one use, then nothing.
 *
 * A sign-in link is a bearer credential that travels through email, so the
 * two properties that matter are that redeeming it twice does not mint two
 * sessions, and that an old one is worthless.
 */

const email = () => `magic-${Math.random().toString(36).slice(2)}@example.test`;

describe("magic-link sign-in", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("captures the link only because this is not production", () => {
    // The suite depends on this; src/lib/sign-in-email.test.ts is what proves
    // a production-shaped environment cannot reach it.
    expect(linkCaptureEnabled()).toBe(true);
    expect(process.env.NODE_ENV).not.toBe("production");
  });

  it("mints a session the first time, and names the account the link was for", async () => {
    const address = email();
    const token = await requestMagicLink(address);

    const res = await redeemMagicLink(token);
    const cookie = cookieFromResponse(res);
    expect(cookie).toContain("better-auth.session_token=");

    const host = await hostSession(new Headers({ cookie }));
    expect(host?.user.email).toBe(address);
    // Following a link sent to an address is itself the proof of it.
    const user = await db.user.findUniqueOrThrow({ where: { email: address } });
    expect(user.emailVerified).toBe(true);
  });

  it("fails on reuse, and mints no second session", async () => {
    const token = await requestMagicLink(email());
    expect(cookieFromResponse(await redeemMagicLink(token))).toContain("better-auth.session_token=");

    const again = await redeemMagicLink(token);
    expect(cookieFromResponse(again)).toBe("");
    // Better Auth redirects a failed redemption with a code in the query,
    // which /sign-in turns into "already used, or expired" (see its
    // ERROR_MESSAGES).
    expect(again.headers.get("location") ?? "").toContain("error=INVALID_TOKEN");
  });

  it("fails once it has expired, even though it was never used", async () => {
    const address = email();
    const token = await requestMagicLink(address);

    // Age the stored verification past its 15-minute life rather than
    // waiting: the row's expiry is what the plugin actually checks.
    const stored = await db.verification.findFirst({
      where: { identifier: { contains: token } },
      orderBy: { createdAt: "desc" },
    });
    expect(stored, "the magic link should have a verification row").toBeTruthy();
    await db.verification.update({
      where: { id: stored!.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const res = await redeemMagicLink(token);
    expect(cookieFromResponse(res)).toBe("");
    expect(res.headers.get("location") ?? "").toMatch(/error=/);
    // And nobody was created off the back of it.
    expect(await db.user.findUnique({ where: { email: address } })).toBeNull();
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

  it("sends a link for an address that has never signed in, without saying so", async () => {
    // Sign-up and sign-in are the same action here, and the response must not
    // let the form be used to test whether an address has an account.
    const address = email();
    expect(await db.user.findUnique({ where: { email: address } })).toBeNull();
    await requestMagicLink(address);
    expect(capturedSignInLinks().at(-1)?.email).toBe(address);
  });
});

describe("Better Auth's rate limiting, on the store the rest of the app uses", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("caps sign-in link requests from one address at 5 a minute", async () => {
    // Through the real HTTP handler, which is where the limiter runs — the
    // custom storage in src/lib/auth.ts is what carries the count, so on a
    // deploy with Upstash configured this is one limiter, not one per
    // serverless instance.
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await auth.handler(
        new Request("http://localhost:3000/api/auth/sign-in/magic-link", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.41" },
          body: JSON.stringify({ email: email(), callbackURL: "/packs" }),
        })
      );
      statuses.push(res.status);
    }

    expect(statuses.filter((s) => s === 200)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(3);
  });

  it("counts a different caller separately", async () => {
    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.42" },
        body: JSON.stringify({ email: email(), callbackURL: "/packs" }),
      })
    );
    expect(res.status).toBe(200);
  });
});
