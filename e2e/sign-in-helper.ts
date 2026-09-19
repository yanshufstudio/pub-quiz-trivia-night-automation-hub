import { expect, request, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * Signing in, for specs that need a host.
 *
 * It uses the real endpoints — ask for a code, read the email back from the
 * test-only inbox route, submit the code — so what these specs exercise is
 * the sign-in the product ships, not a fixture that agrees with the guard.
 */

/**
 * A distinct caller address for every context and every request that reaches
 * `/api/auth/*`.
 *
 * Better Auth keys its rate limiter on `${ip}|${path}`, and in dev and test
 * `getIP` falls back to a single `127.0.0.1` when no `x-forwarded-for`
 * arrives (`@better-auth/core/utils/ip`). So a context created without one
 * does not merely share a bucket with the rest of the suite — it shares the
 * bucket with every *other* unattributed context, across every spec file, for
 * the whole run. That is a suite whose failures depend on how the tests were
 * ordered, which is the shape the sign-in reuse spec was flaking in.
 *
 * `newAnonContext` and `newAnonApi` below exist so a spec cannot forget. Use
 * them instead of `browser.newContext` anywhere a page will be loaded: every
 * page renders the header, the header asks `/api/auth/get-session`, and that
 * is enough to put a context in the shared bucket.
 *
 * The address has to be a syntactically valid IPv4: Better Auth drops a
 * malformed header and falls straight back to the shared key, which put the
 * whole suite back in one bucket the first time this was written.
 * 198.18.0.0/15 is the IETF benchmarking range — reserved, never routed —
 * and the worker index is folded in so two Playwright workers cannot hand
 * out the same address if this config ever stops running serially.
 */
let ipCounter = 0;
const WORKER = Number(process.env.TEST_PARALLEL_INDEX ?? 0) % 256;

export function signInIp(): string {
  ipCounter += 1;
  return `198.18.${WORKER}.${(ipCounter % 254) + 1}`;
}

/** A browser context that speaks for one caller of its own. */
export function newAnonContext(browser: Browser, baseURL?: string): Promise<BrowserContext> {
  return browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    extraHTTPHeaders: { "x-forwarded-for": signInIp() },
  });
}

/** An API-only context that speaks for one caller of its own. */
export function newAnonApi(baseURL: string): Promise<APIRequestContext> {
  return request.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": signInIp() } });
}

/**
 * The page's own alert, and not Next's.
 *
 * `page.getByRole("alert")` is not unique on any App Router page: Next
 * hydrates a `<div id="__next-route-announcer__" role="alert">` into the
 * body, and from then on a bare alert locator resolves to two elements and
 * Playwright's strict mode fails the assertion. It does not fail every time,
 * which is the trap — the announcer arrives ~200ms after the HTML, so an
 * assertion that polls inside that window passes and the same assertion on a
 * busier machine does not. That is what the sign-in reuse spec was flaking
 * on, and it is why every alert assertion here is scoped.
 */
export function pageAlert(page: Page) {
  return page.getByRole("main").getByRole("alert");
}

export function randomEmail(prefix = "host") {
  return `${prefix}-${Math.random().toString(36).slice(2)}@example.test`;
}

export type SentSignInEmail = { email: string; code: string; url: string };

/** The most recent email the server "sent" to `email`. */
export async function lastSignInEmailFor(api: APIRequestContext, email: string): Promise<SentSignInEmail> {
  const res = await api.get("/api/test/sign-in-emails");
  expect(res.status(), "the test-only inbox should be open in the e2e environment").toBe(200);
  const { emails } = (await res.json()) as { emails: SentSignInEmail[] };
  const mine = emails.filter((sent) => sent.email === email);
  expect(mine.length, `no sign-in email was captured for ${email}`).toBeGreaterThan(0);
  return mine[mine.length - 1];
}

/** Ask for a code without using it. Returns the code and the confirm link. */
export async function requestSignInEmail(api: APIRequestContext, email: string): Promise<SentSignInEmail> {
  const res = await api.post("/api/auth/email-otp/send-verification-otp", {
    data: { email, type: "sign-in" },
    headers: { "x-forwarded-for": signInIp() },
  });
  expect(res.ok(), `sign-in request failed: ${res.status()}`).toBeTruthy();
  return lastSignInEmailFor(api, email);
}

/**
 * Submit a code through the real endpoint. Returns the raw response so a
 * spec can assert on a failed submission too.
 */
export function submitSignInCode(api: APIRequestContext, email: string, code: string) {
  return api.post("/api/auth/sign-in/email-otp", {
    data: { email, otp: code },
    headers: { "x-forwarded-for": signInIp() },
    failOnStatusCode: false,
  });
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
  const context = await newAnonContext(browser, baseURL);
  const api = context.request;
  const { code } = await requestSignInEmail(api, email);

  const res = await submitSignInCode(api, email, code);
  expect(res.ok(), `submitting the sign-in code failed: ${res.status()}`).toBeTruthy();

  return { context, api, email };
}

/** An API-only context, signed in. For specs that never open a page. */
export async function signedInApi(baseURL: string, email = randomEmail()): Promise<APIRequestContext> {
  const api = await newAnonApi(baseURL);
  const { code } = await requestSignInEmail(api, email);
  const res = await submitSignInCode(api, email, code);
  expect(res.ok(), `submitting the sign-in code failed: ${res.status()}`).toBeTruthy();
  return api;
}
