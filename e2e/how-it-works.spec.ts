import { test, expect } from "@playwright/test";

/**
 * The guide is the answer to "what do I actually do on the night", and the
 * reason it exists is that the product had no answer: the wizard, the print
 * sheets, the live session and the join code were all there, and nothing
 * said in what order to use them or that the host desk and the team phones
 * are two different surfaces.
 *
 * So what these specs pin is not the prose — the owner will rewrite that —
 * but the things the page is useless without: that a stranger can read it
 * without an account, that it is reachable rather than merely present, and
 * that the two facts a host cannot guess are on it.
 */

test("a signed-out stranger can read the guide", async ({ page }) => {
  const res = await page.goto("/how-it-works");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "How to run a quiz night" })).toBeVisible();

  // No redirect to /sign-in: this is the page you send someone who has not
  // signed up, so the moment it needs an account it stops doing its job.
  await expect(page).toHaveURL(/\/how-it-works$/);
});

test("the guide carries the two things a host cannot guess", async ({ page }) => {
  await page.goto("/how-it-works");
  const main = page.getByRole("main");

  // Where teams go, and that they need nothing to get there.
  await expect(main.getByText("triviafoundry.com/play")).toBeVisible();
  await expect(main.getByText(/No account, no app, no sign-up/i)).toBeVisible();

  // That the host key stays with the browser you start the session in —
  // the fact that turns into a crisis if it is learned during a quiz.
  await expect(main.getByText(/host key/i)).toBeVisible();
});

test("the guide is reachable from the footer of an ordinary page", async ({ page }) => {
  await page.goto("/pricing");
  const footer = page.getByRole("contentinfo");
  await expect(footer).toBeVisible();

  await footer.getByRole("link", { name: "How it works" }).click();
  await expect(page).toHaveURL(/\/how-it-works$/);
  await expect(page.getByRole("heading", { level: 1, name: "How to run a quiz night" })).toBeVisible();
});

test("the sitemap advertises the guide, and robots.txt does not block it", async ({ request }) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain("/how-it-works");

  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  // A sitemap entry that robots.txt disallows is the one sitemap mistake
  // Search Console actually complains about.
  expect(await robots.text()).not.toContain("Disallow: /how-it-works");
});
