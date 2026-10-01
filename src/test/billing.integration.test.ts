import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as checkout } from "@/app/api/billing/checkout/route";
import { POST as portal } from "@/app/api/billing/portal/route";
import { GET as status } from "@/app/api/creator/status/route";
import { POST as webhook } from "@/app/api/paddle/webhook/route";
import { db } from "@/lib/db";
import { CONTACT_EMAIL } from "@/lib/site";
import * as paddleClient from "@/lib/paddle/client";
import { signInTestHost } from "./auth-fixture";
import { trialMailboxKey } from "@/lib/trial";
import { TEST_WEBHOOK_SECRET, signedWebhookRequest, subscriptionPayload } from "./paddle-fixtures";

/**
 * The account-side half of buying Pro: what /pricing asks the server for
 * before it opens Paddle's checkout, the billing portal, and the status
 * /pricing and /create read back — driven with real signed-in hosts.
 */

const BASE = "http://localhost:3000";

function post(path: string, headers: Record<string, string> = {}, body?: unknown) {
  return new NextRequest(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function configurePaddle() {
  vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "sandbox");
  vi.stubEnv("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN", "test_client_token");
  vi.stubEnv("NEXT_PUBLIC_PADDLE_PRICE_MONTHLY", "pri_monthly_test");
  vi.stubEnv("NEXT_PUBLIC_PADDLE_PRICE_ANNUAL", "pri_annual_test");
  vi.stubEnv("PADDLE_PRICE_MONTHLY_TRIAL", "pri_monthly_trial_test");
  vi.stubEnv("PADDLE_PRICE_ANNUAL_TRIAL", "pri_annual_trial_test");
  vi.stubEnv("PADDLE_NOTIFICATION_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET);
}

beforeEach(configurePaddle);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await db.$disconnect();
});

