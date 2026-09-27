import { test, expect } from "@playwright/test";
import { newAnonContext, signedInContext } from "./sign-in-helper";

/**
 * What /privacy says is kept in the browser, held to what the app keeps
 * there (L21).
 *
 * The policy names two items of browser storage — the host key and the team
 * token — and says the team token is the only thing stored on a team's phone
 * and is removed when the team leaves. Each of those is a claim about code,
 * so each is checked against a real browser rather than against the page.
 */

test("a team's phone holds the team token and nothing else, and forgets it on leaving", async ({
  browser,
  baseURL,
}) => {
  const { context: hostContext, api } = await signedInContext(browser, baseURL!);
  const { pack } = await (await api.post("/api/packs/seed")).json();
  const { session } = await (await api.post("/api/sessions", { data: { packId: pack.id } })).json();

  const teamContext = await newAnonContext(browser, baseURL);
  const team = await teamContext.newPage();
  await team.goto(`/play?code=${session.code}`);
  await team.getByLabel("Team name").fill("Storage Check");
  await team.getByRole("button", { name: "Join session" }).click();
  await expect(team.getByText("Sit tight.")).toBeVisible();

  const stored = await team.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    team: JSON.parse(localStorage.getItem("quiz-hub:team") ?? "null") as Record<string, unknown> | null,
  }));
  expect(stored.local).toEqual(["quiz-hub:team"]);
  expect(stored.session).toEqual([]);
  // /privacy: "the game's code, the team's name and the token".
  expect(stored.team).toMatchObject({ code: session.code, teamName: "Storage Check" });
  expect(typeof stored.team?.token).toBe("string");
  expect(await teamContext.cookies()).toEqual([]);

  await team.getByRole("button", { name: "Leave" }).click();
  await expect.poll(() => team.evaluate(() => Object.keys(localStorage))).toEqual([]);

  await teamContext.close();
  await hostContext.close();
});

test("the host desk keeps its key in browser storage, against the game's code", async ({
  browser,
  baseURL,
}) => {
  const { context: hostContext, api } = await signedInContext(browser, baseURL!);
  const { pack } = await (await api.post("/api/packs/seed")).json();
  const { session, hostToken } = await (
    await api.post("/api/sessions", { data: { packId: pack.id } })
  ).json();

  // A fresh page with nothing stored: the desk asks the server for this
  // creator's own key and keeps it, which is what lets it reconnect.
  const desk = await hostContext.newPage();
  await desk.goto(`/host/${session.code}`);
  await expect
    .poll(() => desk.evaluate(() => localStorage.getItem("quiz-hub:host-tokens")))
    .toBe(JSON.stringify({ [session.code]: hostToken }));
  expect(await desk.evaluate(() => Object.keys(sessionStorage))).toEqual([]);

  await hostContext.close();
});

test("/privacy describes that storage and Paddle's checkout cookies (L21)", async ({ page }) => {
  await page.goto("/privacy");
  const section = page.locator("#cookies");
  await expect(section.getByRole("heading", { name: "Cookies and browser storage" })).toBeVisible();

  const host = section.getByRole("listitem").filter({ hasText: /^The host key/ });
  await expect(host).toContainText("so the host desk can reconnect to the game");
  const team = section.getByRole("listitem").filter({ hasText: /^The team token/ });
  await expect(team).toContainText("removed when the team leaves the game");
  await expect(section).toContainText("the team token is the only thing we store on a team's phone");

  await expect(section).toContainText("Paddle's code is not loaded on any page until you press Subscribe");
  await expect(section).toContainText("it sets its own cookies");
});
