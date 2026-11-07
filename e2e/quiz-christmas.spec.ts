import { test, expect, type Page } from "@playwright/test";

/**
 * The public Christmas quiz page (/quizzes/christmas): the checks
 * e2e/quiz-thanksgiving.spec.ts makes, with every question, answer and CTA
 * line word for word against marketing's copy of 7 Nov 2026.
 *
 * Every test here is signed out. The strings below are typed out on purpose:
 * a test that read them back from the page's own data could not notice them
 * changing.
 */

const SITE = "https://triviafoundry.com";
const PATH = "/quizzes/christmas";

const TITLE = "Christmas trivia questions and answers: 20 free for your party";
const DESCRIPTION =
  "Two Christmas trivia rounds with answers: traditions around the world, then films, songs and food. Free to use, or make your own trivia night.";
const HEADING = "Christmas trivia questions and answers";
const INTRO =
  "Two rounds of ten for a Christmas trivia night: one on traditions around the world, one on Christmas films, songs and food. Answers are under each round. They're free to use as they are, to print, or to mix with your own.";
const CTA_HEADING = "Want a Christmas round built for your crowd?";
const CTA_PARAGRAPHS = [
  "Tell TriviaFoundry who's playing and what they like, and it writes the rounds in minutes: Christmas films for the family, an easy round for the kids, or a harder one for the office party. You get the full pack, a presenter script and answer sheets to print. On the night, teams answer on their phones (no app to download), tables that prefer paper play in the same game, and you run it round by round with the scores up on the TV.",
  "AI can slip on a fact. Every question is yours to edit, so give the pack a read before the night.",
  "A free account gets 2 packs every 30 days, no card needed.",
];
const BUTTON = "Make your own trivia night";
const HERO_ALT = "A lit Christmas tree, wrapped presents and a string of colored lights, with the words Christmas trivia.";
const SHEETS_ALT =
  "Three printed sheets from a TriviaFoundry pack: the presenter script, the host answer key and a team answer sheet.";
