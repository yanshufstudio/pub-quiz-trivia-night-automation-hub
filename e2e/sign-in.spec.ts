import { test, expect } from "@playwright/test";
import {
  lastSignInEmailFor,
  newAnonApi,
  newAnonContext,
  pageAlert,
  randomEmail,
  requestSignInEmail,
  signInIp,
  signedInContext,
  submitSignInCode,
} from "./sign-in-helper";
import { PACK_FILE_FORMAT, PACK_FILE_VERSION } from "@/lib/pack-file";

// Sign-in requests are capped at 5 a minute per caller, so the specs that
// drive the form through the default `page` fixture announce a caller of
// their own rather than sharing the suite's.
test.use({ extraHTTPHeaders: { "x-forwarded-for": signInIp() } });

/**
 * Signing in, and the reason it exists: identity that survives a browser.
 *
 * Every spec here drives the real /sign-in form and the real endpoints — the
 * only test-only thing in the path is reading the code back out of the
 * server's in-memory inbox, which cannot answer in production (see
 * src/app/api/test/sign-in-emails/route.ts).
 */

test("a host signs in by typing the code, and the header carries their address", async ({ page, baseURL }) => {
  const email = randomEmail();
  await page.goto("/sign-in");

  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();

  // The check-your-inbox state names the address it went to, and offers the
  // field that covers reading your mail on a different device.
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  const api = await newAnonApi(baseURL!);
  const { code } = await lastSignInEmailFor(api, email);
  await api.dispose();

  await page.getByLabel("Sign-in code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
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

/**
 * The failure this design exists to stop.
 *
 * Microsoft 365 Safe Links, Defender and the rest fetch every link in
 * incoming mail before the person ever clicks it. The old design mailed a
 * link straight to Better Auth's `GET /magic-link/verify`, which spends the
 * token on the first GET — so for anyone behind a corporate filter the link
 * was already used and their first click said so.
 *
 * This drives the scanner's exact behaviour (a plain GET, no JavaScript) and
 * then has the host use the same email, both ways.
 */
test("a mail filter fetching the link signs nobody in and leaves the code whole", async ({ browser, baseURL }) => {
  const email = randomEmail("scanned");
  const scanner = await newAnonApi(baseURL!);
  const { code, url } = await requestSignInEmail(scanner, email);

  // The scan: fetch the URL the way something automated would.
  const scanned = await scanner.get(url);
  expect(scanned.status()).toBe(200);

  // It got the page — and the page is an offer, not a sign-in.
  const html = await scanned.text();
  expect(html).toContain("Sign in as");
  expect(html).toContain(email);

  // Nothing was minted for it. Better Auth's session cookie is the only
  // thing that could have been, and no header carries one.
  const setCookies = scanned.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie");
  expect(setCookies.map((h) => h.value).join(";")).not.toContain("better-auth.session_token");
  expect((await scanner.storageState()).cookies.filter((c) => c.name.includes("better-auth"))).toHaveLength(0);
  await scanner.dispose();

  // And the host, arriving after the scanner, still has a working link.
  const context = await newAnonContext(browser, baseURL!);
  const page = await context.newPage();
  await page.goto(url);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/packs/);
  await expect(page.getByRole("banner").getByText(email)).toBeVisible();
  await context.close();

  // The typed half of the same email is the same secret, so by now it is
  // spent — which is the point of there being only one.
  const late = await newAnonApi(baseURL!);
  const res = await submitSignInCode(late, email, code);
  expect(res.ok()).toBeFalsy();
  await late.dispose();
});

test("the confirm button works once; a second press says so and mints nothing", async ({ browser, baseURL }) => {
  const api = await newAnonApi(baseURL!);
  const email = randomEmail();
  const { url } = await requestSignInEmail(api, email);
  await api.dispose();

  const first = await newAnonContext(browser, baseURL!);
  const firstPage = await first.newPage();
  await firstPage.goto(url);
  await firstPage.getByRole("button", { name: "Sign in" }).click();
  await firstPage.waitForURL(/\/packs/);
  await expect(firstPage.getByRole("banner").getByText(email)).toBeVisible();

  // A different browser opens the same link — the shape of a forwarded or
  // intercepted email.
  const second = await newAnonContext(browser, baseURL!);
  const secondPage = await second.newPage();
  await secondPage.goto(url);
  await secondPage.getByRole("button", { name: "Sign in" }).click();

  await expect(pageAlert(secondPage)).toContainText("no longer works");
  await secondPage.goto("/packs");
  await expect(secondPage).toHaveURL(/\/sign-in/);

  await first.close();
  await second.close();
});

test("the page's own alert is not the only role=alert on the page", async ({ page }) => {
  // Why `pageAlert` exists, stated as a test so the next person does not
  // have to rediscover it. Next hydrates its route announcer — an empty
  // `role="alert"` — into every App Router page, so a bare alert locator is
  // ambiguous and Playwright's strict mode rejects it. It arrives a couple
  // of hundred milliseconds after the HTML, so an assertion written without
  // this passes on a quiet machine and fails on a busy one.
  await page.goto("/sign-in?error=state_mismatch");
  await expect(page.locator("#__next-route-announcer__")).toBeAttached();
  await expect(page.getByRole("alert")).toHaveCount(2);
  await expect(pageAlert(page)).toHaveCount(1);
});

test("a crafted confirm link cannot put someone else's words on the page", async ({ page }) => {
  // Anyone can write a /sign-in/confirm URL, and the page prints the address
  // back. Without a shape check that is a way to render a sentence of your
  // choosing on our domain, under our header, next to a Sign in button.
  const scam = "Your account is suspended. Call 1-800-NOT-US to restore it.";

  for (const query of [
    `?email=${encodeURIComponent(scam)}&code=123456`,
    `?email=host%40example.test&code=${encodeURIComponent(scam)}`,
    "?code=123456",
    "?email=host%40example.test",
    "",
  ]) {
    await page.goto(`/sign-in/confirm${query}`);
    await expect(page.getByRole("main")).not.toContainText(scam);
    await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Back to sign in" })).toBeVisible();
  }
});

test("a wrong code is refused, and the right one still works", async ({ page, baseURL }) => {
  const email = randomEmail("typo");
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

  const api = await newAnonApi(baseURL!);
  const { code } = await lastSignInEmailFor(api, email);
  await api.dispose();

  const wrong = code === "000000" ? "111111" : "000000";
  await page.getByLabel("Sign-in code").fill(wrong);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(pageAlert(page)).toContainText("didn't match");
  // Still on the form, still signed out.
  await expect(page.getByRole("banner").getByText(email)).toHaveCount(0);

  await page.getByLabel("Sign-in code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/packs/);
  await expect(page.getByRole("banner").getByText(email)).toBeVisible();
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
        : await newAnonContext(browser, baseURL!);
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
