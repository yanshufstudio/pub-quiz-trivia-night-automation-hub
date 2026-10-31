import { test, expect } from "@playwright/test";

/**
 * The printing copy for Print preview's Print button (Halloween 2026), typed
 * out here on purpose so a test that read it back from the page's own source
 * could not notice it changing. Read with textContent, which keeps a
 * non-breaking space and an em dash as they are; Playwright's toHaveText and
 * toContainText would fold the first into a plain space.
 */

const NBSP = "\xa0";
const EM_DASH = String.fromCharCode(0x2014);

const HOW_IT_WORKS_PRINT =
  "Print preview in the pack editor has three sheets: the presenter script to read from, the host answer key, and the team answer sheet your teams write on. Pick a sheet and press Print this sheet, or save it as a PDF from the print window. Print them before the night: this is the part that needs a printer, not a phone. Hebrew prints too, laid out left to right with English headings and labels, and punctuation in lines that mix Hebrew and English can land in the wrong place. Polish, Greek and Cyrillic letters print as well.";

const FAQ_PRINTING =
  "Yes. Print preview in the pack editor has a presenter script to read from, a host answer key, and a team answer sheet for teams who would rather write than tap. Pick a sheet and press Print this sheet, or save it as a PDF from the print window. Pictures you have added print with their questions. Hebrew prints too, laid out left to right with English headings and labels, and punctuation in lines that mix Hebrew and English can land in the wrong place. Polish, Greek and Cyrillic letters print as well.";

const PRICING_PRINT_LINE = "Printable team answer sheets and a host answer key";

test("/how-it-works: the Print the sheets step", async ({ page }) => {
  await page.goto("/how-it-works");
  const step = page.getByRole("main").locator("li", { has: page.getByRole("heading", { name: "Print the sheets" }) });
  const body = step.locator("p");
  expect(await body.textContent()).toBe(HOW_IT_WORKS_PRINT);
  await expect(body.locator("em")).toHaveText(["Print preview", "Print this sheet"]);
  expect(HOW_IT_WORKS_PRINT).not.toContain(EM_DASH);
  expect(await page.getByRole("main").textContent()).not.toContain("Download PDF");
});

test('/faq: the answer to "Can I print it?"', async ({ page }) => {
  await page.goto("/faq");
  const entry = page.locator("#printing");
  await expect(entry.getByRole("heading", { name: "Can I print it?" })).toBeVisible();
  const answer = entry.locator("p");
  expect(await answer.textContent()).toBe(FAQ_PRINTING);
  await expect(answer.locator("em")).toHaveText(["Print preview", "Print this sheet"]);
  expect(FAQ_PRINTING).not.toContain(EM_DASH);
  expect(await page.getByRole("main").textContent()).not.toContain("Download PDF");
});

test("/pricing: the free plan's printing line", async ({ page }) => {
  await page.goto("/pricing");
  const lines = await page.locator("section[aria-labelledby='plan-free'] li").allTextContents();
  expect(lines).toContain(PRICING_PRINT_LINE);
  expect(lines).not.toContain("Printable question and answer sheets");
  expect(PRICING_PRINT_LINE).not.toContain(EM_DASH);
});

test("the image size limit keeps 2 and MB together on every page that shows it", async ({ page }) => {
  for (const path of ["/", "/how-it-works", "/faq"]) {
    await page.goto(path);
    const text = (await page.locator("body").textContent()) ?? "";
    expect(text, path).toContain(`2${NBSP}MB`);
    expect(text, path).not.toContain("2 MB");
  }
});
