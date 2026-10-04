import { test, expect, type Page } from "@playwright/test";

/**
 * Vercel Web Analytics (SEO2), as the browser sees it.
 *
 * The component ships before Web Analytics is enabled in the Vercel
 * dashboard, and until then the script it asks for does not exist. So the
 * first test reproduces exactly that — the script answers 404 — and requires
 * the page to be unharmed: no exception, no cookie, nothing in local or
 * session storage, no console error beyond the failed load itself.
 *
 * In `next dev` the package loads its debug script from va.vercel-scripts.com;
 * a production build loads /_vercel/insights/script.js from our own origin.
 * Both are intercepted, so this never reaches Vercel and behaves the same in
 * a sandbox with no egress as in CI.
 */

const SCRIPT_PATTERNS = ["https://va.vercel-scripts.com/**", "**/_vercel/insights/**"];

async function routeScript(page: Page, body: string | null) {
  for (const pattern of SCRIPT_PATTERNS) {
    await page.route(pattern, (route) =>
      body === null
        ? route.fulfill({ status: 404, body: "" })
        : route.fulfill({ status: 200, contentType: "text/javascript", body }),
    );
  }
}

for (const path of ["/", "/pricing", "/play?code=ABCDE"]) {
  test(`${path}: analytics before it is enabled is harmless`, async ({ page, context }) => {
    const pageErrors: string[] = [];
    const consoleErrors: { text: string; url: string }[] = [];
    const logs: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push({ text: m.text(), url: m.location().url });
      if (m.type() === "log") logs.push(m.text());
    });
    await routeScript(page, null);

    await page.goto(path);
    const script = page.locator('head script[data-sdkn="@vercel/analytics/next"]');
    await expect(script).toHaveCount(1);
    await expect.poll(() => logs.some((l) => l.startsWith("[Vercel Web Analytics] Failed to load script"))).toBe(true);

    expect(pageErrors).toEqual([]);
    // The browser reports the 404 itself as a resource-load error. That is the
    // only error allowed, and only for the analytics script.
    for (const e of consoleErrors) {
      expect(e.text, `unexpected console error: ${e.text}`).toContain("Failed to load resource");
      expect(e.url).toMatch(/va\.vercel-scripts\.com|\/_vercel\/insights\//);
    }

    expect(await context.cookies()).toEqual([]);
    const storage = await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    }));
    expect(storage).toEqual({ local: [], session: [] });
  });
}

test("the page address reaches Vercel without its query string", async ({ page }) => {
  // Stands in for Vercel's script: takes the beforeSend the package queued on
  // window.vaq and applies it to the event the real script would build from
  // location.href, recording what would have been sent.
  await routeScript(
    page,
    `(() => {
      const q = window.vaq || [];
      const hook = q.find((c) => c[0] === "beforeSend");
      const event = { type: "pageview", url: location.href };
      window.__vaSent = hook ? hook[1](event) : event;
    })();`,
  );

  await page.goto("/play?code=ABCDE#frag");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __vaSent?: unknown }).__vaSent)).toBeTruthy();
  const sent = await page.evaluate(() => (window as unknown as { __vaSent: { url: string } }).__vaSent);
  expect(new URL(sent.url).pathname).toBe("/play");
  expect(sent.url).not.toContain("ABCDE");
  expect(sent.url).not.toContain("?");
  expect(sent.url).not.toContain("#");
});
