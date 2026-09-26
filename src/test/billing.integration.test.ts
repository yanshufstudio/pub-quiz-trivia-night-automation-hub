import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as checkout } from "@/app/api/billing/checkout/route";
import { POST as portal } from "@/app/api/billing/portal/route";
import { GET as status } from "@/app/api/creator/status/route";
import { POST as webhook } from "@/app/api/paddle/webhook/route";
import { db } from "@/lib/db";
import * as paddleClient from "@/lib/paddle/client";
import { signInTestHost } from "./auth-fixture";
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
    expect(body.priceId).toBe("pri_annual_test");
    expect(body.customerEmail).toBe(host.email);
    expect(body.customData.creatorId).toBe(host.id);
    expect(typeof body.customData.creatorSig).toBe("string");

    const monthly = await (await checkout(post("/api/billing/checkout", host.cookieHeader, { interval: "month" }))).json();
    expect(monthly.priceId).toBe("pri_monthly_test");
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
});

describe("GET /api/creator/status, subscription fields", () => {
  it("reports no subscription for a new account", async () => {
    const host = await signInTestHost();
    const body = await (await status(new NextRequest(`${BASE}/api/creator/status`, { headers: host.cookieHeader }))).json();
    expect(body).toMatchObject({ plan: "FREE", hasSubscription: false, subscriptionStatus: null });
  });
});
