import { test, expect } from "@playwright/test";
import { signedInContext } from "./sign-in-helper";
import { CONTACT_EMAIL, LEGAL_LAST_UPDATED } from "@/lib/site";
import { FREE_PACK_ALLOWANCE } from "@/lib/pricing";

// Paddle's website review requires the three policy pages to be publicly
// served and reachable from the site. That is two separate claims, so this
// checks both: each page answers 200 with its own heading, and the footer
// that links them is present on the ordinary pages — including the ones a
// reviewer is most likely to land on first.
//
// The date comes from the constant the pages render rather than a literal:
// this spec used to hard-code 2026-09-15 and failed the first time the
// policies were revised, which is a test failing for the wrong reason. What
// is worth asserting is that a date is shown at all and that it is the one
// the app believes in — the sitemap publishes the same constant.

const PAGES = [
  { path: "/terms", heading: "Terms of Service" },
  { path: "/privacy", heading: "Privacy Policy" },
  { path: "/refunds", heading: "Refund Policy" },
] as const;

for (const { path, heading } of PAGES) {
  test(`${path} is served publicly and is dated`, async ({ page, request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);

    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.getByText(`Last updated: ${LEGAL_LAST_UPDATED}`)).toBeVisible();

    // Paddle's review also wants a way to contact the seller from these
    // pages, and /refunds names this address as the alternative to Paddle's
    // own buyer support — so a policy page that has lost its contact link,
    // or is showing a stale address, is a review failure and not a typo.
    await expect(page.getByRole("link", { name: CONTACT_EMAIL }).first()).toBeVisible();
  });
}

