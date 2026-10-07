import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { newAnonContext, signedInContext } from "./sign-in-helper";

/**
 * A phone that played one game, opening /play for another.
 *
 * Seen on a real night: a browser that had played an ended game, opening
 * /play?code=<new code>, showed the OLD game's ended screen; refreshing never
 * changed it; and after "Leave" the join form came back filled in with the
 * old code and the old team name. The URL's code is what the team is trying
 * to join, so a different code always wins. With no code or the same code, a
 * game that is over shows its final scores and the team's place (a phone
 * reloaded after Finish used to drop to the join form), with "Join another
 * quiz" as the way out.
 */

async function newGame(api: APIRequestContext) {
  const { pack } = await (await api.post("/api/packs/seed")).json();
  const { session, hostToken } = await (await api.post("/api/sessions", { data: { packId: pack.id } })).json();
  const code = session.code as string;
  const advance = (action: string) => api.post(`/api/sessions/${code}/advance`, { data: { action, hostToken } });
  return { code, advance };
}

async function phoneIn(browser: Browser, baseURL: string, code: string, teamName: string) {
  const context = await newAnonContext(browser, baseURL);
  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`/play?code=${code}`);
  await phone.getByLabel("Team name").fill(teamName);
  await phone.getByRole("button", { name: "Join session" }).click();
  await expect(phone.getByText(`You’re in, ${teamName}.`)).toBeVisible();
  return { context, phone };
}

async function expectJoinForm(phone: Page, code: string) {
  await expect(phone.getByRole("button", { name: "Join session" })).toBeVisible({ timeout: 10_000 });
  await expect(phone.getByLabel("Session code")).toHaveValue(code);
  await expect(phone.getByLabel("Team name")).toHaveValue("");
}

/** What a phone shows after Finish, reloaded or not: the end, the team's place, the board. */
async function expectEndedScreen(phone: Page, teamName: string) {
  await expect(phone.getByText(/This quiz is over\./)).toBeVisible({ timeout: 10_000 });
  await expect(phone.getByText(`${teamName} finished 1st with 0 points.`)).toBeVisible();
  await expect(phone.getByRole("heading", { name: "Final scores" })).toBeVisible();
  await expect(phone.getByRole("button", { name: "Join session" })).toHaveCount(0);
}

test.describe("a phone that remembers a team", () => {
  test("a different code in the URL shows the join form for that code", async ({ browser, baseURL }) => {
    const { context: host, api } = await signedInContext(browser, baseURL!);
    const old = await newGame(api);
    const next = await newGame(api);
    const { context, phone } = await phoneIn(browser, baseURL!, old.code, "Old Owls");
    await old.advance("start");
    await old.advance("end");
    // Reloaded with no code, the phone still shows the ended game...
    await phone.goto("/play");
    await expectEndedScreen(phone, "Old Owls");

    // ...but a join link for another game is where the team is going.
    await phone.goto(`/play?code=${next.code}`);
    await expectJoinForm(phone, next.code);
    await expect(phone.getByText("Old Owls")).toHaveCount(0);

    // And the new game can be joined from there.
    await phone.getByLabel("Team name").fill("New Newts");
    await phone.getByRole("button", { name: "Join session" }).click();
    await expect(phone.getByText("You’re in, New Newts.")).toBeVisible();

    await context.close();
    await host.close();
  });

  test("the same code, still live, keeps the team in its place", async ({ browser, baseURL }) => {
    const { context: host, api } = await signedInContext(browser, baseURL!);
    const game = await newGame(api);
    const { context, phone } = await phoneIn(browser, baseURL!, game.code, "Staying Stoats");

    await phone.goto(`/play?code=${game.code}`);
    await expect(phone.getByText("You’re in, Staying Stoats.")).toBeVisible({ timeout: 10_000 });
    await expect(phone.getByRole("button", { name: "Join session" })).toHaveCount(0);

    await context.close();
    await host.close();
  });

  test("the same code, once the game has ended, shows the final scores and the team's place", async ({
    browser,
    baseURL,
  }) => {
    const { context: host, api } = await signedInContext(browser, baseURL!);
    const game = await newGame(api);
    const { context, phone } = await phoneIn(browser, baseURL!, game.code, "Ended Eels");
    await game.advance("start");
    await game.advance("end");

    await phone.goto(`/play?code=${game.code}`);
    await expectEndedScreen(phone, "Ended Eels");

    // "Join another quiz" is the way out: an empty join form, nothing remembered.
    await phone.getByRole("button", { name: "Join another quiz" }).click();
    await expectJoinForm(phone, "");
    expect(await phone.evaluate(() => Object.keys(localStorage))).toEqual([]);

    await context.close();
    await host.close();
  });

  test("no code in the URL: a live game is kept, an ended one shows its final scores", async ({
    browser,
    baseURL,
  }) => {
    const { context: host, api } = await signedInContext(browser, baseURL!);
    const game = await newGame(api);
    const { context, phone } = await phoneIn(browser, baseURL!, game.code, "Codeless Cods");
    await game.advance("start");

    await phone.goto("/play");
    await expect(phone.getByLabel("Answer to Round 1 · Q1")).toBeVisible({ timeout: 10_000 });
    await expect(phone.getByRole("button", { name: "Join session" })).toHaveCount(0);

    await game.advance("end");
    await phone.goto("/play");
    await expectEndedScreen(phone, "Codeless Cods");

    await context.close();
    await host.close();
  });

  test("Leave goes back to an empty join form, not the old code and name", async ({ browser, baseURL }) => {
    const { context: host, api } = await signedInContext(browser, baseURL!);
    const game = await newGame(api);
    const { context, phone } = await phoneIn(browser, baseURL!, game.code, "Leaving Lynx");

    await phone.getByRole("button", { name: "Leave" }).click();
    await expect(phone.getByRole("button", { name: "Join session" })).toBeVisible();
    await expect(phone.getByLabel("Team name")).toHaveValue("");
    await expect(phone.getByLabel("Session code")).not.toHaveValue(game.code);

    await context.close();
    await host.close();
  });
});
