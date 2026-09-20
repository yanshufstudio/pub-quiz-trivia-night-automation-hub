import { test, expect } from "@playwright/test";
import { signedInContext } from "./sign-in-helper";
import { CONTACT_EMAIL, LEGAL_LAST_UPDATED } from "@/lib/site";

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
