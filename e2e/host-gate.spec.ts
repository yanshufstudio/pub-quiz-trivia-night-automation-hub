import { test, expect, request } from "@playwright/test";
import { lastSignInLinkFor, signInIp, signedInContext } from "./sign-in-helper";

// See e2e/sign-in.spec.ts: the deep-link spec below signs in through the
// default `page` fixture, so it announces a caller of its own.
test.use({ extraHTTPHeaders: { "x-forwarded-for": signInIp() } });

/**
 * Which doors are locked, checked in a browser rather than against a route
 * handler. The integration sweep
 * (src/test/host-api-auth.integration.test.ts) is the exhaustive one; this
 * is the pass that would catch a page whose guard never ran because the
 * page was prerendered, or a public page accidentally swept up by the proxy.
 */

const HOST_PAGES = ["/create", "/packs", "/packs/some-pack-id", "/packs/some-pack-id/print", "/host/ABCDE"];
const PUBLIC_PAGES = ["/", "/pricing", "/terms", "/privacy", "/refunds", "/sign-in", "/play"];

for (const path of HOST_PAGES) {
  test(`${path} sends a signed-out visitor to /sign-in, and remembers where they were going`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in/);
    expect(new URL(page.url()).searchParams.get("next")).toBe(path);
  });
}

for (const path of PUBLIC_PAGES) {
  test(`${path} is served to a signed-out visitor`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(path);
  });
}

test("signing in from a deep link finishes the journey rather than dumping you on /packs", async ({ page, baseURL }) => {
  await page.goto("/create");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fcreate/);

  const email = `deep-${Math.random().toString(36).slice(2)}@example.test`;
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

  const api = await request.newContext({ baseURL });
  const link = await lastSignInLinkFor(api, email);
  await api.dispose();

  await page.goto(link);
  await expect(page).toHaveURL(/\/create$/);
});

test("a team plays a whole question with no account and no host cookies", async ({ browser, baseURL }) => {
  // The other half of the gate: nothing above may have leaked into the room.
  const { context: hostContext, api } = await signedInContext(browser, baseURL!);
  const { pack } = await (await api.post("/api/packs/seed")).json();
  const { session, hostToken } = await (
    await api.post("/api/sessions", { data: { packId: pack.id } })
  ).json();

  const teamContext = await browser.newContext({ baseURL });
  const teamPage = await teamContext.newPage();
  await teamPage.goto(`/play?code=${session.code}`);
  await teamPage.getByLabel("Team name").fill("No Accounts Here");
  await teamPage.getByRole("button", { name: "Join session" }).click();
  await expect(teamPage.getByText("Sit tight.")).toBeVisible();

  // Not one cookie of ours in the team's browser.
  const teamCookies = await teamContext.cookies();
  expect(teamCookies.filter((c) => c.name.includes("better-auth"))).toHaveLength(0);
  expect(teamCookies.filter((c) => c.name === "pq_creator")).toHaveLength(0);

  await api.post(`/api/sessions/${session.code}/advance`, { data: { action: "start", hostToken } });
  await expect(teamPage.getByText("What is the capital of Australia?")).toBeVisible({ timeout: 10_000 });
  await teamPage.getByLabel("Your answer").fill("Canberra");
  await teamPage.getByRole("button", { name: "Submit answer" }).click();
  // The host desk sees that they answered — from a browser that has never
  // held a session cookie of ours.
  await expect(teamPage.getByRole("button", { name: "Submit answer" })).toHaveCount(0);

  await hostContext.close();
  await teamContext.close();
});
