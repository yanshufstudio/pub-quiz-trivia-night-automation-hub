import { test, expect, type Page } from "@playwright/test";

/**
 * The public holiday trivia page (/quizzes/holiday-trivia): the checks
 * e2e/quiz-thanksgiving.spec.ts makes, with every question, answer and CTA
 * line word for word against marketing's copy of 7 Nov 2026.
 *
 * Every test here is signed out. The strings below are typed out on purpose:
 * a test that read them back from the page's own data could not notice them
 * changing.
 */

const SITE = "https://triviafoundry.com";
const PATH = "/quizzes/holiday-trivia";

const TITLE = "Holiday trivia questions and answers for a mixed holiday party";
const DESCRIPTION =
  "Holiday trivia questions and answers for a mixed crowd: festivals of light, then food and customs from Hanukkah to Lunar New Year. Free to use.";
const HEADING = "Holiday trivia questions and answers";
const INTRO =
  "Two rounds of ten for a holiday party where people celebrate different festivals: one on festivals of light around the world, one on holiday food and customs. Answers are under each round. They're free to use as they are, to print, or to mix with your own.";
const CTA_HEADING = "Want a holiday round built for your crowd?";
const CTA_PARAGRAPHS = [
  "Tell TriviaFoundry who's playing and what they like, and it writes the rounds in minutes: one on every festival your team celebrates, an easy round for the kids, or a harder one for the regulars. You get the full pack, a presenter script and answer sheets to print. On the night, teams answer on their phones (no app to download), tables that prefer paper play in the same game, and you run it round by round with the scores up on the TV.",
  "AI can slip on a fact. Every question is yours to edit, so give the pack a read before the night.",
  "A free account gets 2 packs every 30 days, no card needed.",
];
const BUTTON = "Make your own trivia night";
const HERO_ALT = "A lit Hanukkah menorah, glowing diya lamps and a red paper lantern under a string of lights, with the words Holiday trivia.";
const SHEETS_ALT =
  "Three printed sheets from a TriviaFoundry pack: the presenter script, the host answer key and a team answer sheet.";
const ROUND_HEADINGS = ["Round 1: Festivals of light around the world", "Round 2: Holiday food and customs"];
const QUESTIONS = [
  [
    "How many nights does Hanukkah last?",
    "What is the nine-branched candlestick lit during Hanukkah called?",
    "Hanukkah is also spelled Chanukah, Hanukah and several other ways. Why does it have so many English spellings?",
    "The name Diwali comes from the Sanskrit \"Deepavali\". What does it mean?",
    "Which Hindu goddess of wealth and good fortune is especially worshipped at Diwali?",
    "In Sweden, which saint's day on 13 December is celebrated with a girl wearing a crown of candles?",
    "How many candles does the kinara hold during Kwanzaa?",
    "Which prehistoric monument in England lines up with the sunset on the winter solstice?",
    "Lunar New Year celebrations end on the fifteenth day with which festival?",
    "At Hogmanay in Stonehaven, on the northeast coast of Scotland, people parade through the streets swinging balls of what?",
  ],
  [
    "What are the jam-filled doughnuts eaten in Israel at Hanukkah called?",
    "What is the four-sided spinning top played with at Hanukkah?",
    "What is the general name for the Indian sweets, such as laddoos and barfi, shared with family and friends at Diwali?",
    "At Lunar New Year, money is given to children in envelopes of which color?",
    "The name Kwanzaa comes from a phrase meaning \"first fruits\" in which language?",
    "In which decade was Kwanzaa first celebrated?",
    "In Scotland, what is the custom of being the first visitor through a home's door after midnight at New Year called?",
    "In Spain, how many grapes do people eat as the clock strikes midnight on New Year's Eve?",
    "Many Italian-American families eat a Christmas Eve feast of seven what?",
    "Which old midwinter festival gave its name to the log now often served as a chocolate cake at Christmas?",
  ],
];
const ANSWERS = [
  [
    "Eight",
    "A hanukkiah (a menorah or Hanukkah menorah also accepted)",
    "It's written from Hebrew, and its first letter (chet) is a throaty sound English has no letter for (any answer about spelling it from Hebrew accepted)",
    "A row of lamps (a row of lights also accepted)",
    "Lakshmi",
    "Saint Lucy's Day (Lucia also accepted)",
    "Seven",
    "Stonehenge",
    "The Lantern Festival",
    "Fire (fireballs)",
  ],
  [
    "Sufganiyot",
    "A dreidel (sevivon also accepted)",
    "Mithai",
    "Red",
    "Swahili",
    "The 1960s (1966)",
    "First-footing (the first-foot also accepted)",
    "Twelve",
    "Fishes",
    "Yule",
  ],
];

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

