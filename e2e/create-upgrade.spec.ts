import { test, expect } from "@playwright/test";

test("create page with ?upgraded=1 shows the activation notice and clears it once Pro", async ({ page }) => {
  await page.route("**/api/creator/status", async (route) => {
    await route.fulfill({
      json: { plan: "PRO", packsGeneratedInPeriod: 0, limit: 2, hasSubscription: true, subscriptionStatus: "active" },
    });
  });
  await page.goto("/create?upgraded=1");
  await expect(page.getByText("You are on Pro")).toBeVisible();
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByRole("link", { name: "Manage subscription" })).toBeVisible();
});

test("create page at the cap links to pricing", async ({ page }) => {
  await page.route("**/api/creator/status", async (route) => {
    await route.fulfill({
      json: { plan: "FREE", packsGeneratedInPeriod: 2, limit: 2, hasSubscription: false, subscriptionStatus: null },
    });
  });
  await page.goto("/create");
  await expect(page.getByRole("button", { name: "Free limit reached" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/pricing");
});
