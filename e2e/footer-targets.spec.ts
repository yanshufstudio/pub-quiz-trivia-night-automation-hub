import { test, expect, type BrowserContext } from "@playwright/test";
import { newAnonContext, signedInContext } from "./sign-in-helper";

/**
 * Every link in the footer is a target a thumb can hit.
 *
 * The header's controls were brought up to 48px in the tap-targets change,
 * which left the footer with a note: "probably small targets too. Not
 * measured." Measured, they were 28px tall — text-sm with py-1 — on every
 * page that carries the footer, at every width. Pricing, Terms, Privacy and
 * Refunds are the links Paddle's reviewer follows and the ones a host reads
 * on a phone before paying, and nothing in the suite would have noticed them
 * shrinking further.
 *
 * 48 is the floor asserted because it is the stricter of Material's 48dp and
 * iOS's 44pt and clears both. The homepage is measured because it folds its
 * own header into the hero but takes the footer from the root layout like
 * every other page; the three policy pages because they are where the footer
 * is the only way onward.
 */

const MIN = 48;
const WIDTHS = [320, 390, 1280] as const;
const PAGES = ["/", "/terms", "/privacy", "/refunds"] as const;
const LABELS = ["Pricing", "Terms", "Privacy", "Refunds"];

// One test per state, walking the pages and widths inside it: a signed-in
// test has to mail itself a code, and a dozen of those inside a minute trip
// the sign-in limiter this suite shares.
for (const signedIn of [false, true]) {
  test(`every footer link is at least ${MIN}px on every page, signed ${signedIn ? "in" : "out"}`, async ({
    browser,
    baseURL,
  }) => {
    const context: BrowserContext = signedIn
      ? (await signedInContext(browser, baseURL!)).context
      : await newAnonContext(browser, baseURL!);
    const page = await context.newPage();

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      for (const path of PAGES) {
        await page.goto(path, { waitUntil: "networkidle" });

        // The footer's one landmark nav, whatever it is labelled: the label
        // names its contents and changes when a link joins the row.
        const nav = page.getByRole("contentinfo").getByRole("navigation");
        await expect(nav).toBeVisible();

        const links = await nav.getByRole("link").all();
        // The four Paddle's reviewer follows must be there, by name — so an
        // empty or half-rendered footer cannot pass by having nothing to
        // measure. Any link that joins them is measured too.
        const labels = await Promise.all(links.map(async (l) => (await l.textContent())?.trim()));
        expect(labels, `footer links on ${path} at ${width}px`).toEqual(expect.arrayContaining(LABELS));

        for (const link of links) {
          const label = (await link.textContent())?.trim();
          const box = (await link.boundingBox())!;
          expect(Math.round(box.height), `"${label}" is ${box.height}px tall on ${path} at ${width}px`).toBeGreaterThanOrEqual(MIN);
          expect(Math.round(box.width), `"${label}" is ${box.width}px wide on ${path} at ${width}px`).toBeGreaterThanOrEqual(MIN);
        }
      }
    }

    await context.close();
  });
}
