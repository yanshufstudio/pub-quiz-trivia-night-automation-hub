import { test, expect, type Page } from "@playwright/test";

/**
 * The public Chanukah quiz page (/quizzes/chanukah): the checks
 * e2e/quiz-christmas.spec.ts makes, with every question, answer and CTA
 * line word for word against marketing's copy of 17 Nov 2026.
 *
 * Every test here is signed out. The strings below are typed out on purpose:
 * a test that read them back from the page's own data could not notice them
 * changing.
 */

const SITE = "https://triviafoundry.com";
const PATH = "/quizzes/chanukah";

const TITLE = "Chanukah trivia questions and answers: 20 free for your party";
const DESCRIPTION =
  "Two Chanukah trivia rounds with answers: the story of the Maccabees, then latkes, dreidels and gelt. Free to use, or make your own trivia night.";
const HEADING = "Chanukah trivia questions and answers";
const INTRO =
  "Two rounds of ten for a Chanukah trivia night (you may know it as Hanukkah): one on the history behind the festival, one on its food, games and customs. Answers are under each round. They're free to use as they are, to print, or to mix with your own.";
const CTA_HEADING = "Want a Chanukah round built for your crowd?";
const CTA_PARAGRAPHS = [
  "Tell TriviaFoundry who's playing and what they like, and it writes the rounds in minutes: an easy round for the kids after candle lighting, or a harder one for the office party. You get the full pack, a presenter script and answer sheets to print. On the night, teams answer on their phones (no app to download), tables that prefer paper play in the same game, and you run it round by round with the scores up on the TV.",
  "AI can slip on a fact. Every question is yours to edit, so give the pack a read before the night.",
  "A free account gets 2 packs every 30 days, no card needed.",
];
const BUTTON = "Make your own trivia night";
const HERO_ALT =
  "A lit nine-branched Chanukah menorah next to a dreidel, chocolate coins and a plate of doughnuts, with the words Chanukah trivia.";
const SHEETS_ALT =
  "Three printed sheets from a TriviaFoundry pack: the presenter script, the host answer key and a team answer sheet.";
