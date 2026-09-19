import { expect, request, type APIRequestContext, type Browser, type BrowserContext } from "@playwright/test";

/**
 * Signing in, for specs that need a host.
 *
 * It uses the real endpoints — ask for a magic link, read it back from the
 * test-only inbox route, follow it — so what these specs exercise is the
 * sign-in the product ships, not a fixture that agrees with the guard.
 *
 * Every context gets its own `x-forwarded-for`, because Better Auth's rate
 * limiter caps sign-in requests at 5 a minute PER CALLER and the whole suite
 * otherwise arrives from one address. That is the limiter working, not a
 * limit to work around: a spec that needs a host is modelling a different
 * person each time, and `signInIp()` is how it says so.
 */

let ipCounter = 0;

/**
 * A distinct caller address, so one spec's sign-ins do not throttle another's.
 *
 * It has to be a syntactically valid IPv4: Better Auth drops a malformed
 * `x-forwarded-for` and falls back to a single localhost key, which put the
 * whole suite back in one bucket the first time this was written.
 * 198.18.0.0/15 is the IETF benchmarking range — reserved, never routed.
 */
export function signInIp(): string {
  ipCounter += 1;
  return `198.18.${Math.floor(ipCounter / 254) % 2}.${(ipCounter % 254) + 1}`;
}

export function randomEmail(prefix = "host") {
  return `${prefix}-${Math.random().toString(36).slice(2)}@example.test`;
}

/** The most recent link the server "sent" to `email`. */
export async function lastSignInLinkFor(api: APIRequestContext, email: string): Promise<string> {
  const res = await api.get("/api/test/sign-in-links");
  expect(res.status(), "the test-only inbox should be open in the e2e environment").toBe(200);
  const { links } = (await res.json()) as { links: { email: string; url: string }[] };
  const mine = links.filter((link) => link.email === email);
  expect(mine.length, `no sign-in link was captured for ${email}`).toBeGreaterThan(0);
  return mine[mine.length - 1].url;
}

/**
 * Ask for a link without following it.
 *
 * `errorCallbackURL` is what the real form sends (see
 * src/app/sign-in/SignInForm.tsx): a link that fails to redeem has to land
 * somewhere that can explain why, and that is /sign-in.
 */
export async function requestSignInLink(api: APIRequestContext, email: string, callbackURL = "/packs") {
  const res = await api.post("/api/auth/sign-in/magic-link", {
    data: { email, callbackURL, errorCallbackURL: "/sign-in" },
    headers: { "x-forwarded-for": signInIp() },
  });
  expect(res.ok(), `sign-in request failed: ${res.status()}`).toBeTruthy();
  return lastSignInLinkFor(api, email);
}

/**
 * A browser context signed in as `email`, plus an API context sharing its
 * cookies — so a spec can drive the UI and call the API as the same host.
 */
export async function signedInContext(
  browser: Browser,
  baseURL: string,
  email = randomEmail()
): Promise<{ context: BrowserContext; api: APIRequestContext; email: string }> {
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { "x-forwarded-for": signInIp() },
  });
  const api = context.request;
  const link = await requestSignInLink(api, email);

  const page = await context.newPage();
  await page.goto(link);
  // The link redirects to its callbackURL; /packs is a gated page, so
  // arriving there at all is the proof the session took.
  await page.waitForURL(/\/packs/);
  await page.close();

  return { context, api, email };
}

/** An API-only context, signed in. For specs that never open a page. */
export async function signedInApi(baseURL: string, email = randomEmail()): Promise<APIRequestContext> {
  const api = await request.newContext({
    baseURL,
    extraHTTPHeaders: { "x-forwarded-for": signInIp() },
  });
  const link = await requestSignInLink(api, email);
  const res = await api.get(link);
  expect(res.ok() || res.status() === 302, `following the sign-in link failed: ${res.status()}`).toBeTruthy();
  return api;
}
