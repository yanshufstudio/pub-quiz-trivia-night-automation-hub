import { test, expect } from "@playwright/test";

/**
 * The FAQ exists for one question above the others: does the wizard make
 * pictures. It does not — the host adds their own — and until 22 Sep nothing
 * on the site said so, while the homepage promised "a picture round" as if
 * the wizard supplied it. The owner asked for the site to be clear that the
 * wizard writes text and nothing more, and for pictures, audio and video to
 * be stated as the next version, not sold as this one.
 *
 * So what these specs pin is not the prose but the things the page is
 * useless without: a stranger can read it, it is reachable, the sitemap
 * advertises it, and the text-only fact is on it and on the guide — and,
 * because copy drifts, that the homepage no longer sells a picture round
 * without saying whose pictures.
 */

test("a signed-out stranger can read the FAQ", async ({ page }) => {
  const res = await page.goto("/faq");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Questions and answers" })).toBeVisible();
  await expect(page).toHaveURL(/\/faq$/);
});

test("the FAQ and the guide both say the wizard writes text, and that pictures are the host's own", async ({ page }) => {
  await page.goto("/faq");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "What does the wizard actually write?" })).toBeVisible();
  await expect(main.getByText(/It does not make pictures, play music or show video clips/)).toBeVisible();
  await expect(main.getByText(/Yes, with your own pictures/)).toBeVisible();
  // The future is stated as future.
  await expect(main.getByText(/not in the product yet/)).toBeVisible();

  await page.goto("/how-it-works");
  await expect(page.getByRole("main").getByText(/it does not make pictures, music or video/)).toBeVisible();
});

test("the homepage no longer sells a picture round without saying whose pictures", async ({ page }) => {
  await page.goto("/");
  // The "Write it" card sits in the section below the hero's <main>, so this
  // reads the whole page rather than the main landmark.
  await expect(page.getByText(/Add your own pictures to any question for a picture round/)).toBeVisible();
  await expect(page.getByText(/a picture round — and the pack is drafted for you/)).toHaveCount(0);
});

test("the FAQ is reachable from the footer of an ordinary page", async ({ page }) => {
  await page.goto("/pricing");
  const footer = page.getByRole("contentinfo");
  await footer.getByRole("link", { name: "FAQ" }).click();
  await expect(page).toHaveURL(/\/faq$/);
  await expect(page.getByRole("heading", { level: 1, name: "Questions and answers" })).toBeVisible();
});

test("the sitemap advertises the FAQ, and robots.txt does not block it", async ({ request }) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain("/faq");

  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).not.toContain("Disallow: /faq");
});
