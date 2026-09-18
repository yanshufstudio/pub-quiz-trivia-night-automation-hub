import { test, expect } from "@playwright/test";

// The suite had no viewport narrower than a desktop, so a header row that
// could not fit a phone shipped to production unnoticed: the sign plus the
// nav are a single non-wrapping flex row, and below ~410px they pushed the
// page sideways — 85px of horizontal scroll at 320px, and still 15px on a
// standard iPhone at 390px. A green suite said nothing, because nothing in
// it ever looked at a narrow screen.
//
// Horizontal scroll is the check because it is the symptom a person actually
// meets: the page slides under the thumb and the right-hand nav is cut off.

const WIDTHS = [320, 360, 390, 430] as const;

// Every surface that carries the wordmark-and-nav row. The live-night
// surfaces (/play, /host/<code>) deliberately carry no such row and were
// never affected; they are covered by their own specs.
const PAGES = ["/", "/create", "/pricing", "/terms", "/privacy", "/refunds"] as const;

async function horizontalOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    return de.scrollWidth - de.clientWidth;
  });
}

for (const width of WIDTHS) {
  for (const path of PAGES) {
    test(`${path} does not scroll sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(path, { waitUntil: "networkidle" });
      expect(await horizontalOverflow(page)).toBe(0);
    });
  }
}

// Without this the whole file could pass on a page that never rendered at
// all — a blank document has no overflow either. Inject something wider than
// the viewport and assert the same measurement does report it, so a false
// green in the tests above cannot go unnoticed.
test("the overflow check itself detects a too-wide element", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/", { waitUntil: "networkidle" });
  expect(await horizontalOverflow(page)).toBe(0);

  await page.evaluate(() => {
    const el = document.createElement("div");
    el.id = "overflow-control";
    el.style.cssText = "width:1200px;height:8px";
    document.body.appendChild(el);
  });

  expect(await horizontalOverflow(page)).toBeGreaterThan(0);
});
