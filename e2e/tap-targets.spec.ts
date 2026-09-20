import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { newAnonContext, signedInContext } from "./sign-in-helper";

/**
 * Every control in the header row is a target a thumb can hit.
 *
 * They were 36px tall — the four nav links and, since accounts, "Sign in"
 * (68x36) and "Sign out" (69x36). Under Material's 48dp minimum and iOS's
 * 44pt one, on the two controls a host taps most on a phone. Nothing in the
 * suite measured a control's size, so nothing would notice it creeping back.
 *
 * 48 is the floor asserted because it is the stricter of the two and clears
 * both. Both copies of the row are measured: SiteHeader (on /pricing) and the
 * homepage's own copy, which does not render SiteHeader and has drifted from
 * it before.
 */

const MIN = 48;
const WIDTHS = [320, 390, 1280] as const;

const SURFACES: { path: string; nav: (page: Page) => Locator }[] = [
  { path: "/pricing", nav: (page) => page.getByRole("banner").getByRole("navigation") },
  // The homepage folds the row into its hero; its nav is the first on the page.
  { path: "/", nav: (page) => page.locator("nav").first() },
];

// One test per surface and state, walking the widths inside it: a signed-in
// test has to mail itself a code, and six of those inside a minute trip the
// sign-in limiter this suite shares.
for (const signedIn of [false, true]) {
  for (const { path, nav } of SURFACES) {
    test(`every header control on ${path} is at least ${MIN}px, signed ${signedIn ? "in" : "out"}`, async ({
      browser,
      baseURL,
    }) => {
      const context: BrowserContext = signedIn
        ? (await signedInContext(browser, baseURL!)).context
        : await newAnonContext(browser, baseURL!);
      const page = await context.newPage();

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(path, { waitUntil: "networkidle" });

        const row = nav(page);
        // `^Sign out`, not an exact name: the button's accessible name may
        // carry the account ("Sign out of …") as well as the word.
        const account = signedIn
          ? row.getByRole("button", { name: /^Sign out/ })
          : row.getByRole("link", { name: "Sign in" });
        await expect(account).toBeVisible();

        const links = await row.getByRole("link").all();
        // Four pages, plus Sign in when signed out — so an empty or half-
        // rendered row cannot pass by having nothing to measure.
        expect(links.length, `links in the row at ${width}px`).toBe(signedIn ? 4 : 5);
        const controls = signedIn ? [...links, account] : links;

        for (const control of controls) {
          const label = (await control.textContent())?.trim();
          const box = (await control.boundingBox())!;
          expect(Math.round(box.height), `"${label}" is ${box.height}px tall at ${width}px`).toBeGreaterThanOrEqual(MIN);
          expect(Math.round(box.width), `"${label}" is ${box.width}px wide at ${width}px`).toBeGreaterThanOrEqual(MIN);
        }
      }

      await context.close();
    });
  }
}
