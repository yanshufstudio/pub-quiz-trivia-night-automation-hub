import { test, expect, type Page } from "@playwright/test";
import { QUIZZES } from "@/content/quizzes";

/**
 * The public quizzes page (/quizzes), the footer link to it, and the route
 * that serves the quiz pages beneath it.
 *
 * Every test here is signed out: a fresh Playwright context carries no
 * cookies, and the page is meant to be found by someone who has never signed
 * up. The title, description, heading and intro are typed out here on purpose:
 * a test that read them back from the page's own copy could not notice them
 * changing. The quiz entries are checked both ways: the ones that exist today
 * by name, and the count against the list the page reads, so a new quiz page
 * has to show up here without anyone editing the hub.
 */

const SITE = "https://triviafoundry.com";
const PATH = "/quizzes";

const TITLE = "Free quiz questions and answers: ready-made rounds for your quiz night";
const DESCRIPTION =
  "Ready-made quiz rounds with answers for seasonal quiz nights. Free to use and to print. Or make your own quiz in minutes.";
const HEADING = "Free quiz questions and answers";
const INTRO = "Ready-made rounds for seasonal quiz nights, free to use and to print.";
const FOOTER_LABEL = "Free quiz questions";

/** In the order the page lists them. */
const ENTRIES = [
  {
    heading: "Halloween quiz questions and answers",
    href: "/quizzes/halloween",
    intro:
      "Two rounds of ten for a Halloween quiz night: one on where the traditions came from, one on horror films and books. Answers are under each round. Use them as they are, print them, or swap in your own.",
  },
  {
    heading: "Bonfire Night quiz questions and answers",
    href: "/quizzes/bonfire-night",
    intro:
      "Two rounds of ten for a Bonfire Night quiz: one on the Gunpowder Plot, one on bonfires, fireworks and food. Answers are under each round. Use them as they are, print them, or swap in your own.",
  },
  {
    heading: "Thanksgiving trivia questions and answers",
    href: "/quizzes/thanksgiving",
    intro:
      "Two rounds of ten for a Thanksgiving trivia night: one on the history and traditions, one on food, football and the parade. Answers are under each round. They're free to use as they are, to print, or to mix with your own.",
  },
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
      twitterImage: meta('meta[name="twitter:image"]'),
      canonical: links("canonical"),
    };
  });
}

