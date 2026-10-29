import { test, expect, type Page } from "@playwright/test";

/**
 * The public Thanksgiving quiz page (/quizzes/thanksgiving): the checks
 * e2e/quiz-bonfire-night.spec.ts makes, plus every question, answer and CTA
 * line word for word against the copy Paul approved on 29 Oct.
 *
 * Every test here is signed out. The strings below are typed out on purpose:
 * a test that read them back from the page's own data could not notice them
 * changing.
 */

const SITE = "https://triviafoundry.com";
const PATH = "/quizzes/thanksgiving";

const TITLE = "Thanksgiving trivia questions and answers: 20 free questions for your trivia night";
const DESCRIPTION =
  "Two Thanksgiving trivia rounds with answers: history and traditions, then food, football and the parade. Free to use. Or make your own trivia night in minutes.";
const HEADING = "Thanksgiving trivia questions and answers";
const INTRO =
  "Two rounds of ten for a Thanksgiving trivia night: one on the history and traditions, one on food, football and the parade. Answers are under each round. They're free to use as they are, to print, or to mix with your own.";
const CTA_HEADING = "Want a Thanksgiving round built for your crowd?";
const CTA_PARAGRAPHS = [
  "Tell TriviaFoundry who's playing and what they like, and it writes the rounds in minutes: football for the family room, an easy round for the kids, or harder history for your regulars. You get the full pack, a presenter script and answer sheets to print. On the night, teams answer on their phones (no app to download), tables that prefer paper play in the same game, and you run it round by round with the scores up on the TV.",
  "AI can slip on a fact. Every question is yours to edit, so give the pack a read before the night.",
  "A free account gets 2 packs every 30 days, no card needed.",
];
const BUTTON = "Make your own trivia night";
const HERO_ALT = "A pumpkin pie and autumn leaves on a dark green background, with the words Thanksgiving trivia.";
const SHEETS_ALT =
  "Three printed sheets from a TriviaFoundry pack: the presenter script, the host answer key and a team answer sheet.";
const ROUND_HEADINGS = ["Round 1: History and traditions", "Round 2: Food, football and the parade"];
const QUESTIONS = [
  [
    "In which year did the Plymouth colonists and the Wampanoag share the harvest feast often called the \"first Thanksgiving\"?",
    "What was the name of the ship that carried the Pilgrims to America in 1620?",
    "Which Wampanoag leader came to the 1621 harvest feast with about ninety of his men?",
    "According to an account written by one of the colonists in 1621, how many deer did the Wampanoag hunt and bring to the feast?",
    "Which editor of Godey's Lady's Book campaigned for years to make Thanksgiving a national holiday?",
    "Which president proclaimed a national day of Thanksgiving in 1863, during the Civil War?",
    "In 1939 a president moved Thanksgiving a week earlier to lengthen the holiday shopping season, a change nicknamed \"Franksgiving\". Who was he?",
    "On which Thursday of November does the United States celebrate Thanksgiving?",
    "Canada celebrates its Thanksgiving on which Monday of October?",
    "In which year did Macy's hold its first Thanksgiving Day parade in New York City?",
  ],
  [
    "Which tart red berry, grown in bogs, goes into the sauce on most Thanksgiving tables?",
    "What is the name of the forked bone that two people pull apart after the turkey dinner, the bigger piece earning a wish?",
    "Green bean casserole was created in 1955 in the test kitchen of which soup company?",
    "Which NFL team has played at home on Thanksgiving Day every year since 1934, apart from a break from 1939 to 1944?",
    "Which NFL team has hosted a Thanksgiving Day game every year since 1966, with just two exceptions?",
    "In 1927 the Macy's parade replaced its live zoo animals with what?",
    "What is the name for the White House custom of sparing a turkey from the dinner table each November?",
    "Which beagle appears in the 1973 TV special \"A Charlie Brown Thanksgiving\"?",
    "What name is given to the big shopping day that follows Thanksgiving?",
    "Which Arlo Guthrie song, more than 18 minutes long, is played on many radio stations every Thanksgiving?",
  ],
];
const ANSWERS = [
  [
    "1621",
    "The Mayflower",
    "Massasoit (Ousamequin also accepted)",
    "Five",
    "Sarah Josepha Hale",
    "Abraham Lincoln",
    "Franklin D. Roosevelt",
    "The fourth Thursday",
    "The second Monday",
    "1924 (accept anything from 1920 to 1929)",
  ],
  [
    "The cranberry",
    "The wishbone",
    "Campbell's",
    "The Detroit Lions",
    "The Dallas Cowboys",
    "Giant balloons",
    "The turkey pardon (pardoning the turkey also accepted)",
    "Snoopy",
    "Black Friday",
    "\"Alice's Restaurant\" (\"Alice's Restaurant Massacree\" also accepted)",
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

test.describe("/quizzes/thanksgiving, signed out", () => {
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
    expect(h.ogImage).toEqual([`${SITE}/quizzes/thanksgiving.png`]);
    expect(h.ogImageWidth).toEqual(["1200"]);
    expect(h.ogImageHeight).toEqual(["630"]);
    expect(h.ogImageAlt).toEqual([HERO_ALT]);
    expect(h.twitterImage).toEqual([`${SITE}/quizzes/thanksgiving.png`]);
    expect(h.twitterImageAlt).toEqual([HERO_ALT]);
  });

  test("the share picture is the real 1200x630 file", async ({ request }) => {
    // Retried for the dev server's cold-route ECONNRESET (see quiz-bonfire-night.spec.ts); the assertions are not loosened.
    await expect(async () => {
      const res = await request.get("/quizzes/thanksgiving.png");
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

test.describe("/quizzes/thanksgiving, printed", () => {
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
