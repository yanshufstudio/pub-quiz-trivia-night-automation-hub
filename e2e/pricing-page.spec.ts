import { test, expect } from "@playwright/test";
import {
  ANNUAL_MONTHS_FREE,
  FREE_PACK_ALLOWANCE,
  PRICE_ANNUAL_USD,
  PRICE_MONTHLY_USD,
  formatUsd,
} from "@/lib/pricing";
import { CONTACT_EMAIL } from "@/lib/site";

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
  // "two months free" against $5 and $25, which was seven.
  await expect(page.getByText(`${ANNUAL_MONTHS_FREE} months free`, { exact: false })).toBeVisible();

  // The Free card said "No card, no account" until accounts went live on
  // 2026-09-20, after which the second half was false: running a quiz needs
  // an account (a free one). Teams still need none, but this page is about
  // what a host pays for.
  await expect(page.getByRole("main").getByText(/no account/i)).toHaveCount(0);
  await expect(page.getByText("A free account, no card")).toBeVisible();
});

// PRC2: venues and frequent hosts get a line, not a card, while the plan is
// shaped. It sits under the two cards and writes to the published address.
test("/pricing invites venues to get in touch, under the cards", async ({ page }) => {
  await page.goto("/pricing");

  const line = page.getByText(/Running quizzes for a venue, or several nights a week\?/);
  await expect(line).toBeVisible();
  await expect(line).toContainText("we're shaping a plan for you.");
  const link = line.getByRole("link", { name: "Get in touch" });
  await expect(link).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);

  // Below the Pro card, not inside either card.
  const proCard = page.locator("section[aria-labelledby=plan-pro]");
  await expect(proCard.getByText(/Running quizzes for a venue/)).toHaveCount(0);
  const cardBottom = await proCard.evaluate((el) => el.getBoundingClientRect().bottom);
  const lineTop = await line.evaluate((el) => el.getBoundingClientRect().top);
  expect(lineTop).toBeGreaterThan(cardBottom);
});

test("a signed-out visitor is asked to sign in, not shown a checkout", async ({ page }) => {
  // A subscription belongs to an account, so there is nothing to buy without
  // one: the Pro card offers "Sign in to subscribe", which comes back here.
  // No Subscribe button, and Paddle.js is not loaded for someone who cannot
  // use it.
  await page.goto("/pricing");
  const signIn = page.getByRole("main").getByRole("link", { name: "Sign in to subscribe" });
  await expect(signIn).toBeVisible();
  await expect(signIn).toHaveAttribute("href", "/sign-in?next=%2Fpricing");
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

/**
 * The homepage folds its own nav row into the hero instead of rendering
 * <SiteHeader>, and for a day it kept a hand-maintained copy of the link list
 * that had gone stale: Pricing was added to the header and the homepage — the
 * first page Paddle's reviewer sees — silently still showed three links. Both
 * now render the same exported array, and this is the check that says so.
 */
test("the homepage's own top nav carries every header link, Pricing included", async ({ page }) => {
  await page.goto("/");

  // Scoped to the hero's nav, not the footer: the footer already had a
  // Pricing link while the top of the page did not, so a page-wide lookup
  // would have passed straight through the bug. The homepage's row sits in a
  // bare <div> above <main> rather than in a <header>, so this keys off the
  // navigation landmark and takes the first one in document order.
  const topNav = page.getByRole("navigation").first();
  for (const label of ["Create", "Packs", "Join", "Pricing"]) {
    await expect(topNav.getByRole("link", { name: label, exact: true })).toBeVisible();
  }

  await topNav.getByRole("link", { name: "Pricing", exact: true }).click();
  await expect(page).toHaveURL(/\/pricing$/);
});

// Planning, 25 Sep: "as many quiz packs as you want" overclaimed once a
// service-wide daily generation ceiling existed (src/lib/daily-ceiling.ts).
// The Pro benefit is lifting the free limit, in the words the studio site's
// TriviaFoundry card quotes, and the shared daily limit is stated, not
// contradicted. The wording of that second half changed with M12: the page used
// to call it "a daily safety limit across all accounts ... well above normal
// use", which described neither the per-subscriber cap that now exists nor a
// number anyone could plan around.
test("/pricing says Pro lifts the free limit and states the daily limits", async ({ page }) => {
  await page.goto("/pricing");
  const main = page.getByRole("main");

  // Exactly once. It was said twice for one commit — as the card's headline and
  // again opening the fair-use note — which left the card's only benefit bullet
  // pointing at the note instead of carrying anything.
  await expect(main.getByText(`Pro lifts the ${FREE_PACK_ALLOWANCE}-pack limit`)).toHaveCount(1);
  await expect(main.getByText(/write a fresh quiz for every night of the week/i)).toBeVisible();
  await expect(main.getByText(/see the fair-use note below/i)).toHaveCount(0);
  // "shared daily safety limit" until M12's third revision, which renamed both
  // limits so the per-account one is named too — a subscriber meeting the
  // fair-use limit was previously told about a "shared" limit that was not the
  // one stopping them.
  await expect(main.getByText(/daily safety limit across the whole service/i)).toBeVisible();
  await expect(main.getByText(/daily fair-use limit on each account/i)).toBeVisible();
  await expect(main.getByText(/as many (quiz )?packs as you want/i)).toHaveCount(0);
  await expect(main.getByText(/unlimited/i)).toHaveCount(0);
});

/**
 * The launch-batch copy corrections on /pricing (M11, M12).
 *
 * Both replace claims that were wrong rather than merely thin, so each checks
 * that the old wording is gone as well as that the new wording is there.
 */
test("/pricing describes both daily limits and publishes neither number (M12)", async ({ page }) => {
  await page.goto("/pricing");

  // This asserted "up to 10 AI-generated packs a day" twice until Paul's 27 Sep
  // decision. The enforcement did not change — PRO_USER_DAILY_PACK_LIMIT still
  // defaults to 10 and the 429 still names it — but the page no longer promises
  // a figure, because a figure on a public page cannot be lowered during an
  // incident without making the page false.
  await expect(page.getByText(/up to 10/i)).toHaveCount(0);
  await expect(page.getByText(/AI-generated packs a day/i)).toHaveCount(0);

  await expect(page.getByText(/daily fair-use limit on each account/i)).toBeVisible();
  await expect(page.getByText(/daily safety limit across the whole service/i)).toBeVisible();
  await expect(page.getByText(/the wizard tells you the limit and when it resets/i)).toBeVisible();
  await expect(page.getByText(/00:00 UTC/i)).toBeVisible();

  // "no cap" was never true — there was always a shared ceiling — and it is
  // less true now that each subscriber has a daily allowance of their own.
  await expect(page.getByText(/no cap/i)).toHaveCount(0);
  await expect(page.getByText(/well above normal use/i)).toHaveCount(0);
});

test("/pricing says what the card statement will show (M11)", async ({ page }) => {
  await page.goto("/pricing");

  // A descriptor nobody recognises is the commonest reason a legitimate charge
  // gets disputed, and a dispute costs more than the subscription.
  await expect(page.getByText(/PADDLE\.NET\* YANSHUFST/)).toBeVisible();
  await expect(page.getByText(/reseller and merchant of record/i)).toBeVisible();
  await expect(page.getByText(/receipts come from Paddle on behalf of Yanshuf Studio/i)).toBeVisible();
});