test.describe("/quizzes, signed out", () => {
  test("is served to a stranger, with its own title and description and the site's share card", async ({ page }) => {
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
    // No picture of its own: it shares the site card.
    expect(h.ogImage).toEqual([`${SITE}/og.png`]);
    expect(h.twitterImage).toEqual([`${SITE}/og.png`]);
  });

  test("shows the heading and the intro, and has no pictures", async ({ page }) => {
    await page.goto(PATH);
    await expect(page.getByRole("heading", { level: 1, name: HEADING })).toBeVisible();
    await expect(page.getByText(INTRO)).toBeVisible();
    await expect(page.locator("main img")).toHaveCount(0);
  });

  test("has one entry per quiz, in list order: its heading as a link to its page, with its intro", async ({ page }) => {
    await page.goto(PATH);
    const entries = page.getByRole("main").getByRole("listitem");
    await expect(entries).toHaveCount(QUIZZES.length);
    await expect(entries).toHaveCount(ENTRIES.length);

    for (const [index, entry] of ENTRIES.entries()) {
      const item = entries.nth(index);
      await expect(item.getByRole("heading", { level: 2 })).toHaveText(entry.heading);
      await expect(item.getByRole("link", { name: entry.heading })).toHaveAttribute("href", entry.href);
      await expect(item.getByText(entry.intro)).toBeVisible();
    }
  });

  test("each entry's link opens that quiz page", async ({ page }) => {
    for (const entry of ENTRIES) {
      await page.goto(PATH);
      await page.getByRole("main").getByRole("link", { name: entry.heading }).click();
      await expect(page).toHaveURL(new RegExp(`${entry.href}$`));
      await expect(page.getByRole("heading", { level: 1, name: entry.heading })).toBeVisible();
    }
  });

  test("the intro is that one line and nothing more", async ({ page }) => {
    await page.goto(PATH);
    // The one paragraph directly under <main>; the entries' own intros are inside the list.
    await expect(page.locator("main > p")).toHaveText(INTRO);
  });

  // Same 48px floor as the footer and header targets (footer-targets.spec.ts).
  for (const width of [320, 375, 1280]) {
    test(`each entry's link is at least 48px tall at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(PATH, { waitUntil: "networkidle" });
      for (const entry of ENTRIES) {
        const link = page.getByRole("main").getByRole("link", { name: entry.heading });
        const box = (await link.boundingBox())!;
        expect(Math.round(box.height), `"${entry.heading}" link is ${box.height}px tall at ${width}px`).toBeGreaterThanOrEqual(48);
      }
    });
  }

  test("ends with the button to /create", async ({ page }) => {
    await page.goto(PATH);
    const button = page.getByRole("main").getByRole("link", { name: "Make your own quiz" });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("href", "/create");
    // Under the list, not above it.
    const buttonBox = (await button.boundingBox())!;
    const lastItemBox = (await page.getByRole("main").getByRole("listitem").last().boundingBox())!;
    expect(buttonBox.y).toBeGreaterThanOrEqual(lastItemBox.y + lastItemBox.height);
  });

  test("has no em dash anywhere a reader or a crawler can see", async ({ page }) => {
    await page.goto(PATH);
    const seen = await page.evaluate(() => [
      document.title,
      document.body.innerText,
      ...Array.from(document.querySelectorAll("img")).map((img) => img.alt),
      ...Array.from(document.head.querySelectorAll<HTMLMetaElement>("meta[content]")).map((m) => m.content),
    ]);
    expect(seen.join("\n").length).toBeGreaterThan(500);
    expect(seen.join("\n")).not.toContain(String.fromCharCode(0x2014));
  });

  for (const width of [320, 375, 430]) {
    test(`does not scroll sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(PATH, { waitUntil: "networkidle" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBe(0);
    });
  }

  test("is in the served sitemap, alongside the quiz pages, and robots.txt does not block it", async ({ request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    for (const url of [`${SITE}/quizzes`, `${SITE}/quizzes/halloween`, `${SITE}/quizzes/bonfire-night`, `${SITE}/quizzes/thanksgiving`]) {
      expect(sitemap, `${url} missing from /sitemap.xml`).toContain(`<loc>${url}</loc>`);
    }
    const robots = await (await request.get("/robots.txt")).text();
    const disallowed = robots
      .split("\n")
      .map((line) => line.match(/^\s*Disallow:\s*(\S+)/i)?.[1])
      .filter((prefix): prefix is string => Boolean(prefix));
    expect(disallowed.filter((prefix) => "/quizzes".startsWith(prefix))).toEqual([]);
  });
});

test.describe("the footer link to /quizzes", () => {
  test("is on an ordinary page, right after FAQ, and goes to /quizzes", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("contentinfo").getByRole("navigation");
    const labels = await nav.getByRole("link").allTextContents();
    expect(labels.map((l) => l.trim())).toContain(FOOTER_LABEL);
    expect(labels.map((l) => l.trim()).indexOf(FOOTER_LABEL)).toBe(labels.map((l) => l.trim()).indexOf("FAQ") + 1);

    const link = nav.getByRole("link", { name: FOOTER_LABEL });
    await expect(link).toHaveAttribute("href", "/quizzes");
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${PATH}$`));
    await expect(page.getByRole("heading", { level: 1, name: HEADING })).toBeVisible();
  });

  for (const width of [320, 390, 1280]) {
    test(`is a 48px target and the page does not scroll sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/", { waitUntil: "networkidle" });
      const link = page.getByRole("contentinfo").getByRole("link", { name: FOOTER_LABEL });
      await expect(link).toBeVisible();
      const box = (await link.boundingBox())!;
      expect(Math.round(box.height), `"${FOOTER_LABEL}" is ${box.height}px tall at ${width}px`).toBeGreaterThanOrEqual(48);
      expect(Math.round(box.width), `"${FOOTER_LABEL}" is ${box.width}px wide at ${width}px`).toBeGreaterThanOrEqual(48);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBe(0);
    });
  }

  // /host and the print sheet need a session to reach at all; legal-pages.spec.ts
  // checks those. These two are the bare surfaces a stranger can open, and the
  // URL is asserted so a redirect to a page with a footer cannot pass.
  test("is not on the surfaces that carry no chrome", async ({ page }) => {
    for (const path of ["/play", "/tv/ABCDE"]) {
      await page.goto(path);
      await expect(page, `${path} redirected`).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("contentinfo"), `footer on ${path}`).toHaveCount(0);
      await expect(page.getByRole("link", { name: FOOTER_LABEL }), `quizzes link on ${path}`).toHaveCount(0);
    }
    // The control: the same locator does find the link on an ordinary page.
    await page.goto("/");
    await expect(page.getByRole("link", { name: FOOTER_LABEL })).toHaveCount(1);
  });
});

test.describe("/quizzes/<slug> for a slug that is not a quiz", () => {
  test("is still a 404", async ({ page }) => {
    const res = await page.goto("/quizzes/not-a-quiz");
    expect(res?.status()).toBe(404);
  });
});
