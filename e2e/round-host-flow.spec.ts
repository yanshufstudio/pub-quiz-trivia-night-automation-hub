import { test, expect, type Page } from "@playwright/test";
import { newAnonApi, signedInContext } from "./sign-in-helper";

/**
 * The host runs a whole round-mode game from a phone (RM7): start, ask every
 * question, close the round with a deliberate confirm, check the marks and
 * type a paper team's total, reveal one answer at a time, show the scoreboard,
 * go to the next round, and finish. Portrait phone first, because that is
 * where most hosts will hold the desk.
 */

const PHONE = { width: 390, height: 844 };

async function primary(page: Page, name: string | RegExp) {
  const button = page.getByTestId("primary-action").getByRole("button", { name });
  await expect(button).toBeVisible();
  return button;
}

/** The next step is always one fixed button at the bottom of the screen, big enough for a thumb. */
async function expectPrimaryAtBottom(page: Page) {
  const box = (await page.getByTestId("primary-action").getByRole("button").first().boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.y + box.height).toBeGreaterThan(PHONE.height - 120);
  expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height);
}

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test("a host runs a whole round-mode game from a phone", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const { context, api } = await signedInContext(browser, baseURL!);
  const { pack } = await (await api.post("/api/packs/seed")).json();
  const { session, hostToken } = await (await api.post("/api/sessions", { data: { packId: pack.id } })).json();
  const code = session.code as string;

  const page = await context.newPage();
  await page.setViewportSize(PHONE);
  await page.goto(`/host/${code}`);
  await expect(page.getByRole("heading", { name: "Waiting for teams" })).toBeVisible();
  await expectNoSidewaysScroll(page);

  // A paper team, added by name, and a phone team that joins itself.
  await page.getByRole("button", { name: "Add paper team" }).click();
  await page.getByLabel("Paper team name").fill("The Pencils");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("The Pencils")).toBeVisible();
  const phoneApi = await newAnonApi(baseURL!);
  const { token } = await (await phoneApi.post(`/api/sessions/${code}/join`, { data: { name: "Phone Team" } })).json();
  await expect(page.getByText("Phone Team")).toBeVisible({ timeout: 10_000 });

  await expectPrimaryAtBottom(page);
  await (await primary(page, "Start quiz")).click();
  await expect(page.getByText("Round 1 · Q1 of 3")).toBeVisible();
  await expect(page.getByText("What is the capital of Australia?")).toBeVisible();
  await expectPrimaryAtBottom(page);

  await phoneApi.post(`/api/sessions/${code}/answers`, { data: { token, questionIndex: 0, text: "Canberra" } });

  // The host can start a countdown; it never closes the round.
  await page.getByRole("button", { name: "Start countdown" }).click();
  await page.getByRole("button", { name: "1 min" }).click();
  await expect(page.getByTestId("countdown")).toBeVisible();

  await (await primary(page, "Ask next question")).click();
  await expect(page.getByText("Round 1 · Q2 of 3")).toBeVisible();
  await (await primary(page, "Ask next question")).click();
  await expect(page.getByText("Round 1 · Q3 of 3")).toBeVisible();

  // Closing needs a deliberate second press, away from where the first one was.
  const close = await primary(page, "Close round…");
  const closeBox = (await close.boundingBox())!;
  await close.click();
  await expect(page.getByRole("heading", { name: "Close round 1?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Keep the round open" })).toBeFocused();
  const yes = (await page.getByRole("button", { name: "Yes, close the round" }).boundingBox())!;
  const overlaps =
    yes.x < closeBox.x + closeBox.width &&
    closeBox.x < yes.x + yes.width &&
    yes.y < closeBox.y + closeBox.height &&
    closeBox.y < yes.y + yes.height;
  expect(overlaps).toBe(false);
  await page.getByRole("button", { name: "Yes, close the round" }).click();

  // Marking: the auto marks, and a typed total for the paper team.
  await expect(page.getByRole("heading", { name: "Round 1: check the marks" })).toBeVisible();
  await expect(page.getByTestId("marks-grid").getByText("Canberra")).toBeVisible();
  await page.getByLabel("Round 1 total for The Pencils").fill("2");
  await page.getByRole("button", { name: "Save total for The Pencils" }).click();
  await expect(page.getByText("Entered by hand")).toBeVisible();
  // One point is "1 pt", more are "pts", typed or marked.
  await expect(page.locator("li", { hasText: "Phone Team" }).getByText("1 pt", { exact: true })).toBeVisible();
  await expect(page.locator("li", { hasText: "The Pencils" }).getByText("2 pts", { exact: true })).toBeVisible();
  await expectNoSidewaysScroll(page);

  // Reveal one at a time, then the rest.
  await (await primary(page, "Reveal next answer")).click();
  await expect(page.getByText("1 of 3 answers revealed")).toBeVisible();
  await page.getByRole("button", { name: "Reveal all" }).click();
  await expect(page.getByText("3 of 3 answers revealed")).toBeVisible();

  // The scoreboard goes up only when the host says so.
  await page.getByRole("button", { name: "Show scoreboard" }).click();
  await expect(page.getByRole("button", { name: "Hide scoreboard" })).toBeVisible();
  const view = await (await api.get(`/api/sessions/${code}?as=host&hostToken=${encodeURIComponent(hostToken)}`)).json();
  expect(view.scoreboard).toEqual([
    { teamId: expect.any(String), name: "The Pencils", score: 2 },
    { teamId: expect.any(String), name: "Phone Team", score: 1 },
  ]);

  await (await primary(page, "Next round")).click();
  await expect(page.getByText("Round 2 · Q1 of 3")).toBeVisible();
  await (await primary(page, "Ask next question")).click();
  await (await primary(page, "Ask next question")).click();
  await (await primary(page, "Close round…")).click();
  await page.getByRole("button", { name: "Yes, close the round" }).click();
  // No round 2 total for the paper team: the desk says so, and carries on when told to.
  await page.getByRole("button", { name: "Reveal all" }).click();
  await expect(page.getByTestId("primary-action")).toContainText("No round 2 total for The Pencils");
  await page.getByRole("button", { name: "Yes, reveal all" }).click();

  await (await primary(page, "Finish quiz…")).click();
  await expect(page.getByRole("heading", { name: "Finish the quiz?" })).toBeVisible();
  await page.getByRole("button", { name: "Yes, finish the quiz" }).click();
  await expect(page.getByText(/Tonight’s champion/)).toBeVisible();

  await phoneApi.dispose();
  await context.close();
});

