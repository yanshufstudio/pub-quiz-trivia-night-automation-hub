import { test, expect } from "@playwright/test";

test("pricing page shows both plans and a checkout button each", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { level: 1, name: "Go Pro" })).toBeVisible();
  await expect(page.getByText("$5")).toBeVisible();
  await expect(page.getByText("$25")).toBeVisible();
  await expect(page.getByRole("button", { name: "Subscribe monthly" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Subscribe yearly" })).toBeVisible();
});
