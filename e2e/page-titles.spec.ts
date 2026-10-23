import { test, expect, type Page } from "@playwright/test";

/**
 * Two titles marketing chose: /play, for the phone's tab and for WhatsApp link
 * previews (which read og:title, so the share titles change with the tab's),
 * and the not-found page.
 *
 * The titles are typed with escapes so the curly apostrophe (U+2019) and the
 * middle dot (U+00B7) cannot be swapped for a look-alike without this test
 * noticing. Everything else in /play's head is typed out too, as it was on
 * master before the title changed: a page that sets openGraph or twitter
 * replaces the layout's object, so an image or description could drop out of
 * /play without any other test noticing.
 */

const SITE = "https://triviafoundry.com";
const PLAY_TITLE = "Join tonight’s quiz · TriviaFoundry";
const NOT_FOUND_TITLE = "Page not found · TriviaFoundry";

const DESCRIPTION =
  "Writes your pub quiz or trivia night, then runs it live. Describe the rounds you want; get a full pack, a presenter script and printed answer sheets, then run it with teams on their phones.";
const SHARE_DESCRIPTION = "Writes your pub quiz or trivia night, then runs it live.";
const IMAGE_ALT =
  "TriviaFoundry: writes your pub quiz or trivia night, then runs it live. A live scoreboard on a dark pub-green background.";

/** The text of every <title> in the head: exactly one is expected. */
async function titles(page: Page) {
  return page.evaluate(() => Array.from(document.head.querySelectorAll("title")).map((t) => t.textContent));
}

/** Every <meta> content matching a selector, read in the page. */
async function metas(page: Page, selector: string) {
  return page.evaluate(
    (sel) => Array.from(document.head.querySelectorAll<HTMLMetaElement>(sel)).map((m) => m.content),
    selector,
  );
}

test.describe("/play", () => {
  test("has the join title in the tab and in both share titles", async ({ page }) => {
    await page.goto("/play");
    expect(await titles(page)).toEqual([PLAY_TITLE]);
    expect(await page.title()).toBe(PLAY_TITLE);
    expect(await metas(page, 'meta[property="og:title"]')).toEqual([PLAY_TITLE]);
    expect(await metas(page, 'meta[name="twitter:title"]')).toEqual([PLAY_TITLE]);
  });

  test("keeps everything else in its head as it was: the picture, the descriptions, the card, no canonical", async ({
    page,
  }) => {
    await page.goto("/play");
    const expected: Record<string, string[]> = {
      'meta[name="description"]': [DESCRIPTION],
      'meta[property="og:description"]': [SHARE_DESCRIPTION],
      'meta[name="twitter:description"]': [SHARE_DESCRIPTION],
      'meta[property="og:image"]': [`${SITE}/og.png`],
      'meta[property="og:image:width"]': ["1200"],
      'meta[property="og:image:height"]': ["630"],
      'meta[property="og:image:alt"]': [IMAGE_ALT],
      'meta[name="twitter:image"]': [`${SITE}/og.png`],
      'meta[name="twitter:image:alt"]': [IMAGE_ALT],
      'meta[name="twitter:card"]': ["summary_large_image"],
      'meta[property="og:type"]': ["website"],
      'meta[property="og:site_name"]': ["TriviaFoundry"],
      // robots.ts disallows /play, so it claims no URL of its own.
      'meta[property="og:url"]': [],
    };
    for (const [selector, content] of Object.entries(expected)) {
      expect(await metas(page, selector), selector).toEqual(content);
    }
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  });
});

test.describe("the not-found page", () => {
  // An address no route matches, and a route that throws notFound() itself.
  for (const path of ["/no-such-page", "/quizzes/not-a-quiz"]) {
    test(`${path} is a 404 titled for the page, and noindex`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(404);
      expect(await titles(page)).toEqual([NOT_FOUND_TITLE]);
      expect(await page.title()).toBe(NOT_FOUND_TITLE);
      expect((await metas(page, 'meta[name="robots"]')).join(",")).toContain("noindex");
    });
  }
});
