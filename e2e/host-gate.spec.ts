import { test, expect } from "@playwright/test";
import { PACK_FILE_FORMAT, PACK_FILE_VERSION } from "@/lib/pack-file";
import {
  lastSignInEmailFor,
  newAnonApi,
  newAnonContext,
  signInIp,
  signedInContext,
} from "./sign-in-helper";

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
  // The code typed into the tab you started in is what carries the journey.
  // The link in the same email deliberately does not (see the spec below and
  // src/app/sign-in/confirm/ConfirmSignIn.tsx): it is routinely opened on a
  // different device from the one that started, where there is no journey to
  // finish.
  await page.goto("/create");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fcreate/);

  const email = `deep-${Math.random().toString(36).slice(2)}@example.test`;
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

  const api = await newAnonApi(baseURL!);
  const { code } = await lastSignInEmailFor(api, email);
  await api.dispose();

  await page.getByLabel("Sign-in code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/create$/);
});

test("the link in the email lands on /packs, whichever device opens it", async ({ browser, baseURL }) => {
  // Stated as a test because it is a deliberate difference from the code
  // path above, not an oversight: nothing carries the original destination
  // through an inbox, and a redirect target arriving from one would be
  // another externally-supplied URL to have to validate.
  const api = await newAnonApi(baseURL!);
  const email = `deep-link-${Math.random().toString(36).slice(2)}@example.test`;
  const res = await api.post("/api/auth/email-otp/send-verification-otp", {
    data: { email, type: "sign-in" },
  });
  expect(res.ok()).toBeTruthy();
  const { url } = await lastSignInEmailFor(api, email);
  await api.dispose();

  const context = await newAnonContext(browser, baseURL!);
  const page = await context.newPage();
  await page.goto(url);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/packs$/);
  await context.close();
});

test("one host cannot open another host's pack, and cannot tell it from a missing one", async ({ browser, baseURL }) => {
  // The integration sweep (src/test/pack-read-access.integration.test.ts) is
  // the exhaustive one. This is the browser-level pass: a real signed-in
  // host, a real URL, the page a person would actually land on.
  const alice = await signedInContext(browser, baseURL!);
  const imported = await alice.api.post("/api/packs/import", {
    data: {
      format: PACK_FILE_FORMAT,
      version: PACK_FILE_VERSION,
      title: `Alice's Unrun Pack ${Math.random().toString(36).slice(2)}`,
      prompt: "written by alice",
      rounds: [
        {
          title: "R",
          category: "C",
          questions: [{ text: "What is the secret?", answer: "not yours", points: 1, type: "TEXT" }],
        },
      ],
    },
  });
  expect(imported.status(), await imported.text()).toBe(201);
  const { pack } = (await imported.json()) as { pack: { id: string } };

  const bob = await signedInContext(browser, baseURL!);
  const page = await bob.context.newPage();

  for (const path of [`/packs/${pack.id}`, `/packs/${pack.id}/print`]) {
    const res = await page.goto(path);
    expect(res?.status(), `${path} should not be served to another host`).toBe(404);
    // Nothing on the page is Alice's.
    expect(await page.content()).not.toContain("not yours");
  }

  // And the same id tells Bob nothing a made-up one would not: the 404 for
  // Alice's pack and the 404 for a pack that never existed are one answer.
  const madeUp = await page.goto("/packs/cmthisidwasnevermintedatall");
  expect(madeUp?.status()).toBe(404);

  // The answer sheets are refused through the API too, not just the page.
  for (const url of [`/api/packs/${pack.id}`, `/api/packs/${pack.id}/export`, `/api/packs/${pack.id}/pdf?type=answers`]) {
    const res = await bob.api.get(url, { failOnStatusCode: false });
    expect(res.status(), url).toBe(404);
  }

  await alice.context.close();
  await bob.context.close();
});

test("a team plays a whole question with no account and no host cookies", async ({ browser, baseURL }) => {
  // The other half of the gate: nothing above may have leaked into the room.
  const { context: hostContext, api } = await signedInContext(browser, baseURL!);
  const { pack } = await (await api.post("/api/packs/seed")).json();
  const { session, hostToken } = await (
    await api.post("/api/sessions", { data: { packId: pack.id } })
  ).json();

  const teamContext = await newAnonContext(browser, baseURL);
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
