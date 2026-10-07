import { test, expect, type Browser, type Page } from "@playwright/test";
import { newAnonContext, signedInContext } from "./sign-in-helper";

/**
 * A team's phone on a pub's patchy Wi-Fi, or locked in a pocket: it polls
 * every 3 s, asks at once when it is visible or online again, shows a calm
 * "Reconnecting…" while polls fail, says plainly when a save had no
 * connection, and a folded question with an unsaved answer says so.
 */

async function gameWithPhone(browser: Browser, baseURL: string, teamName: string) {
  const { context, api } = await signedInContext(browser, baseURL);
  const { pack } = await (await api.post("/api/packs/seed")).json();
  const { session, hostToken } = await (await api.post("/api/sessions", { data: { packId: pack.id } })).json();
  const code = session.code as string;
  const advance = (action: string) => api.post(`/api/sessions/${code}/advance`, { data: { action, hostToken } });

  const teamContext = await newAnonContext(browser, baseURL);
  const phone = await teamContext.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`/play?code=${code}`);
  await phone.getByLabel("Team name").fill(teamName);
  await phone.getByRole("button", { name: "Join session" }).click();
  await expect(phone.getByText(`You’re in, ${teamName}.`)).toBeVisible();
  const close = async () => {
    await teamContext.close();
    await context.close();
  };
  return { code, advance, phone, teamContext, close };
}

const isPoll = (code: string) => (url: string) => {
  const u = new URL(url);
  return u.pathname === `/api/sessions/${code}` && u.searchParams.has("token");
};

/** Right after a poll has answered, the next 3 s tick is about 3 s away. */
async function justAfterAPoll(phone: Page, code: string) {
  await phone.waitForResponse((res) => isPoll(code)(res.url()));
}

test("a save with no connection says so, keeps the answer, and saves once back online", async ({
  browser,
  baseURL,
}) => {
  const { advance, phone, teamContext, close } = await gameWithPhone(browser, baseURL!, "Saving Seals");
  await advance("start");
  const box = phone.getByLabel("Answer to Round 1 · Q1");
  await expect(box).toBeVisible({ timeout: 10_000 });
  await box.fill("Canberra");

  await teamContext.setOffline(true);
  await phone.getByRole("button", { name: "Save" }).click();
  await expect(phone.getByText("No connection, your answer was not saved")).toBeVisible();
  await expect(phone.getByText(/Failed to fetch|Load failed/)).toHaveCount(0);
  await expect(box).toHaveValue("Canberra");

  await teamContext.setOffline(false);
  await phone.getByRole("button", { name: "Save" }).click();
  await expect(phone.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });

  await close();
});
