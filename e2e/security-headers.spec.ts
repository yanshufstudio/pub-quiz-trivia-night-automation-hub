import { test, expect } from "@playwright/test";

/**
 * The security headers, asserted on real responses (L17).
 *
 * Checked against the served response rather than against next.config.ts,
 * because a header in a config that never reaches the browser is worth nothing —
 * and `headers()` in this Next version applies to paths matched before the
 * filesystem, which is a rule easy to get subtly wrong.
 */

const EXPECTED: Record<string, string> = {
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy":
    'camera=("https://buy.paddle.com" "https://sandbox-buy.paddle.com"), microphone=(), geolocation=()',
  "x-content-type-options": "nosniff",
};

// A static page, a dynamic page, an API route, and the two surfaces that carry
// something worth not leaking.
const PATHS = ["/", "/pricing", "/sign-in", "/play", "/api/creator/status"] as const;

for (const path of PATHS) {
  test(`${path} carries the security headers`, async ({ request }) => {
    const res = await request.get(path, { failOnStatusCode: false });
    const headers = res.headers();
    for (const [key, value] of Object.entries(EXPECTED)) {
      expect(headers[key], `${path} -> ${key}`).toBe(value);
    }
  });
}

test("the headers do not stop Google sign-in or Paddle checkout being offered", async ({
  page,
}) => {
  // Google sign-in is a full-page redirect, not a frame, and Paddle's overlay is
  // Paddle's iframe inside our page — neither is governed by our own
  // X-Frame-Options. What can be checked here is that the pages still render the
  // controls, i.e. nothing was broken by adding the headers.
  await page.goto("/sign-in");
  await expect(page.getByLabel("Email address")).toBeVisible();

  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: /Pro/ }).first()).toBeVisible();
});

test("the camera allowlist names Paddle's checkout origins and nothing else", async ({ request }) => {
  // camera=() would have blocked card scanning inside Paddle's overlay — our
  // header breaking a payment feature, on the page where a failure costs money.
  // What must not happen while fixing that is widening the policy further than
  // the checkout.
  const policy = (await request.get("/pricing")).headers()["permissions-policy"];

  expect(policy).toContain('camera=("https://buy.paddle.com" "https://sandbox-buy.paddle.com")');

  // Exact origins, because a wildcard is a Chrome extension to the grammar
  // rather than part of it, and an item a browser cannot parse can take the
  // directive with it.
  expect(policy).not.toContain("*.paddle.com");
  // Not `self`: our own pages never ask for the camera.
  expect(policy).not.toMatch(/camera=\([^)]*\bself\b/);
  // And the two nobody needs are still closed.
  expect(policy).toContain("microphone=()");
  expect(policy).toContain("geolocation=()");
});
