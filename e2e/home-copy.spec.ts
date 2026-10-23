import { test, expect } from "@playwright/test";

/**
 * The homepage's approved wording: the paragraph under the H1 and the "Write
 * it" card. Typed out here on purpose, so a test that read them back from the
 * page's own source could not notice them changing. The card's size is
 * written as the page renders it ("2 MB"), which also holds the page to
 * formatBytes(MAX_MEDIA_BYTES) saying so.
 */

const INTRO =
  "Describe the rounds you want. TriviaFoundry writes the whole pub quiz or trivia night: a full pack, a presenter script and answer sheets to print. Then it runs the night live, while every team's phone lights up with the question.";

const WRITE_IT =
  "Describe the rounds and topics you want (90s pop, local history, the town's past) and the pack is written for you, in words. Add your own pictures to any question, up to 2 MB each, for a picture round.";

test.describe("the homepage copy", () => {
  test("the paragraph under the H1 is the approved intro", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main h1 + p")).toHaveText(INTRO);
  });

  test('the "Write it" card body is the approved text', async ({ page }) => {
    await page.goto("/");
    const card = page.locator("section[aria-labelledby='how-a-night-runs']");
    await expect(card.getByRole("heading", { name: "Write it" }).locator("xpath=following-sibling::p")).toHaveText(WRITE_IT);
  });

  test("has no em dash anywhere a reader or a crawler can see", async ({ page }) => {
    await page.goto("/");
    const seen = await page.evaluate(() => [
      document.title,
      document.body.innerText,
      ...Array.from(document.querySelectorAll("img")).map((img) => img.alt),
      ...Array.from(document.querySelectorAll("[aria-label], [title]")).flatMap((el) => [
        el.getAttribute("aria-label") ?? "",
        el.getAttribute("title") ?? "",
      ]),
      ...Array.from(document.head.querySelectorAll<HTMLMetaElement>("meta[content]")).map((m) => m.content),
    ]);
    expect(seen.join("\n").length).toBeGreaterThan(500);
    expect(seen.join("\n")).not.toContain(String.fromCharCode(0x2014));
  });
});
