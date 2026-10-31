import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { newAnonApi, signedInContext } from "./sign-in-helper";

/**
 * A paper-only night: every table writes on the printed Team answer sheet and
 * the host types each round total on a phone. Walks on Sun 25 and Thu 29 Oct
 * found the desk and the TV still assumed phone teams.
 */

const PHONE = { width: 375, height: 812 };

async function game(api: APIRequestContext) {
  const { pack } = await (await api.post("/api/packs/seed")).json();
  const { session, hostToken } = await (await api.post("/api/sessions", { data: { packId: pack.id } })).json();
  const code = session.code as string;
  const advance = (action: string) => api.post(`/api/sessions/${code}/advance`, { data: { action, hostToken } });
  const addPaper = (name: string) => api.post(`/api/sessions/${code}/teams`, { data: { hostToken, name } });
  return { code, advance, addPaper };
}

/** Whether every one of these elements lies within the viewport's width. */
async function insideViewportWidth(page: Page, selector: string) {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll(sel)].map((el) => {
      const r = el.getBoundingClientRect();
      return { text: (el.textContent || el.getAttribute("aria-label") || "").trim(), inside: r.left >= 0 && r.right <= window.innerWidth };
    });
  }, selector);
}

test("the marking grid at 375 px: every team's row and total in reach on a paper-only night", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const { context, api } = await signedInContext(browser, baseURL!);
  const { code, advance, addPaper } = await game(api);
  await addPaper("The Quills");
  await addPaper("Table by the Window");
  await advance("start");
  await advance("ask_next");
  await advance("ask_next");
  await advance("ask_next");
  await advance("close_round");

  const page = await context.newPage();
  await page.setViewportSize(PHONE);
  await page.goto(`/host/${code}`);
  await expect(page.getByRole("heading", { name: "Round 1: check the marks" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "no sideways scroll on the page").toBeLessThanOrEqual(0);
  const grid = page.getByTestId("marks-grid");
  if (await grid.count()) {
    expect(await grid.evaluate((el) => el.scrollWidth - el.clientWidth), "no hidden sideways scroll").toBeLessThanOrEqual(0);
  }
  await expect(page.getByText("The Quills").first()).toBeInViewport();
  for (const row of await insideViewportWidth(page, 'input[aria-label^="Round 1 total for"]')) {
    expect(row.inside, row.text).toBe(true);
  }
  await context.close();
});

test("the marking grid at 375 px: on a mixed night every team's name stays in view", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const { context, api } = await signedInContext(browser, baseURL!);
  const { code, advance, addPaper } = await game(api);
  await addPaper("The Quills");
  const phoneApi = await newAnonApi(baseURL!);
  const { token } = await (await phoneApi.post(`/api/sessions/${code}/join`, { data: { name: "The Phones" } })).json();
  await advance("start");
  for (let q = 0; q < 3; q++) {
    if (q > 0) await advance("ask_next");
    await phoneApi.post(`/api/sessions/${code}/answers`, { data: { token, questionIndex: q, text: `A much longer answer ${q}` } });
  }
  await advance("close_round");

  const page = await context.newPage();
  await page.setViewportSize(PHONE);
  await page.goto(`/host/${code}`);
  await expect(page.getByRole("heading", { name: "Round 1: check the marks" })).toBeVisible();

  // Scrolled to the last question, each row still says whose it is.
  const grid = page.getByTestId("marks-grid");
  await grid.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  for (const name of await insideViewportWidth(page, '[data-testid="marks-grid"] tbody th')) {
    expect(name.inside, name.text).toBe(true);
  }
  // The paper team is said in full, not cut off at the screen's edge.
  for (const line of await insideViewportWidth(page, "main p")) {
    if (line.text.includes("The Quills")) expect(line.inside, line.text).toBe(true);
  }
  for (const row of await insideViewportWidth(page, 'input[aria-label^="Round 1 total for"]')) {
    expect(row.inside, row.text).toBe(true);
  }
  await context.close();
});

test("no '0 of 0 phone teams' line during a round with no phone teams", async ({ browser, baseURL }) => {
  const { context, api } = await signedInContext(browser, baseURL!);
  const { code, advance, addPaper } = await game(api);
  await addPaper("The Quills");
  await advance("start");
  await advance("ask_next");

  const page = await context.newPage();
  await page.goto(`/host/${code}`);
  await expect(page.getByText("Round 1 · Q2 of 3")).toBeVisible();
  await page.getByText("Asked so far (2)").click();
  await expect(page.getByText(/0 of 0/)).toHaveCount(0);
  await expect(page.getByText(/phone teams have answered/)).toHaveCount(0);
  await context.close();
});

test("the host adds a paper team after Start quiz; it scores 0 for the round until a total is typed", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const { context, api } = await signedInContext(browser, baseURL!);
  const { code, advance, addPaper } = await game(api);
  await addPaper("The Quills");
  await advance("start");

  const page = await context.newPage();
  await page.setViewportSize(PHONE);
  await page.goto(`/host/${code}`);
  await expect(page.getByText("Round 1 · Q1 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Add paper team" }).click();
  await page.getByLabel("Paper team name").fill("Late Table");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Late Table")).toBeVisible({ timeout: 10_000 });

  await advance("ask_next");
  await advance("ask_next");
  await advance("close_round");
  await page.reload();
  const lateRow = page.locator("li", { has: page.getByLabel("Round 1 total for Late Table") });
  await expect(lateRow).toContainText("0 pts");
  await lateRow.getByLabel("Round 1 total for Late Table").fill("4");
  await lateRow.getByRole("button", { name: "Save total for Late Table" }).click();
  await expect(lateRow).toContainText("4 pts", { timeout: 10_000 });
  await context.close();
});

test("the TV lobby: no join QR on a paper-only night, the QR as before once a phone team joins", async ({
  browser,
  baseURL,
}) => {
  const { context, api } = await signedInContext(browser, baseURL!);
  const { code, addPaper } = await game(api);
  const tv = await context.newPage();
  await tv.goto(`/tv/${code}`);
  // Before anyone is there, the TV invites phones as it always has.
  await expect(tv.getByRole("img", { name: "Scan to join" })).toBeVisible();

  await addPaper("The Quills");
  await expect(tv.getByText("The Quills")).toBeVisible({ timeout: 10_000 });
  await expect(tv.getByRole("img", { name: "Scan to join" })).toHaveCount(0);
  await expect(tv.getByText("Join at")).toHaveCount(0);
  await expect(tv.getByText(code, { exact: true })).toHaveCount(0);

  const phoneApi = await newAnonApi(baseURL!);
  await phoneApi.post(`/api/sessions/${code}/join`, { data: { name: "The Phones" } });
  await expect(tv.getByRole("img", { name: "Scan to join" })).toBeVisible({ timeout: 10_000 });
  await expect(tv.getByText("Join at")).toBeVisible();
  await context.close();
});
