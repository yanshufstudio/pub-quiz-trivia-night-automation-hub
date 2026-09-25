import { test, expect } from "@playwright/test";
import {
  ANNUAL_MONTHS_FREE,
  FREE_PACK_ALLOWANCE,
  PRICE_ANNUAL_USD,
  PRICE_MONTHLY_USD,
  formatUsd,
} from "@/lib/pricing";

// Paddle's domain review checks that pricing is visible on the live site and
// that the policy pages are reachable from the navigation. /pricing exists for
// that review, so the things it has to keep doing are worth asserting rather
// than assuming: the page answers 200, states both prices, and can be reached
// by clicking from an ordinary page rather than only by typing the URL.
//
// The figures come from src/lib/pricing.ts rather than being written out here,
// so a price change does not fail this spec for the wrong reason — the same
// mistake e2e/legal-pages.spec.ts made with the "last updated" date.

test("/pricing is served publicly and states both prices", async ({ page, request }) => {
  const res = await request.get("/pricing");
  expect(res.status()).toBe(200);

  await page.goto("/pricing");
  await expect(page.getByRole("heading", { level: 1, name: "Pricing" })).toBeVisible();

  await expect(page.getByRole("heading", { level: 2, name: "Free" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Pro" })).toBeVisible();

  await expect(page.getByText(formatUsd(PRICE_MONTHLY_USD), { exact: false }).first()).toBeVisible();
  await expect(page.getByText(formatUsd(PRICE_ANNUAL_USD), { exact: false }).first()).toBeVisible();
  await expect(page.getByText(String(FREE_PACK_ALLOWANCE), { exact: false }).first()).toBeVisible();

  // The annual saving is derived from the two prices; the page once claimed
  // "two months free" against $5 and $25, which was seven.
  await expect(page.getByText(`${ANNUAL_MONTHS_FREE} months free`, { exact: false })).toBeVisible();

  // The Free card said "No card, no account" until accounts went live on
  // 2026-09-20, after which the second half was false: running a quiz needs
  // an account (a free one). Teams still need none, but this page is about
  // what a host pays for.
  await expect(page.getByRole("main").getByText(/no account/i)).toHaveCount(0);
  await expect(page.getByText("A free account, no card")).toBeVisible();
});

test("a signed-out visitor is asked to sign in, not shown a checkout", async ({ page }) => {
  // A subscription belongs to an account, so there is nothing to buy without
  // one: the Pro card offers "Sign in to subscribe", which comes back here.
  // No Subscribe button, and Paddle.js is not loaded for someone who cannot
  // use it.
  await page.goto("/pricing");
  const signIn = page.getByRole("main").getByRole("link", { name: "Sign in to subscribe" });
  await expect(signIn).toBeVisible();
  await expect(signIn).toHaveAttribute("href", "/sign-in?next=%2Fpricing");
  await expect(page.getByRole("button", { name: /subscribe|upgrade|buy|checkout/i })).toHaveCount(0);
  await expect(page.locator("script[src*='paddle']")).toHaveCount(0);
});

test("pricing is reachable from the footer of an ordinary page", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await expect(footer).toBeVisible();

  await footer.getByRole("link", { name: "Pricing" }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByRole("heading", { level: 1, name: "Pricing" })).toBeVisible();
});

/**
 * The homepage folds its own nav row into the hero instead of rendering
 * <SiteHeader>, and for a day it kept a hand-maintained copy of the link list
 * that had gone stale: Pricing was added to the header and the homepage — the
 * first page Paddle's reviewer sees — silently still showed three links. Both
 * now render the same exported array, and this is the check that says so.
 */
test("the homepage's own top nav carries every header link, Pricing included", async ({ page }) => {
  await page.goto("/");

  // Scoped to the hero's nav, not the footer: the footer already had a
  // Pricing link while the top of the page did not, so a page-wide lookup
  // would have passed straight through the bug. The homepage's row sits in a
  // bare <div> above <main> rather than in a <header>, so this keys off the
  // navigation landmark and takes the first one in document order.
  const topNav = page.getByRole("navigation").first();
  for (const label of ["Create", "Packs", "Join", "Pricing"]) {
    await expect(topNav.getByRole("link", { name: label, exact: true })).toBeVisible();
  }

  await topNav.getByRole("link", { name: "Pricing", exact: true }).click();
  await expect(page).toHaveURL(/\/pricing$/);
});
