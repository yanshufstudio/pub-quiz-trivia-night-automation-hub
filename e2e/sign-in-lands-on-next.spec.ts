import { test, expect } from "@playwright/test";
import { accountCorner, lastSignInEmailFor, newAnonApi, randomEmail, signInIp } from "./sign-in-helper";

test.use({ extraHTTPHeaders: { "x-forwarded-for": signInIp() } });

/**
 * Typing the code lands on the page the host was sent to sign in for.
 *
 * Seen on previews on 2 and 3 Oct 2026: the code was accepted and the session
 * minted, but the tab stayed on /sign-in?next=… with the button stuck on
 * "Signing in…". The header's Create and Packs links are prefetched while the
 * visitor is still signed out, and the proxy answers those prefetches with a
 * redirect back to /sign-in. A client-side push to the same path then replays
 * that cached redirect. Waiting for the network to settle before typing the
 * code gives those prefetches time to land, the way a real host reading their
 * mail does.
 */
for (const next of ["/create", "/packs"]) {
  test(`a typed code lands on ${next}, not back on /sign-in`, async ({ page, baseURL }) => {
    const email = randomEmail("next");
    await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Email me a sign-in code" }).click();
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

    const api = await newAnonApi(baseURL!);
    const { code } = await lastSignInEmailFor(api, email);
    await api.dispose();

    await page.waitForLoadState("networkidle");
    await page.getByLabel("Sign-in code").fill(code);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL((url) => url.pathname === next, { timeout: 15_000 });
    await expect(accountCorner(page, email)).toBeVisible();

    // And the client router is still usable: on the previews, after the hang
    // even the header's own links did nothing until a typed-in URL reloaded
    // the page.
    const other = next === "/create" ? { href: "/packs", name: "Packs" } : { href: "/create", name: "Create" };
    await page.getByRole("banner").getByRole("link", { name: other.name, exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === other.href, { timeout: 15_000 });
  });
}
