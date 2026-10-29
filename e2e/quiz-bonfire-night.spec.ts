import { test, expect, type Page } from "@playwright/test";

/**
 * The public Bonfire Night quiz page (/quizzes/bonfire-night): the same checks
 * e2e/quiz-page.spec.ts makes for Halloween, against the second page served by
 * src/app/quizzes/[slug].
 *
 * Every test here is signed out: a fresh Playwright context carries no
 * cookies, and the page is meant to be read by someone who has never signed up.
 * The strings below are the ones the brief fixed (the title, the description,
 * the alt text, the round headings), typed out here on purpose: a test that
 * read them back from the page's own data could not notice them changing.
 */

const SITE = "https://triviafoundry.com";
const PATH = "/quizzes/bonfire-night";

const TITLE = "Bonfire Night quiz questions and answers: 20 free questions for your quiz night";
const DESCRIPTION =
  "Two ready-made Bonfire Night quiz rounds with answers: the Gunpowder Plot, then bonfires, fireworks and food. Free to use. Or make your own quiz in minutes.";
const HEADING = "Bonfire Night quiz questions and answers";
const INTRO =
  "Two rounds of ten for a Bonfire Night quiz: one on the Gunpowder Plot, one on bonfires, fireworks and food. Answers are under each round. Use them as they are, print them, or swap in your own.";
const CTA_HEADING = "Want a Bonfire Night round built for your crowd?";
const HERO_ALT = "A bonfire with fireworks bursting above it on a dark green background, with the words Bonfire Night quiz.";
const SHEETS_ALT =
  "Three printed sheets from a TriviaFoundry pack: the presenter script, the host answer key and a team answer sheet.";
const ROUND_HEADINGS = ["Round 1: Remember, remember: the Gunpowder Plot", "Round 2: Bonfires, fireworks and food"];