test.describe("/quizzes/holiday-trivia, signed out", () => {
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
    expect(h.ogImage).toEqual([`${SITE}/quizzes/holiday-trivia.png`]);
    expect(h.ogImageWidth).toEqual(["1200"]);
    expect(h.ogImageHeight).toEqual(["630"]);
    expect(h.ogImageAlt).toEqual([HERO_ALT]);
    expect(h.twitterImage).toEqual([`${SITE}/quizzes/holiday-trivia.png`]);
    expect(h.twitterImageAlt).toEqual([HERO_ALT]);
  });

  test("the share picture is the real 1200x630 file", async ({ request }) => {
    // Retried for the dev server's cold-route ECONNRESET (see quiz-bonfire-night.spec.ts); the assertions are not loosened.
    await expect(async () => {
      const res = await request.get("/quizzes/holiday-trivia.png");
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

    for (const [index, round] of [1, 2].entries()) {
      await expect(page.getByRole("list", { name: `Round ${round} questions` }).getByRole("listitem")).toHaveText(
        QUESTIONS[index],
      );
      await expect(page.getByRole("list", { name: `Round ${round} answers` }).getByRole("listitem")).toHaveText(
        ANSWERS[index],
      );
    }
  });

  test("the button goes to /create, and the page has its two pictures with their alt text", async ({ page }) => {
    await page.goto(PATH);
    const cta = page.getByRole("region", { name: CTA_HEADING });
    await expect(cta).toBeVisible();
    await expect(cta.locator("p")).toHaveText(CTA_PARAGRAPHS);
    await expect(cta.getByRole("link", { name: BUTTON })).toHaveAttribute("href", "/create");

    await expect(page.getByRole("img", { name: HERO_ALT })).toBeVisible();
    await expect(cta.getByRole("img", { name: SHEETS_ALT })).toBeVisible();
    // Both images actually loaded, not just laid out.
    for (const img of await page.locator("main img").all()) {
      expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    }
  });

  test("has no em or en dash anywhere a reader or a crawler can see", async ({ page }) => {
    await page.goto(PATH);
    const seen = await page.evaluate(() => [
      document.title,
      document.body.innerText,
      ...Array.from(document.querySelectorAll("img")).map((img) => img.alt),
      ...Array.from(document.head.querySelectorAll<HTMLMetaElement>("meta[content]")).map((m) => m.content),
    ]);
    expect(seen.join("\n").length).toBeGreaterThan(1000);
    expect(seen.join("\n")).not.toContain(String.fromCharCode(0x2014));
    expect(seen.join("\n")).not.toContain(String.fromCharCode(0x2013));
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

/** The animations running (or waiting to start) anywhere inside the top picture, by name. */
async function sceneAnimations(page: Page) {
  // By class, not role: printed, the picture is hidden and has no role to find.
  return page
    .locator(".quiz-scene-holiday-trivia")
    .evaluate((el) =>
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.playState === "running")
        .map((a) => (a as CSSAnimation).animationName)
        .sort(),
    );
}

/** How the lantern hangs: its computed transform. */
async function lanternTransform(page: Page) {
  return page.locator(".quiz-scene-holiday-trivia .swing").evaluate((el) => getComputedStyle(el).transform);
}

test.describe("/quizzes/holiday-trivia, the moving picture", () => {
  test("is an inline 1200x630 scene that moves: lights, flames, the lantern and letters", async ({ page }) => {
    await page.goto(PATH);
    const hero = page.getByRole("img", { name: HERO_ALT });
    await expect(hero).toBeVisible();
    // Drawn inline: a still layer and a moving layer, no picture file.
    await expect(hero.locator("svg")).toHaveCount(2);
    await expect(hero.locator("img")).toHaveCount(0);

    const box = (await hero.boundingBox())!;
    expect(Math.abs(box.height - (box.width * 630) / 1200)).toBeLessThanOrEqual(1);
    expect(await hero.evaluate((el) => getComputedStyle(el).aspectRatio)).toBe("1200 / 630");

    // 16 bulbs on the string across the top, nine menorah flames and the
    // three diyas', the lantern, and 6 letters.
    const names = await sceneAnimations(page);
    const count = (name: string) => names.filter((n) => n === name).length;
    expect(count("hd-twinkle")).toBe(16);
    expect(count("hd-flicker")).toBe(12);
    expect(count("hd-swing")).toBe(1);
    expect(count("hd-hop")).toBe(6);
    const before = await lanternTransform(page);
    await expect.poll(() => lanternTransform(page)).not.toBe(before);
  });

  test("the menorah has nine candles, all lit, with the shamash set apart", async ({ page }) => {
    await page.goto(PATH);
    const scene = page.locator(".quiz-scene-holiday-trivia");
    await expect(scene.locator(".candle")).toHaveCount(9);
    await expect(scene.locator(".menorah-flame")).toHaveCount(9);
    // The shamash stands higher than the eight in the row, which are level.
    const tops = await scene.locator(".candle").evaluateAll((els) =>
      els.map((el) => Math.round((el as SVGGraphicsElement).getBBox().y)),
    );
    const shamash = Math.min(...tops);
    expect(tops.filter((y) => y === shamash)).toHaveLength(1);
    expect(new Set(tops.filter((y) => y !== shamash)).size).toBe(1);
  });

  test("with reduced motion, nothing moves and the still frame shows", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(PATH);
    await expect(page.getByRole("img", { name: HERO_ALT })).toBeVisible();
    expect(await sceneAnimations(page)).toEqual([]);
    expect(await lanternTransform(page)).toBe("none");
  });

  test("nothing moves when printed", async ({ page }) => {
    await page.goto(PATH);
    await page.emulateMedia({ media: "print" });
    expect(await sceneAnimations(page)).toEqual([]);
    expect(await lanternTransform(page)).toBe("none");
  });
});

test.describe("/quizzes/holiday-trivia, printed", () => {
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
    await expect(page.getByRole("link", { name: BUTTON })).toBeHidden();
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
    for (const absent of [BUTTON, "Print these rounds", "How it works", "Yanshuf Studio", "Two rounds of ten"]) {
      expect(printed).not.toContain(absent);
    }
  });
});
