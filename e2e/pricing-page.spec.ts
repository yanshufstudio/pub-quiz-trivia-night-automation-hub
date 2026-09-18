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
  // "two months free" against $5 and $25, which is seven.
  await expect(page.getByText(`${ANNUAL_MONTHS_FREE} months free`, { exact: false })).toBeVisible();
});

test("/pricing carries no checkout control while Paddle has not approved the domain", async ({ page }) => {
  // A disabled or dead "Subscribe" button is worse than none, and PR #4's
  // build guard exists to stop exactly that reaching production. If someone
  // wires checkout into this page without the live price ids, this fails.
  await page.goto("/pricing");
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