test("every policy page is reachable from the footer of an ordinary page", async ({ page }) => {
  await page.goto("/");

  const footer = page.getByRole("contentinfo");
  await expect(footer).toBeVisible();

  for (const { path, heading } of PAGES) {
    await page.goto("/");
    await footer.getByRole("link", { name: heading.split(" ")[0] }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});

// The footer is rendered from the root layout, so the surfaces that carry no
// chrome on purpose only stay clean for as long as SiteFooter's exclusion
// list is right. /play and /host are run in front of a room; anything on the
// print sheet comes out of the printer. Each is checked against a real URL
// rather than the regex, so a change to either one has to fail here.
test("the footer stays off the surfaces that carry no chrome", async ({ browser, baseURL }) => {
  // /packs/<id> and its print sheet are host surfaces now, so this spec
  // needs a session to reach them at all.
  const { context, api } = await signedInContext(browser, baseURL!);
  const { pack } = (await (await api.post("/api/packs/seed")).json()) as { pack: { id: string } };
  const page = await context.newPage();

  for (const path of ["/play", "/host/ABCDE", `/packs/${pack.id}/print`]) {
    await page.goto(path);
    await expect(page.getByRole("contentinfo"), `footer on ${path}`).toHaveCount(0);
  }

  // The control: the same locator does find it on an ordinary page, so a
  // getByRole that silently stopped matching anything cannot pass this file.
  await page.goto(`/packs/${pack.id}`);
  await expect(page.getByRole("contentinfo")).toHaveCount(1);
});

// The first-payment refund condition is worded against the free allowance
// (planning, 25 Sep): it must follow FREE_PACK_ALLOWANCE if the free tier
// changes, not a number typed into the page. And the page must never promise
// less than Paddle or consumer law guarantees, so the statutory-rights section
// and the links to Paddle's own terms have to be there.
test("/refunds ties the first-payment refund to the free allowance and puts statutory rights first", async ({ page }) => {
  await page.goto("/refunds");

  // M8 restated this in the unit the code actually counts: Pro packs in the
  // current billing period, rather than a 30-day window that only matched a
  // monthly subscription. The number is still the free plan's.
  await expect(
    page.getByText(
      new RegExp(`no more than ${FREE_PACK_ALLOWANCE} packs in the current billing\\s+period`)
    )
  ).toBeVisible();
  await expect(page.getByText(/the same number the free plan allows/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your legal rights come first" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Paddle Buyer Terms" })).toHaveAttribute(
    "href",
    "https://www.paddle.com/legal/invoiced-consumer-terms"
  );
  await expect(page.getByRole("link", { name: "refund policy" }).first()).toHaveAttribute(
    "href",
    "https://www.paddle.com/legal/refund-policy"
  );
});

test("/terms reserves the right to refuse repeat refund abusers and names Paddle's Buyer Terms", async ({ page }) => {
  await page.goto("/terms");

  await expect(
    page.getByText("account that repeatedly subscribes, uses Pro and asks for a refund", { exact: false })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Paddle Buyer Terms" })).toHaveAttribute(
    "href",
    "https://www.paddle.com/legal/invoiced-consumer-terms"
  );
});

/**
 * The launch-batch copy corrections, asserted on the rendered pages.
 *
 * These are the sentences a Paddle reviewer and a customer act on, and two of
 * them replace promises the product could not keep. So each one checks both
 * halves: that the new wording is there, and that the old wording is not.
 */
test("/privacy describes deletion in terms we can actually keep (M9)", async ({ page }) => {
  await page.goto("/privacy");

  await expect(page.getByText(/email us from the address you signed in with|from the address you signed in with/i)).toBeVisible();
  await expect(page.getByText(/within 30 days/i).first()).toBeVisible();
  await expect(
    page.getByText(/Encrypted backups kept by our database provider are overwritten/i)
  ).toBeVisible();

  // The promise that could not be kept: a backup we do not control is a copy,
  // so "we do not keep a copy" was false the moment it was written.
  await expect(page.getByText(/we do not keep a copy/i)).toHaveCount(0);
});

test("/privacy discloses the free-allowance record, and that it outlives the account (H1b)", async ({
  page,
}) => {
  await page.goto("/privacy");

  // H1(b) added a row that deliberately survives account deletion, so the
  // deletion promise above it stops being true unless the page says so.
  await expect(page.getByText(/A free-allowance record/)).toBeVisible();
  await expect(page.getByText(/one mailbox gets one free allowance/i)).toBeVisible();

  // It says hash, and says what a hash does and does not protect. The first
  // version called it a "one-way fingerprint" that "cannot be turned back into"
  // the address — true, and incomplete in the direction that flatters us:
  // somebody who already knows an address can test it. Paul's instruction was to
  // say that and not to call the record anonymous.
  await expect(page.getByText(/holds a hash of your email address, not the address/i)).toBeVisible();
  await expect(page.getByText(/somebody who already knew an address could hash it/i)).toBeVisible();
  await expect(page.getByText(/not anonymous either/i)).toBeVisible();

  // The exception is stated where somebody reading about deletion will meet it,
  // not only in the retention section further up — and now says the row is
  // deleted on a delay rather than simply kept, which is what the retention
  // sweep made true.
  await expect(page.getByText(/The one exception is the free-allowance record/i)).toBeVisible();
  await expect(page.getByText(/deleted on a delay rather than with the account/i)).toBeVisible();
  await expect(page.getByText(/30 days and a day/i)).toBeVisible();
});

test("/privacy lists Upstash and what Google sign-in stores (M10)", async ({ page }) => {
  await page.goto("/privacy");

  // Upstash holds IP addresses and was not listed at all, which the free-tier
  // per-address cap (H1a) makes more obviously wrong than it already was.
  await expect(page.getByText(/Upstash/)).toBeVisible();
  await expect(page.getByText(/we keep your IP address with short-lived counters/i)).toBeVisible();
  await expect(page.getByText(/deleted automatically within a day/i)).toBeVisible();

  await expect(
    page.getByText(/profile photo link and the sign-in tokens Google gives us/i)
  ).toBeVisible();
  await expect(page.getByText(/We use them only to sign you in/i)).toBeVisible();
});

test("/privacy lists Vercel Web Analytics and no longer says there is none (SEO3)", async ({ page }) => {
  await page.goto("/privacy");

  // The page said "We run no analytics" until the analytics component landed
  // (SEO2); a sentence that turned false the day it shipped is the failure
  // this guards.
  await expect(page.getByText(/We run no analytics/i)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Analytics, and no advertising" })).toBeVisible();

  const entry = page.getByRole("listitem").filter({ hasText: /^Vercel Web Analytics/ });
  await expect(entry).toHaveCount(1);
  // What Vercel's docs say is attributed to Vercel; what we measured on our own
  // pages (e2e/analytics.spec.ts) is stated as ours. Vercel's docs do not say
  // "sets no cookies", locate from an IP address, or stop a visit being followed
  // "from one day to the next", so none of those may come back as fact.
  await expect(entry).toContainText("Vercel says it doesn't rely on cookies");
  await expect(entry).toContainText("on our pages its script sets none and stores nothing in your browser");
  await expect(entry).toContainText("a country, region and city, and your browser");
  await expect(entry).not.toContainText("It sets no cookies");
  await expect(entry).not.toContainText("IP address");
  await expect(entry).not.toContainText("one day to the next");
  const noTracking = page.locator("#no-tracking");
  await expect(noTracking).toContainText("On our pages it sets no cookies and stores nothing in your browser");
  await expect(noTracking).not.toContainText("with no cookies, nothing stored in your browser");
  // The query-string sentence is only true because SiteAnalytics strips it —
  // e2e/analytics.spec.ts is the test that holds the code to it.
  await expect(entry).toContainText("we remove anything after a ? or # before it is sent");
  await expect(entry).toContainText("discards after 24 hours");
  await expect(entry).toContainText("at least 12 months");
});

test("/pricing and /terms state no Pro daily number, but do state the limits (M12)", async ({
  page,
}) => {
  // The pages used to print the per-subscriber cap. A number on a public page is
  // a promise: changing the cap became a pricing change, and lowering it during
  // an incident would leave the page false until somebody edited it. The
  // enforcement is unchanged — the wizard names the live figure when somebody
  // reaches it.
  //
  // This reads the rendered text, which is the half a source scan cannot do: a
  // number arriving through an expression looks like nothing in the source.
  const NUMBER_NEAR_DAILY =
    /(\b\d+\b[^.\n]{0,40}\bpacks?\s+(a|per)\s+day\b)|(\bup\s+to\s+\d+\b)|(\b\d+\s*\/\s*day\b)/i;

  for (const path of ["/pricing", "/terms"]) {
    await page.goto(path);
    const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");

    const offender = text.match(NUMBER_NEAR_DAILY);
    expect(offender?.[0], `${path} publishes a Pro daily number: ${offender?.[0]}`).toBeUndefined();

    // And it has not simply gone quiet: somebody deciding whether to pay is
    // entitled to know a fair-use limit exists.
    expect(text, path).toMatch(/fair-use limit/i);
    expect(text, path).toMatch(/safety limit/i);
  }

  // PRC6: Pro fair use over a rolling 30 days, on /pricing, /terms and /faq,
  // with no number (the 30-day figure is unpublished on the same terms).
  for (const path of ["/pricing", "/terms", "/faq"]) {
    await page.goto(path);
    const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    expect(text, path).toMatch(/fair use/i);
    expect(text, path).toMatch(/rolling 30 days/i);
    expect(text, path).toMatch(/the wizard tells you when it resets/i);
    expect(text, path).not.toMatch(/\b40\b/);
  }

  // /refunds keeps its M8 counting wording — that is a refund term, not a
  // published allowance, and it names no daily figure.
  await page.goto("/refunds");
  await expect(page.getByText(/no packs in the current billing period/i).first()).toBeVisible();
});

test("/refunds counts what the code counts, and says what the statement shows (M8, M11)", async ({
  page,
}) => {
  await page.goto("/refunds");

  // M8: the rule is now stated in the unit the code actually keeps —
  // Creator.proPacksGeneratedInPeriod, rolled by Paddle's billing period — rather
  // than in a 30-day window that only matched a monthly subscription.
  await expect(page.getByText(/in the current billing period/i).first()).toBeVisible();
  await expect(page.getByText(/no packs in the current billing period/i)).toBeVisible();
  await expect(page.getByText(/any packs in that period/i)).toHaveCount(0);

  // M11: the descriptor, on the page somebody reads when checking a charge.
  await expect(page.getByText(/PADDLE\.NET\* YANSHUFST/)).toBeVisible();

  // The approved terms themselves are unchanged.
  await expect(page.getByText(/within 14 days of the charge/i).first()).toBeVisible();
  await expect(page.getByText(/no reason needed/i)).toBeVisible();
});

test("/terms states the Pro limits without a number, and the minimum ages (M12, M13)", async ({
  page,
}) => {
  await page.goto("/terms");

  // M12, third revision (Paul, 27 Sep). This used to assert "up to 10
  // AI-generated packs a day" — the number the generate route enforces. The
  // number is deliberately no longer published: on a public page it is a
  // promise, so changing the cap became a pricing change. What /terms states now
  // is the shape, and that the product names the figure when somebody meets it.
  await expect(page.getByText(/removes the free plan's pack allowance/i)).toBeVisible();
  await expect(page.getByText(/daily fair-use limit per account/i)).toBeVisible();
  await expect(page.getByText(/service-wide daily safety limit/i)).toBeVisible();
  await expect(page.getByText(/Pro is subject to fair use/i)).toBeVisible();
  await expect(page.getByText(/the wizard shows the current limit/i)).toHaveCount(0);
  // The three claims this page has now outgrown, in order of when they were
  // wrong: "removes that cap" made Pro sound uncapped, and the number itself.
  await expect(page.getByText(/removes that cap/i)).toHaveCount(0);
  await expect(page.getByText(/up to 10/i)).toHaveCount(0);

  // M13: an account minimum, which the page did not have at all — it said there
  // was no age requirement for a free account.
  await expect(page.getByText(/at least 16 to create an account/i)).toBeVisible();
  await expect(page.getByText(/at least 18 to buy Pro/i)).toBeVisible();
  await expect(page.getByText(/no age requirement/i)).toHaveCount(0);
});

test("/pricing, /faq and /refunds describe the free trial and its first charge (PRC11)", async ({ page }) => {
  for (const path of ["/pricing", "/faq", "/refunds"]) {
    await page.goto(path);
    const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    expect(text, path).toMatch(/14-day free trial, card required/i);
    expect(text, path).toMatch(/charged when the trial ends/i);
  }

  // The first payment's refund condition counts from the trial's start (PRC10).
  await page.goto("/refunds");
  await expect(page.getByText(/packs you generate during the trial count/i)).toBeVisible();
});
