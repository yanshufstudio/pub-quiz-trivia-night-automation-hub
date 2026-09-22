import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { newAnonContext, signedInContext } from "./sign-in-helper";

/**
 * Where the header row puts things, on a phone and on a desktop.
 *
 * Below md (768px) the sign, the four links and the account corner cannot
 * share one line, so the row stacks into three. Until 21 Sep each line kept
 * its own alignment: the sign on the left, the links a little in from it, and
 * the account corner right-aligned inside a fixed 13.5rem slot that itself
 * sat on the left — so "name · Sign out" floated at no particular place.
 * Paul picked "all centred" from three mock-ups (A, of A/B/C). At md and up
 * it stays the single row it always was: sign flush left, nav flush right.
 *
 * Both surfaces are measured — SiteHeader (on /terms) and the homepage's own
 * copy of the row, which does not render SiteHeader and has drifted from it
 * before — signed out and signed in, because the account corner is a
 * different control in each.
 *
 * The coaster's brass rim is checked here too: it used to be hidden below
 * `sm`, a screen-width rule standing in for a mark-size one, so every phone
 * showed the mark without it.
 */

// 320: the narrowest phone we support. 375: iPhone SE / mini. 430: the
// largest phones. 752: the widest viewport that still stacks, so the
// centring is proven right up to the breakpoint rather than only on phones.
const STACKED = [320, 375, 430, 752] as const;
// 768: the first width with one row. 1280: an ordinary laptop.
const ONE_ROW = [768, 1280] as const;

// max-w-5xl and px-5 on both copies of the row.
const MAX_W = 1024;
const PAD = 20;

const SURFACES: { path: string; nav: (page: Page) => Locator }[] = [
  { path: "/terms", nav: (page) => page.getByRole("banner").getByRole("navigation") },
  // The homepage folds the row into its hero; its nav is the first on the page.
  { path: "/", nav: (page) => page.locator("nav").first() },
];

const LABELS = ["Create", "Packs", "Join", "Pricing"] as const;

type Box = { left: number; right: number; top: number; bottom: number };

async function boxOf(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  expect(b, "an element that should be on screen has no box").not.toBeNull();
  return { left: b!.x, right: b!.x + b!.width, top: b!.y, bottom: b!.y + b!.height };
}

function union(boxes: Box[]): Box {
  return {
    left: Math.min(...boxes.map((b) => b.left)),
    right: Math.max(...boxes.map((b) => b.right)),
    top: Math.min(...boxes.map((b) => b.top)),
    bottom: Math.max(...boxes.map((b) => b.bottom)),
  };
}

const centreX = (b: Box) => (b.left + b.right) / 2;
const centreY = (b: Box) => (b.top + b.bottom) / 2;

/** The three things the row lays out: the sign, the four links, the account corner. */
async function parts(page: Page, nav: Locator, signedIn: boolean) {
  const sign = await boxOf(page.getByRole("link", { name: "TriviaFoundry home" }).first());
  const links = union(await Promise.all(LABELS.map((label) => boxOf(nav.getByRole("link", { name: label, exact: true })))));
  // Signed in, the corner is the printed name (it carries the full address
  // as its tooltip) plus Sign out; signed out, it is the Sign in link.
  const account = signedIn
    ? union([
        await boxOf(nav.locator("[title*='@']")),
        await boxOf(nav.getByRole("button", { name: /^Sign out/ })),
      ])
    : await boxOf(nav.getByRole("link", { name: "Sign in" }));
  return { sign, links, account };
}

for (const signedIn of [false, true]) {
  for (const { path, nav } of SURFACES) {
    test(`the header row on ${path} is centred when it stacks and one row from md, signed ${signedIn ? "in" : "out"}`, async ({
      browser,
      baseURL,
    }) => {
      const context: BrowserContext = signedIn
        ? (await signedInContext(browser, baseURL!)).context
        : await newAnonContext(browser, baseURL!);
      const page = await context.newPage();

      for (const width of STACKED) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(path, { waitUntil: "networkidle" });
        const row = nav(page);
        // Wait for the session to resolve: the slot holds a blank placeholder
        // until it does, and a blank has nothing to centre.
        await expect(signedIn ? row.getByRole("button", { name: /^Sign out/ }) : row.getByRole("link", { name: "Sign in" })).toBeVisible();

        // The middle of the page, not of the viewport: a vertical scrollbar,
        // where there is one, takes its width off the right-hand side.
        const middle = await page.evaluate(() => document.documentElement.clientWidth / 2);
        const { sign, links, account } = await parts(page, row, signedIn);

        for (const [name, box] of [["the sign", sign], ["the links", links], ["the account corner", account]] as const) {
          expect(Math.abs(centreX(box) - middle), `${name} is off-centre by ${centreX(box) - middle}px at ${width}px`).toBeLessThanOrEqual(1.5);
        }
        // Three lines, in order — so "centred" cannot pass by everything
        // collapsing onto one line in the middle.
        expect(links.top, `the links sit under the sign at ${width}px`).toBeGreaterThanOrEqual(sign.bottom - 12);
        expect(account.top, `the account corner sits under the links at ${width}px`).toBeGreaterThanOrEqual(links.bottom - 12);
      }

      for (const width of ONE_ROW) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(path, { waitUntil: "networkidle" });
        const row = nav(page);
        await expect(signedIn ? row.getByRole("button", { name: /^Sign out/ }) : row.getByRole("link", { name: "Sign in" })).toBeVisible();

        const inner = await page.evaluate(() => document.documentElement.clientWidth);
        const contentLeft = (inner - Math.min(inner, MAX_W)) / 2 + PAD;
        const contentRight = inner - contentLeft;
        const { sign, links, account } = await parts(page, row, signedIn);

        // One row: everything on the sign's line.
        for (const [name, box] of [["the links", links], ["the account corner", account]] as const) {
          expect(Math.abs(centreY(box) - centreY(sign)), `${name} left the sign's line at ${width}px`).toBeLessThanOrEqual(4);
        }
        // Sign flush left, account flush right, as before this change.
        expect(Math.abs(sign.left - contentLeft), `the sign moved off the left edge at ${width}px`).toBeLessThanOrEqual(1.5);
        expect(Math.abs(account.right - contentRight), `the account corner moved off the right edge at ${width}px`).toBeLessThanOrEqual(1.5);
      }

      await context.close();
    });
  }
}

test("the coaster keeps its brass rim on a phone", async ({ browser, baseURL }) => {
  const context = await newAnonContext(browser, baseURL!);
  const page = await context.newPage();
  for (const path of ["/terms", "/"]) {
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(path, { waitUntil: "networkidle" });
      // BrandMark: an aria-hidden coaster whose first child is the rim.
      const rim = page.getByRole("link", { name: "TriviaFoundry home" }).first().locator("span[aria-hidden] > span").first();
      const style = await rim.evaluate((el) => {
        const s = getComputedStyle(el);
        return { display: s.display, width: parseFloat(s.borderTopWidth), style: s.borderTopStyle };
      });
      expect(style.display, `the rim is hidden on ${path} at ${width}px`).not.toBe("none");
      expect(style.style, `the rim has no border style on ${path} at ${width}px`).toBe("solid");
      expect(style.width, `the rim has no width on ${path} at ${width}px`).toBeGreaterThan(0);
    }
  }
  await context.close();
});