async function head(page: Page) {
  return page.evaluate(() => {
    const meta = (sel: string) =>
      Array.from(document.head.querySelectorAll<HTMLMetaElement>(sel)).map((m) => m.content);
    const links = (rel: string) =>
      Array.from(document.head.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`)).map((l) =>
        l.getAttribute("href"),
      );
    return {
      title: document.title,
      description: meta('meta[name="description"]'),
      ogTitle: meta('meta[property="og:title"]'),
      ogDescription: meta('meta[property="og:description"]'),
      ogUrl: meta('meta[property="og:url"]'),
      ogImage: meta('meta[property="og:image"]'),
      ogImageWidth: meta('meta[property="og:image:width"]'),
      ogImageHeight: meta('meta[property="og:image:height"]'),
      ogImageAlt: meta('meta[property="og:image:alt"]'),
      twitterImage: meta('meta[name="twitter:image"]'),
      twitterImageAlt: meta('meta[name="twitter:image:alt"]'),
      canonical: links("canonical"),
    };
  });
}

test.describe("/quizzes/bonfire-night, signed out", () => {
  test("is served to a stranger, with its own title, description and share picture", async ({ page }) => {
    const res = await page.goto(PATH);
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`${PATH}$`));

    const h = await head(page);
    expect(h.title).toBe(TITLE);
    expect(h.description).toEqual([DESCRIPTION]);
    expect(h.canonical).toEqual([`${SITE}${PATH}`]);
    expect(h.ogUrl).toEqual([`${SITE}${PATH}`]);
    expect(h.ogTitle).toEqual([TITLE]);
    expect(h.ogDescription).toEqual([DESCRIPTION]);

    // The page's own picture, not the site card, in both previews.
    expect(h.ogImage).toEqual([`${SITE}/quizzes/bonfire-night.png`]);
    expect(h.ogImageWidth).toEqual(["1200"]);
    expect(h.ogImageHeight).toEqual(["630"]);
    expect(h.ogImageAlt).toEqual([HERO_ALT]);
    expect(h.twitterImage).toEqual([`${SITE}/quizzes/bonfire-night.png`]);
    expect(h.twitterImageAlt).toEqual([HERO_ALT]);
  });

  test("the share picture is the real 1200x630 file", async ({ request }) => {
    // This spec is the first in the suite to open /quizzes/[slug], so this is
    // the first request after the dev server compiled that route. On CI it
    // twice came back with `read ECONNRESET` (run 39118188789, attempts 1 and
    // 4) while the page test before it and every test after it passed. The
    // request is retried until the answer is right; the assertions are not
    // loosened, so a wrong status, type or size still fails.
    await expect(async () => {
      const res = await request.get("/quizzes/bonfire-night.png");
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toBe("image/png");
      const png = await res.body();
      expect(png.readUInt32BE(16)).toBe(1200);
      expect(png.readUInt32BE(20)).toBe(630);
    }).toPass({ timeout: 15_000 });
  });

  test("shows the heading, two rounds, 20 questions and 20 answers", async ({ page }) => {
    await page.goto(PATH);

    await expect(page.getByRole("heading", { level: 1, name: HEADING })).toBeVisible();
    await expect(page.getByText(INTRO)).toBeVisible();
    for (const heading of ROUND_HEADINGS) {
      await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
    }

    for (const round of [1, 2]) {
      const questions = page.getByRole("list", { name: `Round ${round} questions` }).getByRole("listitem");
      const answers = page.getByRole("list", { name: `Round ${round} answers` }).getByRole("listitem");
      await expect(questions).toHaveCount(10);
      await expect(answers).toHaveCount(10);
    }
    const allQuestions = page.getByRole("list", { name: /^Round \d questions$/ }).getByRole("listitem");
    const allAnswers = page.getByRole("list", { name: /^Round \d answers$/ }).getByRole("listitem");
    await expect(allQuestions).toHaveCount(20);
    await expect(allAnswers).toHaveCount(20);
    for (const item of [...(await allQuestions.all()), ...(await allAnswers.all())]) {
      await expect(item).toBeVisible();
    }

    // The two ends of each list, so the numbering and the order are the page's.
    await expect(allQuestions.first()).toHaveText("In which year was the Gunpowder Plot foiled?");
    await expect(allAnswers.first()).toHaveText("1605");
    await expect(allQuestions.last()).toHaveText(
      "The Guy Fawkes mask became a protest symbol after which graphic novel by Alan Moore and David Lloyd, filmed in 2006?",
    );
    await expect(allAnswers.last()).toHaveText("\"V for Vendetta\"");
  });

  test("the button goes to /create, and the page has its two pictures with their alt text", async ({ page }) => {
    await page.goto(PATH);
    const cta = page.getByRole("region", { name: CTA_HEADING });
    await expect(cta).toBeVisible();
    await expect(cta.getByRole("link", { name: "Make your own quiz" })).toHaveAttribute("href", "/create");

    await expect(page.getByRole("img", { name: HERO_ALT })).toBeVisible();
    await expect(cta.getByRole("img", { name: SHEETS_ALT })).toBeVisible();
    // Both images actually loaded, not just laid out.
    for (const img of await page.locator("main img").all()) {
      expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    }
  });

  test("has no em dash anywhere a reader or a crawler can see", async ({ page }) => {
    await page.goto(PATH);
    const seen = await page.evaluate(() => [
      document.title,
      document.body.innerText,
      ...Array.from(document.querySelectorAll("img")).map((img) => img.alt),
      ...Array.from(document.head.querySelectorAll<HTMLMetaElement>("meta[content]")).map((m) => m.content),
    ]);
    expect(seen.join("\n").length).toBeGreaterThan(1000);
    expect(seen.join("\n")).not.toContain(String.fromCharCode(0x2014));
  });

  test("the Print button opens the print dialog", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { printCalls: number }).printCalls = 0;
      window.print = () => {
        (window as unknown as { printCalls: number }).printCalls += 1;
      };
    });
    await page.goto(PATH);
    // Above Round 1, not in the call to action.
    const button = page.getByRole("button", { name: "Print these rounds" });
    const firstRound = page.getByRole("heading", { level: 2, name: ROUND_HEADINGS[0] });
    const buttonBox = (await button.boundingBox())!;
    const roundBox = (await firstRound.boundingBox())!;
    expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(roundBox.y);

    await button.click();
    expect(await page.evaluate(() => (window as unknown as { printCalls: number }).printCalls)).toBe(1);
  });

  for (const width of [320, 375, 430]) {
    test(`does not scroll sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(PATH, { waitUntil: "networkidle" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBe(0);
    });
  }
});

test.describe("/quizzes/bonfire-night, printed", () => {
  test("gives the heading, the rounds and the answers, and nothing else", async ({ page }) => {
    await page.goto(PATH);
    await page.emulateMedia({ media: "print" });

    // Everything that is not the quiz.
    await expect(page.getByRole("banner")).toBeHidden();
    await expect(page.getByRole("navigation")).toBeHidden();
    await expect(page.getByRole("contentinfo")).toBeHidden();
    await expect(page.getByRole("img", { name: HERO_ALT })).toBeHidden();
    await expect(page.getByRole("img", { name: SHEETS_ALT })).toBeHidden();
    await expect(page.getByText(INTRO)).toBeHidden();
    await expect(page.getByRole("heading", { name: CTA_HEADING })).toBeHidden();
    await expect(page.getByRole("link", { name: "Make your own quiz" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Print these rounds" })).toBeHidden();

    // The quiz.
    await expect(page.getByRole("heading", { level: 1, name: HEADING })).toBeVisible();
    for (const heading of ROUND_HEADINGS) {
      await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
    }
    const questions = page.getByRole("list", { name: /^Round \d questions$/ }).getByRole("listitem");
    const answers = page.getByRole("list", { name: /^Round \d answers$/ }).getByRole("listitem");
    await expect(questions).toHaveCount(20);
    await expect(answers).toHaveCount(20);
    for (const item of [...(await questions.all()), ...(await answers.all())]) {
      await expect(item).toBeVisible();
    }
  });

  test("keeps each question and answer whole across a page break", async ({ page }) => {
    await page.goto(PATH);
    await page.emulateMedia({ media: "print" });
    const breakInside = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("main li")].map((el) => getComputedStyle(el).breakInside),
    );
    expect(breakInside).toHaveLength(40);
    expect(breakInside.every((v) => v === "avoid")).toBe(true);
  });

  test("prints only the quiz's own text", async ({ page }) => {
    await page.goto(PATH);
    await page.emulateMedia({ media: "print" });
    // innerText leaves out anything display:none, so this is what the printer gets.
    const printed = await page.evaluate(() => document.body.innerText);
    const lines = printed.split("\n").map((l) => l.trim()).filter(Boolean);
    // H1, two round headings, two "Answers" labels, 20 questions, 20 answers.
    expect(lines).toHaveLength(1 + 2 + 2 + 20 + 20);
    for (const absent of ["Make your own quiz", "Print these rounds", "How it works", "Yanshuf Studio", "Two rounds of ten"]) {
      expect(printed).not.toContain(absent);
    }
  });
});