const ROUND_HEADINGS = ["Round 1: The story of Chanukah", "Round 2: Food, games and customs"];
const QUESTIONS = [
  [
    "Chanukah marks the rededication of the Temple in which city?",
    "What does the Hebrew word \"Chanukah\" mean?",
    "The Maccabees revolted against which Seleucid king, who had banned Jewish practice?",
    "Who led the revolt after his father, the priest Mattathias, died?",
    "The family of the Maccabees went on to found which ruling dynasty?",
    "According to the Talmud, the one jar of pure oil found in the Temple should have lasted how long?",
    "Chanukah begins on the 25th day of which Hebrew month?",
    "The story of the revolt is told in which books, which are not part of the Hebrew Bible?",
    "What is the name of the extra candle on the menorah that is used to light the others?",
    "Counting the helper candle every night, how many candles do you need for all eight nights?",
  ],
  [
    "What are the fried potato pancakes eaten at Chanukah called?",
    "Why is it a custom to eat food fried in oil at Chanukah?",
    "The four letters on a dreidel stand for the Hebrew words \"Nes gadol haya sham\". What does that mean?",
    "On dreidels made in Israel, one letter is different because the miracle happened \"here\". Which letter replaces shin?",
    "In the dreidel game, what do you win if it lands on gimel?",
    "What is the Yiddish word for the money, often chocolate coins today, given to children at Chanukah?",
    "Why is the menorah traditionally placed in a window or by the front door?",
    "Each night, which candle is lit first?",
    "Some families eat cheese and dairy foods at Chanukah in memory of which heroine?",
    "Which comedian first sang \"The Chanukah Song\", listing famous Jewish people, on \"Saturday Night Live\" in 1994?",
  ],
];
const ANSWERS = [
  [
    "Jerusalem",
    "Dedication (of the Temple in Jerusalem)",
    "Antiochus IV (Antiochus Epiphanes; Antiochus also accepted)",
    "Judah Maccabee (Judah the Maccabee, Judas Maccabeus)",
    "The Hasmoneans",
    "One day (it lasted eight)",
    "Kislev",
    "The Books of Maccabees (1 and 2 Maccabees)",
    "The shamash (shammes also accepted)",
    "44 (36 Chanukah candles plus 8 for the shamash)",
  ],
  [
    "Latkes (levivot also accepted)",
    "To remember the miracle of the oil",
    "A great miracle happened there",
    "Pe (or peh), for \"po\", meaning here",
    "The whole pot",
    "Gelt (Chanukah gelt)",
    "To make the miracle known to people passing by (any answer about showing or publicizing the miracle accepted)",
    "The newest one, added that night (the one furthest left also accepted)",
    "Judith",
    "Adam Sandler",
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

test.describe("/quizzes/chanukah, signed out", () => {
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
    expect(h.ogImage).toEqual([`${SITE}/quizzes/chanukah.png`]);
    expect(h.ogImageWidth).toEqual(["1200"]);
    expect(h.ogImageHeight).toEqual(["630"]);
    expect(h.ogImageAlt).toEqual([HERO_ALT]);
    expect(h.twitterImage).toEqual([`${SITE}/quizzes/chanukah.png`]);
    expect(h.twitterImageAlt).toEqual([HERO_ALT]);
  });

  test("the share picture is the real 1200x630 file", async ({ request }) => {
    // Retried for the dev server's cold-route ECONNRESET (see quiz-bonfire-night.spec.ts); the assertions are not loosened.
    await expect(async () => {
      const res = await request.get("/quizzes/chanukah.png");
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
    .locator(".quiz-scene-chanukah")
    .evaluate((el) =>
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.playState === "running")
        .map((a) => (a as CSSAnimation).animationName)
        .sort(),
    );
}

/** How the dreidel is tipped: its computed transform. */
async function dreidelTransform(page: Page) {
  return page.locator(".quiz-scene-chanukah .spin").evaluate((el) => getComputedStyle(el).transform);
}

test.describe("/quizzes/chanukah, the moving picture", () => {
  test("is an inline 1200x630 scene that moves: flames, the dreidel and letters", async ({ page }) => {
    await page.goto(PATH);
    const hero = page.getByRole("img", { name: HERO_ALT });
    await expect(hero).toBeVisible();
    // Drawn inline: a still layer and a moving layer, no picture file.
    await expect(hero.locator("svg")).toHaveCount(2);
    await expect(hero.locator("img")).toHaveCount(0);

    const box = (await hero.boundingBox())!;
    expect(Math.abs(box.height - (box.width * 630) / 1200)).toBeLessThanOrEqual(1);
    expect(await hero.evaluate((el) => getComputedStyle(el).aspectRatio)).toBe("1200 / 630");

    // 9 flames, the dreidel rocking, its 4 letters taking turns on the face we
    // see and the face narrowing between them, and 6 letters.
    const names = await sceneAnimations(page);
    const count = (name: string) => names.filter((n) => n === name).length;
    expect(count("ch-flicker")).toBe(9);
    expect(count("ch-spin")).toBe(1);
    expect(count("ch-face")).toBe(4);
    expect(count("ch-turn")).toBe(1);
    expect(count("ch-hop")).toBe(6);
    const before = await dreidelTransform(page);
    await expect.poll(() => dreidelTransform(page)).not.toBe(before);
  });

  test("with reduced motion, nothing moves and the still frame shows", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(PATH);
    await expect(page.getByRole("img", { name: HERO_ALT })).toBeVisible();
    expect(await sceneAnimations(page)).toEqual([]);
    expect(await dreidelTransform(page)).toBe("none");
  });

  test("nothing moves when printed", async ({ page }) => {
    await page.goto(PATH);
    await page.emulateMedia({ media: "print" });
    expect(await sceneAnimations(page)).toEqual([]);
    expect(await dreidelTransform(page)).toBe("none");
  });
});

test.describe("/quizzes/chanukah, printed", () => {
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