describe("POST /api/billing/checkout", () => {
  it("401s without a session", async () => {
    const res = await checkout(post("/api/billing/checkout", {}, { interval: "month" }));
    expect(res.status).toBe(401);
  });

  it("gives the signed-in host their own creator id, signed, and their email for the prefill", async () => {
    const host = await signInTestHost();
    const res = await checkout(post("/api/billing/checkout", host.cookieHeader, { interval: "year" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // A brand-new account is offered the trial (PRC9).
    expect(body.priceId).toBe("pri_annual_trial_test");
    expect(body.trial).toBe(true);
    expect(body.customerEmail).toBe(host.email);
    expect(body.customData.creatorId).toBe(host.id);
    expect(typeof body.customData.creatorSig).toBe("string");

    const monthly = await (await checkout(post("/api/billing/checkout", host.cookieHeader, { interval: "month" }))).json();
    expect(monthly.priceId).toBe("pri_monthly_trial_test");
  });

  it("ignores any creator id the browser sends and uses the session's", async () => {
    const host = await signInTestHost();
    const other = await signInTestHost();
    const res = await checkout(
      post("/api/billing/checkout", host.cookieHeader, { interval: "month", creatorId: other.id, customData: { creatorId: other.id } })
    );
    expect((await res.json()).customData.creatorId).toBe(host.id);
  });

  it("400s an unknown interval", async () => {
    const host = await signInTestHost();
    for (const body of [{}, { interval: "week" }, { interval: 12 }]) {
      const res = await checkout(post("/api/billing/checkout", host.cookieHeader, body));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("409s a host who is already on Pro rather than selling them a second subscription", async () => {
    const host = await signInTestHost();
    await db.creator.update({ where: { id: host.id }, data: { plan: "PRO" } });
    const res = await checkout(post("/api/billing/checkout", host.cookieHeader, { interval: "month" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ alreadyPro: true });
  });

  // PRC4: an owner-comped account is Pro without a subscription, so there is
  // nothing to sell it — and no trial to start.
  it("409s an owner-comped account, and reports it as Pro with no subscription", async () => {
    const host = await signInTestHost(`comp-${Date.now()}@example.test`);
    vi.stubEnv("PRO_COMP_EMAILS", `someone-else@example.test, ${host.email.toUpperCase()}`);

    const res = await checkout(post("/api/billing/checkout", host.cookieHeader, { interval: "month" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ alreadyPro: true });

    const s = await status(new NextRequest(`${BASE}/api/creator/status`, { headers: host.cookieHeader }));
    expect(await s.json()).toMatchObject({ plan: "PRO", hasSubscription: false });

    // Nothing was written: the row itself is still FREE.
    expect(await db.creator.findUnique({ where: { id: host.id } })).toMatchObject({ plan: "FREE" });
  });

  it("503s, saying so, on a deployment without the Paddle values", async () => {
    const host = await signInTestHost();
    vi.stubEnv("NEXT_PUBLIC_PADDLE_PRICE_ANNUAL", "");
    const res = await checkout(post("/api/billing/checkout", host.cookieHeader, { interval: "year" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ notConfigured: true });
  });

  it("produces customData the webhook accepts — the whole loop, minus Paddle", async () => {
    // What the checkout route hands the browser is what Paddle echoes back on
    // the subscription. If the two halves disagreed about the signature, every
    // real purchase would be "unmatched".
    const host = await signInTestHost();
    const { customData } = await (await checkout(post("/api/billing/checkout", host.cookieHeader, { interval: "month" }))).json();

    const res = await webhook(signedWebhookRequest(subscriptionPayload({ customData, subscriptionId: `sub_loop_${host.id}` })));
    expect(await res.json()).toEqual({ received: true, result: "applied" });

    const after = await (await status(new NextRequest(`${BASE}/api/creator/status`, { headers: host.cookieHeader }))).json();
    expect(after).toMatchObject({ plan: "PRO", hasSubscription: true, subscriptionStatus: "active" });
  });
});

/**
 * PRC9: the trial price goes only to an account that has never had a
 * subscription and whose mailbox has never trialled. Everyone else is sold the
 * same price without the trial.
 */
describe("POST /api/billing/checkout — who gets the trial (PRC9)", () => {
  const ask = async (host: { cookieHeader: Record<string, string> }, interval = "month") =>
    checkout(post("/api/billing/checkout", host.cookieHeader, { interval }));

  it("sells a returning subscriber the price without the trial", async () => {
    const host = await signInTestHost();
    await db.creator.update({
      where: { id: host.id },
      data: { paddleSubscriptionId: `sub_old_${host.id}`, subscriptionStatus: "canceled" },
    });
    expect(await (await ask(host, "year")).json()).toMatchObject({ priceId: "pri_annual_test", trial: false });
  });

  it("sells an account whose own trial is on record the price without the trial", async () => {
    const host = await signInTestHost();
    await db.trialClaim.create({
      data: { mailboxKey: trialMailboxKey(`other-${host.email}`), creatorId: host.id, subscriptionId: "sub_x" },
    });
    expect(await (await ask(host)).json()).toMatchObject({ priceId: "pri_monthly_test", trial: false });
  });

  it("sells a second account on a trialled mailbox the price without the trial", async () => {
    const local = `twice${Math.random().toString(36).slice(2)}`;
    await db.trialClaim.create({
      data: { mailboxKey: trialMailboxKey(`${local}@gmail.com`), creatorId: `gone-${local}`, subscriptionId: "sub_y" },
    });
    // The same inbox: a dot, a +tag and googlemail.com.
    const host = await signInTestHost(`${local.slice(0, 3)}.${local.slice(3)}+again@googlemail.com`);
    expect(await (await ask(host)).json()).toMatchObject({ priceId: "pri_monthly_test", trial: false });
  });

  it("503s an eligible account when the trial prices are not configured, rather than quietly dropping the trial", async () => {
    const host = await signInTestHost();
    vi.stubEnv("PADDLE_PRICE_MONTHLY_TRIAL", "");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await ask(host);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ notConfigured: true });
    expect(errors).toHaveBeenCalled();
  });

  it("still sells an ineligible account the no-trial price without the trial prices configured", async () => {
    const host = await signInTestHost();
    await db.creator.update({ where: { id: host.id }, data: { paddleSubscriptionId: `sub_prev_${host.id}` } });
    vi.stubEnv("PADDLE_PRICE_MONTHLY_TRIAL", "");
    vi.stubEnv("PADDLE_PRICE_ANNUAL_TRIAL", "");
    expect(await (await ask(host)).json()).toMatchObject({ priceId: "pri_monthly_test", trial: false });
  });
});

describe("POST /api/billing/portal", () => {
  it("401s without a session", async () => {
    const res = await portal(post("/api/billing/portal"));
    expect(res.status).toBe(401);
  });

  it("409s an account that has never subscribed", async () => {
    const host = await signInTestHost();
    const res = await portal(post("/api/billing/portal", host.cookieHeader));
    expect(res.status).toBe(409);
  });

  it("opens a portal session for the session's own Paddle customer and subscription", async () => {
    const host = await signInTestHost();
    await db.creator.update({
      where: { id: host.id },
      data: { paddleCustomerId: `ctm_${host.id}`, paddleSubscriptionId: `sub_portal_${host.id}` },
    });
    const create = vi.fn().mockResolvedValue({ urls: { general: { overview: "https://customer-portal.paddle.com/test" } } });
    vi.spyOn(paddleClient, "getPaddle").mockReturnValue({ customerPortalSessions: { create } } as never);

    const res = await portal(post("/api/billing/portal", host.cookieHeader));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://customer-portal.paddle.com/test" });
    expect(create).toHaveBeenCalledWith(`ctm_${host.id}`, [`sub_portal_${host.id}`]);
  });

  it("answers 502 with something a customer can act on when Paddle's API fails (L14)", async () => {
    // This is the one button a paying customer presses when something is already
    // wrong with their billing. Unhandled, the SDK's throw came out as a 500 and
    // the page showed nothing useful.
    const host = await signInTestHost();
    await db.creator.update({
      where: { id: host.id },
      data: { paddleCustomerId: `ctm_fail_${host.id}` },
    });
    const create = vi.fn().mockRejectedValue(new Error("paddle is down"));
    vi.spyOn(paddleClient, "getPaddle").mockReturnValue({ customerPortalSessions: { create } } as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await portal(post("/api/billing/portal", host.cookieHeader));

    expect(res.status).toBe(502);
    const body = await res.json();
    // Two routes that do not depend on us, named.
    expect(body.error).toContain("paddle.net");
    expect(body.error).toContain(CONTACT_EMAIL);
    expect(body.error).toMatch(/try again in a moment/i);
    // The cause is logged, not shown.
    expect(error.mock.calls.flat().join(" ")).toContain("paddle portal");
    expect(JSON.stringify(body)).not.toContain("paddle is down");
  });
});

describe("GET /api/creator/status, subscription fields", () => {
  it("reports no subscription for a new account", async () => {
    const host = await signInTestHost();
    const body = await (await status(new NextRequest(`${BASE}/api/creator/status`, { headers: host.cookieHeader }))).json();
    expect(body).toMatchObject({ plan: "FREE", hasSubscription: false, subscriptionStatus: null });
  });
});
