import { test, expect } from "@playwright/test";

/**
 * The guide and the FAQ describe the game a host actually runs.
 *
 * Every new game is round by round with no per-question timer, and the guide
 * still walked a host through the old question-by-question game. The FAQ said
 * there were no analytics while /privacy lists Vercel Web Analytics, and it had
 * no answer for the commonest question on the night: a team's phone dropping
 * off. These check the corrected copy on the rendered pages.
 */

const PUBLIC_PAGES = ["/", "/faq", "/how-it-works", "/pricing", "/terms", "/privacy", "/refunds"];

test("/faq says what to do when a team's phone loses its connection", async ({ page }) => {
  await page.goto("/faq");
  const entry = page.locator("#phone-connection");
  await expect(entry.getByRole("heading", { name: "What if a team's phone loses its connection?" })).toBeVisible();
  await expect(entry).toContainText(
    "If it does not, reload the page: the phone rejoins as the same team and keeps every saved answer and point."
  );
  await expect(entry).toContainText("Do not tap Leave to fix it");
  // Straight after the entry on teams.
  const ids = await page.locator("main section[id]").evaluateAll((s) => s.map((el) => el.id));
  expect(ids[ids.indexOf("teams") + 1]).toBe("phone-connection");
});

test("no public page says there are no analytics", async ({ page }) => {
  for (const path of PUBLIC_PAGES) {
    await page.goto(path);
    expect(await page.locator("body").innerText(), path).not.toMatch(/We run no\s+analytics/i);
  }
  await page.goto("/faq");
  await expect(page.locator("#ownership")).toContainText("Vercel Web Analytics");
  await expect(page.locator("#ownership").getByRole("link", { name: "privacy policy" })).toHaveAttribute("href", "/privacy");
});

test("/faq says marks appear when the round closes, before the reveal", async ({ page }) => {
  await page.goto("/faq");
  const marking = page.locator("#marking");
  await expect(marking).toContainText("When you close a round");
  await expect(marking).not.toContainText("After each reveal");
});

test("/how-it-works walks through a round-mode night with the desk's own labels", async ({ page }) => {
  await page.goto("/how-it-works");
  const main = page.locator("main");
  const text = await main.innerText();
  expect(text).not.toMatch(/per-question timer/i);
  expect(text).not.toMatch(/Reveal answer/);
  for (const label of ["Add paper team", "Open TV display", "Start quiz", "Ask next question", "Close round", "Reveal next answer", "Reveal all", "Show scoreboard", "Next round", "Finish quiz"]) {
    expect(text, label).toContain(label);
  }
  // The step count in the intro matches the steps.
  const steps = await main.locator("ol > li").count();
  const words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen"];
  await expect(main).toContainText(`${words[steps]} steps`);
  // And the phone step points at the reconnection answer.
  await expect(main.getByRole("link", { name: /phone loses its connection/i })).toHaveAttribute("href", "/faq#phone-connection");
});

test("the guide and the FAQ add no em dash in the copy they changed", async ({ page }) => {
  await page.goto("/faq");
  for (const id of ["phone-connection", "ownership", "marking", "screen"]) {
    expect(await page.locator(`#${id}`).innerText(), id).not.toContain("—");
  }

  // The steps HELP1 wrote or rewrote, by title; and the sentence it added to step 7.
  await page.goto("/how-it-works");
  const steps = page.locator("main ol > li");
  for (const title of [
    "Add paper teams, if some tables play on paper",
    "Put the game on a TV, if the room has one",
    "Start the quiz",
    "Ask the round's questions",
    "Close the round",
    "Check the marks",
    "Reveal the answers",
    "Show the scoreboard, then the next round",
    "Finish on the scoreboard",
  ]) {
    const step = steps.filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    await expect(step, title).toHaveCount(1);
    expect(await step.innerText(), title).not.toContain("—");
  }
  const join = await steps.filter({ hasText: "Teams join from their own phones" }).innerText();
  expect(join.slice(join.indexOf("If a phone drops off"))).not.toContain("—");
});

test("the guide says paper teams are added before the start, and the FAQ does not promise standings on every reveal", async ({ page }) => {
  await page.goto("/how-it-works");
  const paper = page
    .locator("main ol > li")
    .filter({ has: page.getByRole("heading", { name: "Add paper teams, if some tables play on paper" }) });
  await expect(paper).toContainText("Before you press Start quiz");

  await page.goto("/faq");
  const screen = page.locator("#screen");
  await expect(screen).not.toContainText("scores update there as you reveal answers");
  await expect(screen).toContainText("the standings whenever you show the scoreboard");
});