test("the host desk's menu opens the TV display and warns about mirroring", async ({ browser, baseURL }) => {
  const { context, api } = await signedInContext(browser, baseURL!);
  const { pack } = await (await api.post("/api/packs/seed")).json();
  const { session } = await (await api.post("/api/sessions", { data: { packId: pack.id } })).json();
  const page = await context.newPage();
  await page.setViewportSize(PHONE);
  await page.goto(`/host/${session.code}`);
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByText(`/tv/${session.code}`)).toBeVisible();
  await expect(page.getByText(/use Extend, not Mirror/)).toBeVisible();
  const menu = page.locator("section", { has: page.getByRole("heading", { name: "TV display" }) });
  const [tv] = await Promise.all([
    context.waitForEvent("page"),
    menu.getByRole("button", { name: "Open TV display" }).click(),
  ]);
  await expect(tv).toHaveURL(new RegExp(`/tv/${session.code}$`));
  await context.close();
});

test("the lobby opens the TV display from next to the QR code", async ({ browser, baseURL }) => {
  const { context, api } = await signedInContext(browser, baseURL!);
  const { pack } = await (await api.post("/api/packs/seed")).json();
  const { session } = await (await api.post("/api/sessions", { data: { packId: pack.id } })).json();
  const page = await context.newPage();
  await page.setViewportSize(PHONE);
  await page.goto(`/host/${session.code}`);
  const lobby = page.locator("section", { has: page.getByRole("heading", { name: "Waiting for teams" }) });
  await expect(lobby.getByRole("img", { name: "Scan to join" })).toBeVisible();
  const [tv] = await Promise.all([
    context.waitForEvent("page"),
    lobby.getByRole("button", { name: "Open TV display" }).click(),
  ]);
  await expect(tv).toHaveURL(new RegExp(`/tv/${session.code}$`));
  await context.close();
});

test("the host desk loads on the dark stage, with no light flash", async ({ browser, baseURL }) => {
  const { context, api } = await signedInContext(browser, baseURL!);
  const { pack } = await (await api.post("/api/packs/seed")).json();
  const { session } = await (await api.post("/api/sessions", { data: { packId: pack.id } })).json();
  const page = await context.newPage();
  const response = await page.goto(`/host/${session.code}`, { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBe(true);
  // The page's own background — what shows before the desk has drawn, around
  // it, and past either end of an overscroll — is the stage, not the cream
  // of the rest of the site.
  const backgrounds = await page.evaluate(() => [
    getComputedStyle(document.documentElement).backgroundColor,
    getComputedStyle(document.body).backgroundColor,
  ]);
  expect(backgrounds).toEqual(["rgb(24, 44, 33)", "rgb(24, 44, 33)"]);
  await context.close();
});
