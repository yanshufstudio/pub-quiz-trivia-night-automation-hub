import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { newAnonApi, newAnonContext, signedInContext } from "./sign-in-helper";

/**
 * The TV view (RM9): a fixed 1920×1080 stage scaled to fit, with no scrolling
 * and nothing past its edges, showing only what the room should see.
 */

async function game(api: APIRequestContext) {
  const { pack } = await (await api.post("/api/packs/seed")).json();
  const { session, hostToken } = await (await api.post("/api/sessions", { data: { packId: pack.id } })).json();
  const code = session.code as string;
  const advance = (action: string, extra: object = {}) =>
    api.post(`/api/sessions/${code}/advance`, { data: { action, hostToken, ...extra } });
  return { code, hostToken, advance };
}

async function expectFitsTheScreen(page: Page) {
  const fit = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="tv-stage"]')!.getBoundingClientRect();
    return {
      scrollX: document.documentElement.scrollWidth - window.innerWidth,
      scrollY: document.documentElement.scrollHeight - window.innerHeight,
      stage: { left: stage.left, top: stage.top, right: stage.right, bottom: stage.bottom },
      w: window.innerWidth,
      h: window.innerHeight,
    };
  });
  expect(fit.scrollX, "no sideways scroll").toBeLessThanOrEqual(0);
  expect(fit.scrollY, "no vertical scroll").toBeLessThanOrEqual(0);
  expect(fit.stage.left).toBeGreaterThanOrEqual(-1);
  expect(fit.stage.top).toBeGreaterThanOrEqual(-1);
  expect(fit.stage.right).toBeLessThanOrEqual(fit.w + 1);
  expect(fit.stage.bottom).toBeLessThanOrEqual(fit.h + 1);
}

/** Every element with text sits inside the stage — nothing clipped off its edge. */
async function expectTextInsideStage(page: Page) {
  const outside = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="tv-stage"]')!;
    const s = stage.getBoundingClientRect();
    return [...stage.querySelectorAll("h1, p, li, span")]
      .filter((el) => el.textContent?.trim())
      .map((el) => ({ text: el.textContent!.trim().slice(0, 40), r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.left < s.left - 1 || r.right > s.right + 1 || r.top < s.top - 1 || r.bottom > s.bottom + 1))
      .map(({ text }) => text);
  });
  expect(outside).toEqual([]);
}

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]) {
  test(`the TV at ${viewport.width}×${viewport.height}: fits, no scrollbars, no answers before the reveal`, async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const { context, api } = await signedInContext(browser, baseURL!);
    const { code, advance } = await game(api);
    const phone = await newAnonApi(baseURL!);
    await phone.post(`/api/sessions/${code}/join`, { data: { name: "Quizzly Bears" } });

    const tvContext = await newAnonContext(browser, baseURL);
    const tv = await tvContext.newPage();
    await tv.setViewportSize(viewport);
    await tv.goto(`/tv/${code}`);

    // Lobby: the code and the team names.
    await expect(tv.getByText(code, { exact: true })).toBeVisible();
    await expect(tv.getByText("Quizzly Bears")).toBeVisible();
    await expectFitsTheScreen(tv);
    await expectTextInsideStage(tv);

    // Open round: the question, big — and not its answer.
    await advance("start");
    const question = tv.getByRole("heading", { name: "What is the capital of Australia?" });
    await expect(question).toBeVisible({ timeout: 10_000 });
    await expect(question).toHaveAttribute("dir", "auto");
    await expect(tv.getByText("Round 1 · Q1 of 3")).toBeVisible();
    expect(await tv.content()).not.toContain("Canberra");
    await expectFitsTheScreen(tv);
    await expectTextInsideStage(tv);

    // Marking: answers are in, still no answer.
    await advance("ask_next");
    await advance("ask_next");
    await advance("close_round");
    await expect(tv.getByText("Answers are in")).toBeVisible({ timeout: 10_000 });
    expect(await tv.content()).not.toContain("Canberra");

    // Reveal: the answer, one question at a time.
    await advance("reveal_next");
    await expect(tv.getByText("Canberra")).toBeVisible({ timeout: 10_000 });
    expect(await tv.content()).not.toContain("Seven");
    await expectFitsTheScreen(tv);
    await expectTextInsideStage(tv);

    // The whole round's answers, then the scoreboard only when shown.
    await advance("reveal_all");
    await expect(tv.getByText("Round 1: the answers")).toBeVisible({ timeout: 10_000 });
    await expectTextInsideStage(tv);
    await advance("show_scoreboard");
    await expect(tv.getByText("Scoreboard", { exact: true })).toBeVisible({ timeout: 10_000 });

    await advance("end");
    // The name is the brand wordmark, not plain text: serif, "Foundry" in gold.
    const madeWith = tv.locator("p", { hasText: "Made with" });
    // The brand mark's "?" sits between the words; it is aria-hidden.
    await expect(madeWith).toHaveText(/^Made with\s*\?\s*TriviaFoundry$/, { timeout: 10_000 });
    await expect(madeWith.locator(".font-serif", { hasText: "Trivia" })).toBeVisible();
    await expect(madeWith.locator(".text-gold", { hasText: "Foundry" })).toBeVisible();
    await expectFitsTheScreen(tv);

    await phone.dispose();
    await tvContext.close();
    await context.close();
  });
}

test("the TV switch shows every question asked so far", async ({ browser, baseURL }) => {
  const { context, api } = await signedInContext(browser, baseURL!);
  const { code, advance } = await game(api);
  await advance("start");
  await advance("ask_next");
  const tvContext = await newAnonContext(browser, baseURL);
  const tv = await tvContext.newPage();
  await tv.setViewportSize({ width: 1280, height: 720 });
  await tv.goto(`/tv/${code}`);
  await expect(tv.getByRole("heading", { name: "How many continents are there?" })).toBeVisible();
  await expect(tv.getByText("What is the capital of Australia?")).toHaveCount(0);

  await advance("set_tv_mode", { showAll: true });
  await expect(tv.getByText("What is the capital of Australia?")).toBeVisible({ timeout: 10_000 });
  await expect(tv.getByText("How many continents are there?")).toBeVisible();
  await tvContext.close();
  await context.close();
});

test("a refused poll shows Reconnecting…, and the screen recovers", async ({ browser, baseURL }) => {
  test.setTimeout(60_000);
  const { context, api } = await signedInContext(browser, baseURL!);
  const { code } = await game(api);
  const tvContext = await newAnonContext(browser, baseURL);
  const tv = await tvContext.newPage();
  await tv.goto(`/tv/${code}`);
  await expect(tv.getByText(code, { exact: true })).toBeVisible();

  await tv.route("**/display", (route) =>
    route.fulfill({ status: 429, headers: { "Retry-After": "1" }, contentType: "application/json", body: "{}" })
  );
  await expect(tv.getByRole("status")).toHaveText("Reconnecting…", { timeout: 10_000 });
  // Still showing the last good picture, not a dead screen.
  await expect(tv.getByText(code, { exact: true })).toBeVisible();

  await tv.unroute("**/display");
  await expect(tv.getByRole("status")).toHaveCount(0, { timeout: 20_000 });
  await tvContext.close();
  await context.close();
});
