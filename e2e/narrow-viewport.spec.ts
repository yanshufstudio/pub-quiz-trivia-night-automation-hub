import { test, expect } from "@playwright/test";
import { randomEmail, signInIp } from "./sign-in-helper";

// The suite had no viewport narrower than a desktop, so a header row that
// could not fit a phone shipped to production unnoticed: the sign plus the
// nav are a single non-wrapping flex row, and below ~410px they pushed the
// page sideways — 85px of horizontal scroll at 320px, and still 15px on a
// standard iPhone at 390px. A green suite said nothing, because nothing in
// it ever looked at a narrow screen.
//
// Horizontal scroll is the check because it is the symptom a person actually
// meets: the page slides under the thumb and the right-hand nav is cut off.

const WIDTHS = [320, 360, 390, 430] as const;

// Every surface that carries the wordmark-and-nav row. The live-night
// surfaces (/play, /host/<code>) deliberately carry no such row and were
// never affected; they are covered by their own specs.
// `/create` redirects a signed-out visitor, so that entry measures /sign-in
// in its first state. The states it cannot reach — the check-your-inbox
// panel with the code field, and the page the emailed link opens — get their
// own test at the bottom of this file.
const PAGES = ["/", "/create", "/how-it-works", "/faq", "/pricing", "/terms", "/privacy", "/refunds"] as const;

async function horizontalOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    return de.scrollWidth - de.clientWidth;
  });
}

for (const width of WIDTHS) {
  for (const path of PAGES) {
    test(`${path} does not scroll sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(path, { waitUntil: "networkidle" });
      expect(await horizontalOverflow(page)).toBe(0);
    });
  }
}

// Without this the whole file could pass on a page that never rendered at
// all — a blank document has no overflow either. Inject something wider than
// the viewport and assert the same measurement does report it, so a false
// green in the tests above cannot go unnoticed.
test("the overflow check itself detects a too-wide element", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/", { waitUntil: "networkidle" });
  expect(await horizontalOverflow(page)).toBe(0);

  await page.evaluate(() => {
    const el = document.createElement("div");
    el.id = "overflow-control";
    el.style.cssText = "width:1200px;height:8px";
    document.body.appendChild(el);
  });

  expect(await horizontalOverflow(page)).toBeGreaterThan(0);
});

/**
 * The two sign-in surfaces the list above cannot reach.
 *
 * The check-your-inbox panel appears only after the form is submitted, and
 * the confirm page only from a link in an email — so neither is a URL this
 * file can simply visit. Both are read on a phone by definition: the whole
 * reason the code exists is the host whose mail is on one device and whose
 * quiz is on another.
 */
test.describe("the sign-in states a plain goto cannot reach", () => {
  test.use({ extraHTTPHeaders: { "x-forwarded-for": signInIp() } });

  for (const width of WIDTHS) {
    test(`the check-your-inbox panel and the confirm page fit at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });

      await page.goto("/sign-in", { waitUntil: "networkidle" });
      await page.getByLabel("Email address").fill(randomEmail("narrow"));
      await page.getByRole("button", { name: "Email me a sign-in code" }).click();
      await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
      // The code field is wide, monospaced and letter-spaced; it is the one
      // control in this flow most likely to push a phone sideways.
      await page.getByLabel("Sign-in code").fill("123456");
      expect(await horizontalOverflow(page), "check-your-inbox").toBe(0);

      await page.goto("/sign-in/confirm?email=someone%40example.test&code=123456", {
        waitUntil: "networkidle",
      });
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
      expect(await horizontalOverflow(page), "confirm page").toBe(0);
    });
  }
});
