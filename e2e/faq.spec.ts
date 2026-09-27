import { test, expect } from "@playwright/test";
import { formatBytes, MAX_MEDIA_BYTES } from "@/lib/media-limits";

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
  await expect(page.getByText(/Add your own pictures to any question, up to \d+ MB each, for a picture round/)).toBeVisible();
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

// L23. The size is read from the constant the upload route enforces, so a
// page stating a different number than the server refuses at fails here.
test("every place that describes images states the real upload limit (L23)", async ({ page }) => {
  const limit = formatBytes(MAX_MEDIA_BYTES);
  expect(limit).toBe("2 MB");

  await page.goto("/faq");
  await expect(page.locator("#pictures")).toContainText(`a JPEG or PNG of up to ${limit}`);
  await page.goto("/how-it-works");
  await expect(page.getByRole("main")).toContainText(`a JPEG or PNG of up to ${limit}`);
  await page.goto("/");
  await expect(page.getByText(`up to ${limit} each, for a picture round`)).toBeVisible();
});

// L23. The PDF sheets are set in the PDF standard Times fonts, whose
// encoding covers Western European letters only (see pdf-fonts.test.ts).
test("the FAQ and the guide say what the printed sheets cannot print yet (L23)", async ({ page }) => {
  for (const path of ["/faq", "/how-it-works"]) {
    await page.goto(path);
    const main = page.getByRole("main");
    await expect(main, path).toContainText("The printed sheets can only print Western European letters for now");
    await expect(main, path).toContainText("do not print correctly yet");
  }
});

// L24. The answer used to say "Mark it yourself" and never that marking is
// automatic. Each clause is a claim about src/lib/scoring.ts, which
// scoring.test.ts pins case by case.
test("the FAQ says answers are marked automatically and the host can override (L24)", async ({ page }) => {
  await page.goto("/faq");
  const entry = page.locator("#marking");
  await expect(entry.getByRole("heading", { name: "What if a team's answer is right but spelt wrong?" })).toBeVisible();
  await expect(entry).toContainText("Answers are marked automatically against the answer key");
  await expect(entry).toContainText("so “Canbera” is marked wrong");
  await expect(entry).toContainText("you can override any mark; the scores follow");
  await expect(entry).toContainText("You are the quizmaster; the software is not.");
  await expect(entry).not.toContainText("Mark it yourself");
});