const ROUND_HEADINGS = ["Round 1: Traditions around the world", "Round 2: Films, songs and food"];
const QUESTIONS = [
  [
    "In the Netherlands, Sinterklaas arrives each November on what kind of boat?",
    "Which fast-food chain's fried chicken became a Japanese Christmas dinner tradition after an ad campaign in 1974?",
    "In Icelandic folklore, how many Yule Lads visit children in the nights before Christmas?",
    "What is the name of the horned creature who punishes naughty children in Alpine Christmas folklore?",
    "In Mexico, what are the nine nights of processions before Christmas, re-enacting Mary and Joseph's search for shelter, called?",
    "In Italian folklore, which kind old witch brings presents to children on the night before Epiphany, 6 January?",
    "In Catalonia, children \"feed\" a smiling wooden log, then beat it with sticks on Christmas Eve until it gives them sweets. What is the log called?",
    "Which city sends a Christmas tree to London's Trafalgar Square every year as a thank-you for Britain's help in the Second World War?",
    "Many Orthodox churches, for example in Russia and Ethiopia, celebrate Christmas on which date of the Western calendar?",
    "In the Gospel of Matthew, what three gifts do the Magi bring?",
  ],
  [
    "In \"Home Alone\" (1990), the McCallister family's house is near which US city?",
    "In \"It's a Wonderful Life\", what happens every time a bell rings?",
    "The song \"White Christmas\" was first heard in which 1942 film?",
    "Who released \"All I Want for Christmas Is You\" in 1994?",
    "Which band had a UK number one in 1973 with \"Merry Xmas Everybody\"?",
    "In \"The Twelve Days of Christmas\", what does my true love give to me on the fifth day?",
    "Rudolph the Red-Nosed Reindeer first appeared in 1939 in a booklet given away by which US department store chain?",
    "In the film \"Elf\" (2003), what are the four main food groups of an elf?",
    "What is the name of the tall, domed sweet bread from Milan eaten across Italy at Christmas?",
    "In Britain, what is traditionally stirred into the Christmas pudding to bring luck to whoever finds it?",
  ],
];
const ANSWERS = [
  [
    "A steamboat",
    "KFC (Kentucky Fried Chicken)",
    "13",
    "Krampus",
    "Las Posadas",
    "La Befana",
    "Caga Tio (Tio de Nadal also accepted)",
    "Oslo",
    "7 January",
    "Gold, frankincense and myrrh",
  ],
  [
    "Chicago (Winnetka also accepted)",
    "An angel gets his wings",
    "Holiday Inn",
    "Mariah Carey",
    "Slade",
    "Five gold rings",
    "Montgomery Ward",
    "Candy, candy canes, candy corn and syrup",
    "Panettone",
    "A silver coin (a sixpence also accepted)",
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

test.describe("/quizzes/christmas, signed out", () => {
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
    expect(h.ogImage).toEqual([`${SITE}/quizzes/christmas.png`]);
    expect(h.ogImageWidth).toEqual(["1200"]);
    expect(h.ogImageHeight).toEqual(["630"]);
    expect(h.ogImageAlt).toEqual([HERO_ALT]);
    expect(h.twitterImage).toEqual([`${SITE}/quizzes/christmas.png`]);
    expect(h.twitterImageAlt).toEqual([HERO_ALT]);
  });

  test("the share picture is the real 1200x630 file", async ({ request }) => {
    // Retried for the dev server's cold-route ECONNRESET (see quiz-bonfire-night.spec.ts); the assertions are not loosened.
    await expect(async () => {
      const res = await request.get("/quizzes/christmas.png");
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
    .locator(".quiz-scene-christmas")
    .evaluate((el) =>
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.playState === "running")
        .map((a) => (a as CSSAnimation).animationName)
        .sort(),
    );
}

/** Where the first snowflake is: its computed transform. */
async function snowTransform(page: Page) {
  return page.locator(".quiz-scene-christmas .fall").first().evaluate((el) => getComputedStyle(el).transform);
}

test.describe("/quizzes/christmas, the moving picture", () => {
  test("is an inline 1200x630 scene that moves: lights, the star, snow and letters", async ({ page }) => {
    await page.goto(PATH);
    const hero = page.getByRole("img", { name: HERO_ALT });
    await expect(hero).toBeVisible();
    // Drawn inline: a still layer and a moving layer, no picture file.
    await expect(hero.locator("svg")).toHaveCount(2);
    await expect(hero.locator("img")).toHaveCount(0);

    const box = (await hero.boundingBox())!;
    expect(Math.abs(box.height - (box.width * 630) / 1200)).toBeLessThanOrEqual(1);
    expect(await hero.evaluate((el) => getComputedStyle(el).aspectRatio)).toBe("1200 / 630");

    // 12 bulbs on the string under "Christmas" and 14 lights on the tree, the
    // star, 9 snowflakes and 6 letters.
    const names = await sceneAnimations(page);
    const count = (name: string) => names.filter((n) => n === name).length;
    expect(count("xm-twinkle")).toBe(26);
    expect(count("xm-star")).toBe(1);
    expect(count("xm-fall")).toBe(9);
    expect(count("xm-hop")).toBe(6);
    const before = await snowTransform(page);
    await expect.poll(() => snowTransform(page)).not.toBe(before);
  });

  test("with reduced motion, nothing moves and the still frame shows", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(PATH);
    await expect(page.getByRole("img", { name: HERO_ALT })).toBeVisible();
    expect(await sceneAnimations(page)).toEqual([]);
    expect(await snowTransform(page)).toBe("none");
  });

  test("nothing moves when printed", async ({ page }) => {
    await page.goto(PATH);
    await page.emulateMedia({ media: "print" });
    expect(await sceneAnimations(page)).toEqual([]);
    expect(await snowTransform(page)).toBe("none");
  });
});

test.describe("/quizzes/christmas, printed", () => {
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
