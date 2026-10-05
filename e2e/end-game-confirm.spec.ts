import { test, expect, type Page } from "@playwright/test";
import { signedInContext } from "./sign-in-helper";

/**
 * "End game" on the host desk must need an explicit press on "Yes" (L9).
 *
 * A live walk on the preview saw a lobby end about 2.5s after "End game" was
 * pressed, with nobody touching the machine; the server logged the one end
 * request the Yes handler sends. It did not reproduce here at any width, so
 * these specs pin the hardening rather than a reproduction: nothing ends a
 * game without a real press on Yes, Yes is never where "End game" was, and
 * nothing puts focus on it.
 */

async function lobbyDesk(page: Page, api: import("@playwright/test").APIRequestContext) {
  const { pack } = await (await api.post("/api/packs/seed")).json();
  const { session, hostToken } = await (await api.post("/api/sessions", { data: { packId: pack.id } })).json();
  const endRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes(`/api/sessions/${session.code}/advance`) && r.postData()?.includes('"end"')) {
      endRequests.push(r.url());
    }
  });
  await page.goto(`/host/${session.code}`);
  await expect(page.getByRole("heading", { name: "Waiting for teams" })).toBeVisible();
  return { code: session.code as string, hostToken: hostToken as string, endRequests };
}

async function pressEndGame(page: Page) {
  // In a round-mode game End game lives in the desk's menu (RM7).
  await page.getByRole("button", { name: "Menu" }).click();
  const endGame = page.getByRole("button", { name: "End game", exact: true });
  await endGame.scrollIntoViewIfNeeded();
  const box = (await endGame.boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  // A real mouse press at the button's position, not locator.click: the
  // pointer stays where it was while the panel mounts under it.
  await page.mouse.click(point.x, point.y);
  await expect(page.getByRole("heading", { name: "End this game for everyone?" })).toBeVisible();
  return { box, point };
}

test("pressing End game once and then waiting 15s ends nothing", async ({ browser, baseURL }) => {
  test.setTimeout(60_000);
  const { context, api } = await signedInContext(browser, baseURL!);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  const { code, hostToken, endRequests } = await lobbyDesk(page, api);

  await pressEndGame(page);
  // Five polls' worth of re-renders with no input at all.
  await page.waitForTimeout(15_000);

  expect(endRequests).toEqual([]);
  await expect(page.getByRole("heading", { name: "End this game for everyone?" })).toBeVisible();
  const view = await (await api.get(`/api/sessions/${code}?as=host&hostToken=${encodeURIComponent(hostToken)}`)).json();
  expect(view.status).toBe("LOBBY");
  await expect(page.getByRole("heading", { name: "Waiting for teams" })).toBeVisible();
  await context.close();
});

test("focus goes to Keep playing, never to Yes", async ({ browser, baseURL }) => {
  const { context, api } = await signedInContext(browser, baseURL!);
  const page = await context.newPage();
  const { endRequests } = await lobbyDesk(page, api);
  await pressEndGame(page);

  await expect(page.getByRole("button", { name: "Keep playing" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Yes, end the game" })).not.toBeFocused();
  // A held key, or a remote's OK button, therefore backs out.
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "End this game for everyone?" })).toHaveCount(0);
  expect(endRequests).toEqual([]);
  await context.close();
});

// One signed-in host for every width: Better Auth limits sign-ins per IP, and
// seven of them in a few seconds trips it.
test("at every width, Yes is never where End game was", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const { context, api } = await signedInContext(browser, baseURL!);
  for (const width of [390, 600, 700, 820, 1024, 1440, 1600]) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 800 });
    await lobbyDesk(page, api);
    const { box, point } = await pressEndGame(page);

    const yes = (await page.getByRole("button", { name: "Yes, end the game" }).boundingBox())!;
    const overlaps =
      yes.x < box.x + box.width && box.x < yes.x + yes.width && yes.y < box.y + box.height && box.y < yes.y + yes.height;
    expect(overlaps, `${width}px: Yes ${JSON.stringify(yes)} overlaps End game ${JSON.stringify(box)}`).toBe(false);
    const atPointer = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.textContent?.trim(), point);
    expect(atPointer, `${width}px`).not.toBe("Yes, end the game");
    await page.close();
  }
  await context.close();
});

test("a click nobody made does not end the game; a real press still does", async ({ browser, baseURL }) => {
  const { context, api } = await signedInContext(browser, baseURL!);
  const page = await context.newPage();
  const { endRequests } = await lobbyDesk(page, api);
  await pressEndGame(page);

  // Programmatic, untrusted: what any script or extension could send.
  await page.evaluate(() => {
    const yes = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Yes, end the game");
    yes?.click();
    yes?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForTimeout(1_000);
  expect(endRequests).toEqual([]);
  await expect(page.getByRole("heading", { name: "End this game for everyone?" })).toBeVisible();

  // The keyboard path still works for someone who chooses it.
  await page.getByRole("button", { name: "Yes, end the game" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "End game", exact: true })).toHaveCount(0, { timeout: 10_000 });
  expect(endRequests).toHaveLength(1);
  await context.close();
});

test("a real mouse press on Yes ends the game", async ({ browser, baseURL }) => {
  const { context, api } = await signedInContext(browser, baseURL!);
  const page = await context.newPage();
  const { endRequests } = await lobbyDesk(page, api);
  await pressEndGame(page);
  await page.getByRole("button", { name: "Yes, end the game" }).click();
  await expect(page.getByRole("button", { name: "End game", exact: true })).toHaveCount(0, { timeout: 10_000 });
  expect(endRequests).toHaveLength(1);
  await context.close();
});
