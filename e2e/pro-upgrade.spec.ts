import { createHmac } from "node:crypto";
import { test, expect } from "@playwright/test";
import { signedInContext } from "./sign-in-helper";
import { PRICE_ANNUAL_USD, formatUsd } from "@/lib/pricing";

/**
 * Buying Pro, end to end, with Paddle's two parts played by the suite.
 *
 * Paddle's checkout runs in Paddle's own frame and cannot be driven from
 * here, so Paddle.js is replaced by a stand-in that records what the page
 * asked it to open. Paddle's webhook is then delivered by the spec itself,
 * signed the way Paddle signs, carrying back the customData the page handed
 * to checkout. Everything between those two — the session, the checkout
 * route, the signature, the webhook, the plan, the pages — is the real code.
 *
 * What this cannot show: that Paddle really echoes customData onto the
 * subscription, or delivers the webhook, or takes the money. That is the
 * sandbox walk on a preview and the real-card walk on production.
 */

// Must match playwright.config.ts.
const WEBHOOK_SECRET = "e2e-paddle-webhook-secret-not-used-anywhere-else";

// Stands in for https://cdn.paddle.com/paddle/v2/paddle.js: the global that
// @paddle/paddle-js looks for, recording what it is given.
const PADDLE_JS_STAND_IN = `
  window.__paddle = {};
  window.PaddleBillingV1 = {
    Initialized: false,
    Environment: { set(env) { window.__paddle.environment = env; } },
    Initialize(options) { window.__paddle.init = options; this.Initialized = true; },
    Update(options) { window.__paddle.init = options; },
    Checkout: { open(options) { window.__paddle.opened = options; } },
  };
`;

type Opened = {
  items: { priceId: string; quantity: number }[];
  customData: { creatorId: string; creatorSig: string };
  customer: { email: string };
  settings: { successUrl: string };
};

/**
 * Compile the webhook route before sending anything signed to it. Paddle's SDK
 * refuses a signature more than 5 seconds old, and the first request to a
 * route under `next dev` can spend longer than that compiling it — so a
 * delivery signed and then held up by the compiler fails verification. That
 * made this spec pass alone and fail in the full suite. An unsigned request is
 * answered 400 before anything is verified, and leaves the route compiled.
 */
async function warmWebhook(api: import("@playwright/test").APIRequestContext) {
  const res = await api.post("/api/paddle/webhook", { data: "" });
  expect(res.status()).toBe(400);
}

function paddleSignature(body: string) {
  const ts = Math.floor(Date.now() / 1000);
  return `ts=${ts};h1=${createHmac("sha256", WEBHOOK_SECRET).update(`${ts}:${body}`).digest("hex")}`;
}

function subscriptionCreated(customData: Opened["customData"], subscriptionId: string) {
  return JSON.stringify({
    event_id: `evt_e2e_${Date.now()}`,
    event_type: "subscription.created",
    occurred_at: new Date().toISOString(),
    notification_id: `ntf_e2e_${Date.now()}`,
    data: {
      id: subscriptionId,
      status: "active",
      customer_id: "ctm_e2e",
      address_id: "add_e2e",
      business_id: null,
      currency_code: "USD",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      started_at: null,
      first_billed_at: null,
      next_billed_at: null,
      paused_at: null,
      canceled_at: null,
      discount: null,
      collection_mode: "automatic",
      billing_details: null,
      current_billing_period: null,
      billing_cycle: { interval: "year", frequency: 1 },
      scheduled_change: null,
      items: [],
      custom_data: customData,
      import_meta: null,
    },
  });
}

test("a host subscribes yearly: checkout opens for their account, and Pro switches on when the webhook lands", async ({
  browser,
  baseURL,
}) => {
  const { context, email } = await signedInContext(browser, baseURL!);
  const page = await context.newPage();
  await page.route("https://cdn.paddle.com/paddle/v2/paddle.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: PADDLE_JS_STAND_IN })
  );

  await page.goto("/pricing");
  await page
    .getByRole("button", { name: `Subscribe yearly · ${formatUsd(PRICE_ANNUAL_USD)}` })
    .click();

  const opened = (await (await page.waitForFunction(() => (window as unknown as { __paddle?: { opened?: unknown } }).__paddle?.opened)).jsonValue()) as Opened;
  const init = (await page.evaluate(() => (window as unknown as { __paddle: { init: unknown; environment: unknown } }).__paddle)) as {
    init: { token: string };
    environment: string;
  };

  expect(init.environment).toBe("sandbox");
  expect(init.init.token).toBe("test_e2e_client_token");
  expect(opened.items).toEqual([{ priceId: "pri_e2e_annual", quantity: 1 }]);
  expect(opened.customer).toEqual({ email });
  expect(opened.settings.successUrl).toBe(`${baseURL}/create?upgraded=1`);
  expect(opened.customData.creatorId).toBeTruthy();
  expect(opened.customData.creatorSig).toBeTruthy();

  // Paddle returns the host before its webhook has arrived.
  await page.goto("/create?upgraded=1");
  await expect(page.getByRole("main").getByRole("status")).toContainText("Payment received");

  // Paddle's webhook, carrying back exactly what the page gave checkout.
  await warmWebhook(context.request);
  const body = subscriptionCreated(opened.customData, `sub_e2e_${Date.now()}`);
  const delivered = await context.request.post("/api/paddle/webhook", {
    headers: { "content-type": "application/json", "paddle-signature": paddleSignature(body) },
    data: body,
  });
  expect(delivered.status()).toBe(200);
  expect(await delivered.json()).toEqual({ received: true, result: "applied" });

  await expect(page.getByRole("main").getByText("You are on Pro")).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/create$/);

  // And /pricing now offers the portal, not a second subscription.
  await page.goto("/pricing");
  await expect(page.getByRole("main").getByRole("button", { name: "Manage subscription" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Subscribe/ })).toHaveCount(0);

  await context.close();
});

test("a checkout whose account was edited in the browser switches nobody's Pro on", async ({ browser, baseURL }) => {
  // The same delivery with the creator id swapped for someone else's: what an
  // attacker could have done to PR #4, whose id came from a cookie.
  const victim = await signedInContext(browser, baseURL!);
  const attacker = await signedInContext(browser, baseURL!);

  const mine = await (await attacker.api.post("/api/billing/checkout", { data: { interval: "month" } })).json();
  const theirs = await (await victim.api.post("/api/billing/checkout", { data: { interval: "month" } })).json();
  const forged = { creatorId: theirs.customData.creatorId, creatorSig: mine.customData.creatorSig };

  await warmWebhook(attacker.api);
  const body = subscriptionCreated(forged, `sub_forged_${Date.now()}`);
  const delivered = await attacker.api.post("/api/paddle/webhook", {
    headers: { "content-type": "application/json", "paddle-signature": paddleSignature(body) },
    data: body,
  });
  expect(delivered.status()).toBe(500);
  expect(await delivered.json()).toMatchObject({ result: "unmatched" });

  const status = await (await victim.api.get("/api/creator/status")).json();
  expect(status).toMatchObject({ plan: "FREE", hasSubscription: false });

  await victim.context.close();
  await attacker.context.close();
});
