import type { Page } from "@playwright/test";

/**
 * Slow the page's CPU when E2E_CPU_THROTTLE is set (e.g. 20 for twenty times
 * slower), the way a cheap phone or a busy CI runner is slow. Off by default.
 *
 *   E2E_CPU_THROTTLE=20 npx playwright test e2e/editor-resilience.spec.ts
 *
 * is how the race waitForHydration closes was made to fail on demand.
 */
export async function throttleIfAsked(page: Page) {
  const rate = Number(process.env.E2E_CPU_THROTTLE);
  if (!rate || rate <= 1) return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
}

/**
 * Wait until React has hydrated the page, before typing into it.
 *
 * `goto` resolves on the load event, which can come before hydration finishes.
 * Playwright's `fill()` on a textarea selects its contents by script and sends
 * the text in a second step; hydration collapses a selection made by script to
 * position 0, so a fill that straddles hydration lands in front of the old text
 * ("Edited" + "What is the capital…") — editor-resilience's CI failure. A
 * person's own select-all survives hydration; this is the test's race, not the
 * editor's.
 *
 * The signal is Next's route announcer, which the App Router mounts from an
 * effect once the root has hydrated (see pageAlert in sign-in-helper.ts). Under
 * a 20x CPU throttle the editor's textareas were hydrated by the time it
 * appeared in every run checked.
 */
export async function waitForHydration(page: Page) {
  await page.locator("#__next-route-announcer__").waitFor({ state: "attached", timeout: 60_000 });
}
