import { test, expect, request } from "@playwright/test";
import { lastSignInLinkFor, randomEmail, requestSignInLink, signInIp, signedInContext } from "./sign-in-helper";
import { PACK_FILE_FORMAT, PACK_FILE_VERSION } from "@/lib/pack-file";

// Sign-in requests are capped at 5 a minute per caller, so the specs that
// drive the form through the default `page` fixture announce a caller of
// their own rather than sharing the suite's.
test.use({ extraHTTPHeaders: { "x-forwarded-for": signInIp() } });

/**
 * Signing in, and the reason it exists: identity that survives a browser.
 *
 * Every spec here drives the real /sign-in form and the real endpoints — the
 * only test-only thing in the path is reading the link back out of the
 * server's in-memory inbox, which cannot answer in production (see
 * src/app/api/test/sign-in-links/route.ts).
 */

test("a host signs in from the form, and the header carries their address", async ({ page, baseURL }) => {
  const email = randomEmail();
  await page.goto("/sign-in");

  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();

  // The check-your-inbox state names the address it went to.
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  const api = await request.newContext({ baseURL });
  const link = await lastSignInLinkFor(api, email);
  await api.dispose();

  await page.goto(link);
  await page.waitForURL(/\/packs/);

  // Signed in: the header shows the account, not "Sign in".
  await expect(page.getByRole("banner").getByText(email)).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toHaveCount(0);
});

test("signing out puts the header back to Sign in, and locks the host pages again", async ({ browser, baseURL }) => {
  const { context, email } = await signedInContext(browser, baseURL!);
  const page = await context.newPage();

  await page.goto("/packs");
  await expect(page.getByRole("banner").getByText(email)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/$/);
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

  await page.goto("/packs");
  await expect(page).toHaveURL(/\/sign-in/);
  await context.close();
});

test("a sign-in link works once; the second attempt says so and mints nothing", async ({ browser, baseURL }) => {
  const api = await request.newContext({ baseURL });
  const email = randomEmail();
  const link = await requestSignInLink(api, email);
  await api.dispose();

  const first = await browser.newContext({ baseURL });
  const firstPage = await first.newPage();
  await firstPage.goto(link);
  await firstPage.waitForURL(/\/packs/);
  await expect(firstPage.getByRole("banner").getByText(email)).toBeVisible();

  // A different browser follows the same link — the shape of a forwarded or
  // intercepted email.
  const second = await browser.newContext({ baseURL });
  const secondPage = await second.newPage();
  await secondPage.goto(link);

  await expect(secondPage.getByRole("alert")).toContainText("already been used");
  await secondPage.goto("/packs");
  await expect(secondPage).toHaveURL(/\/sign-in/);

  await first.close();
  await second.close();
});

test("clearing every cookie loses nothing: the same packs, the same allowance", async ({ browser, baseURL }) => {
  // The requirement this whole change exists for, in a browser.
  //
  // The *counter* half of it is pinned in
  // src/test/generate-cap.integration.test.ts ("does not hand the allowance
  // back when the browser drops every cookie"), which can stub the model and
  // spend the two real packs. This can't — generation costs money — so it
  // proves the same thing the way a host would notice it: the work and the
  // account survive a browser that has been wiped.
  const email = randomEmail("allowance");
  const { context, api } = await signedInContext(browser, baseURL!, email);

  const before = await (await api.get("/api/creator/status")).json();
  expect(before.email).toBe(email);

  // Real host work, filed under the account. Done through the API so a
  // failure here reports its own status rather than timing out on a
  // navigation — the import UI itself is covered by e2e/pack-file.spec.ts.
  const title = `Survives A Wipe ${Math.random().toString(36).slice(2)}`;
  const imported = await api.post("/api/packs/import", {
    data: {
      format: PACK_FILE_FORMAT,
      version: PACK_FILE_VERSION,
      title,
      prompt: "imported by an e2e spec",
      rounds: [
        {
          title: "R",
          category: "C",
          questions: [{ text: "Q?", answer: "a", points: 1, type: "TEXT" }],
        },
      ],
    },
  });
  expect(imported.status(), await imported.text()).toBe(201);

  // Throw the browser away entirely: new context, no cookies, no storage.
  await context.close();

  const fresh = await signedInContext(browser, baseURL!, email);
  const after = await (await fresh.api.get("/api/creator/status")).json();
  expect(after.email).toBe(email);
  // Same allowance record, not a fresh one handed out to a new browser.
  expect(after.packsGeneratedInPeriod).toBe(before.packsGeneratedInPeriod);
  expect(after.plan).toBe(before.plan);

  const freshPage = await fresh.context.newPage();
  await freshPage.goto("/packs");
  await expect(freshPage.getByRole("heading", { level: 2, name: title })).toBeVisible();
  await fresh.context.close();
});

/**
 * The account corner resolves client-side, so for a moment the header does
 * not know which of three very differently-sized things it is about to show.
 * If the slot it occupies while pending differs in width from what lands in
 * it, the nav wraps differently before and after and the whole page jumps.
 *
 * That shipped once: 36px on 380-500px viewports (iPhone 13/14, Pixel 5/7)
 * once a host was signed in, then 28px on 520-639px for everyone when the
 * first fix reserved a line but not a width. Nothing caught either, because
 * the suite measured horizontal overflow and never measured movement.
 *
 * The session request is held open on purpose so "pending" is a state this
 * test actually observes rather than one it races.
 */
for (const width of [320, 390, 430, 560, 1280]) {
  for (const signedIn of [false, true]) {
    test(`the header does not move when the session resolves — ${width}px, signed ${signedIn ? "in" : "out"}`, async ({ browser, baseURL }) => {
      const email = randomEmail("shift");
      const context = signedIn
        ? (await signedInContext(browser, baseURL!, email)).context
        : await browser.newContext({ baseURL });
      const page = await context.newPage();
      await page.setViewportSize({ width, height: 800 });

      // Hold the session lookup so the pending state is observable.
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/api/auth/get-session*", async (route) => {
        await held;
        await route.continue();
      });

      await page.goto("/pricing", { waitUntil: "domcontentloaded" });
      const header = page.locator("header").first();
      const pending = (await header.boundingBox())!.height;

      // Prove it really is the pending state: neither resolved thing is there.
      await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toHaveCount(0);
      await expect(page.getByRole("banner").getByText(email)).toHaveCount(0);

      release();
      if (signedIn) {
        await expect(page.getByRole("banner").getByText(email)).toBeVisible();
      } else {
        await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
      }

      const resolved = (await header.boundingBox())!.height;
      expect(
        Math.round(resolved - pending),
        `header moved ${Math.round(resolved - pending)}px at ${width}px when the session resolved`
      ).toBe(0);

      // And the fix must not have bought stability with sideways scroll.
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      ).toBe(0);

      await context.close();
    });
  }
}
