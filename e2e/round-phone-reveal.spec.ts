import { test, expect, type Page } from "@playwright/test";
import { newAnonContext, signedInContext } from "./sign-in-helper";

/**
 * A team's phone during the reveal. While the round is open the newest
 * question is on top, because that is the one being answered. During the
 * reveal that order put the answer just revealed at the bottom, under cards
 * not revealed yet, and the scoreboard further down still. So during the
 * reveal the most recently revealed question goes on top, marked, and a
 * scoreboard the host shows sits under the round total, above the cards.
 */

async function cardLabels(phone: Page) {
  return phone
    .locator("ol > li")
    .evaluateAll((items) => items.map((li) => li.textContent?.match(/Round 1 · Q\d/)?.[0]));
}

async function top(phone: Page, locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  expect(box, "element is laid out").not.toBeNull();
  return box!.y;
}

test("during the reveal the phone puts the latest answer and the scoreboard on top", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const { context, api } = await signedInContext(browser, baseURL!);
  const { pack } = await (await api.post("/api/packs/seed")).json();
  const { session, hostToken } = await (await api.post("/api/sessions", { data: { packId: pack.id } })).json();
  const code = session.code as string;
  const advance = (action: string) => api.post(`/api/sessions/${code}/advance`, { data: { action, hostToken } });

  const teamContext = await newAnonContext(browser, baseURL);
  const phone = await teamContext.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`/play?code=${code}`);
  await phone.getByLabel("Team name").fill("Reveal Robins");
  await phone.getByRole("button", { name: "Join session" }).click();
  await expect(phone.getByText("You’re in, Reveal Robins.")).toBeVisible();

  await advance("start");
  const q1 = phone.getByLabel("Answer to Round 1 · Q1");
  await expect(q1).toBeVisible({ timeout: 10_000 });
  await q1.fill("Canberra");
  await phone.getByRole("button", { name: "Save" }).click();
  await expect(phone.getByText("Saved", { exact: true })).toBeVisible();

  await advance("ask_next");
  await advance("ask_next");
  await expect(phone.getByLabel("Answer to Round 1 · Q3")).toBeVisible({ timeout: 10_000 });
  // Open round: newest asked first, unchanged.
  expect(await cardLabels(phone)).toEqual(["Round 1 · Q3", "Round 1 · Q2", "Round 1 · Q1"]);

  await advance("close_round");
  await expect(phone.getByText("Answers are in.", { exact: false })).toBeVisible({ timeout: 10_000 });

  await advance("reveal_next");
  await expect(phone.getByText("Answer: Canberra")).toBeVisible({ timeout: 10_000 });
  expect(await cardLabels(phone)).toEqual(["Round 1 · Q1", "Round 1 · Q2", "Round 1 · Q3"]);
  await expect(phone.locator("ol > li").first().getByText("Just revealed")).toBeVisible();
  await expect(phone.getByText("Just revealed")).toHaveCount(1);

  await advance("reveal_next");
  await expect(phone.locator("ol > li").first()).toContainText("Round 1 · Q2", { timeout: 10_000 });
  expect(await cardLabels(phone)).toEqual(["Round 1 · Q2", "Round 1 · Q1", "Round 1 · Q3"]);
  await expect(phone.locator("ol > li").first().getByText("Just revealed")).toBeVisible();
  await expect(phone.getByText("Just revealed")).toHaveCount(1);
  // Q2 was not answered: revealed, it says "No answer" once, in the verdict.
  // Q3, not revealed yet, says it once too.
  await expect(phone.locator("ol > li").first().getByText("No answer", { exact: true })).toHaveCount(1);
  await expect(phone.locator("ol > li").last().getByText("No answer", { exact: true })).toHaveCount(1);

  await advance("reveal_all");
  const total = phone.getByText("Round 1 total: 1 point");
  await expect(total).toBeVisible({ timeout: 10_000 });
  expect(await cardLabels(phone)).toEqual(["Round 1 · Q3", "Round 1 · Q2", "Round 1 · Q1"]);

  await advance("show_scoreboard");
  const scoreboard = phone.getByRole("heading", { name: "Scoreboard" });
  await expect(scoreboard).toBeVisible({ timeout: 10_000 });
  // Round total first, then the scoreboard, then the cards, without scrolling.
  const totalY = await top(phone, total);
  const scoreboardY = await top(phone, scoreboard);
  const firstCardY = await top(phone, phone.locator("ol > li").first());
  expect(totalY).toBeLessThan(scoreboardY);
  expect(scoreboardY).toBeLessThan(firstCardY);
  expect(scoreboardY).toBeLessThan(844);

  await teamContext.close();
  await context.close();
});
