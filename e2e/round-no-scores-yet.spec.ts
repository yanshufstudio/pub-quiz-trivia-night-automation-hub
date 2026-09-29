import { test, expect } from "@playwright/test";
import { newAnonApi, newAnonContext, signedInContext } from "./sign-in-helper";

const NOT_YET = "Scores appear after the first round is revealed.";

/**
 * Before the first round is fully revealed, no round counts, so a ranking would
 * put every team 1st on 0 (RM14). The host's desk, the TV and the phones say
 * when scores will appear instead; the ranking arrives with the first round.
 */
test("before the first round is revealed, no screen ranks everyone 1st on 0", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const { context, api } = await signedInContext(browser, baseURL!);
  const { pack } = await (await api.post("/api/packs/seed")).json();
  const { session, hostToken } = await (await api.post("/api/sessions", { data: { packId: pack.id } })).json();
  const code = session.code as string;
  const advance = (action: string) => api.post(`/api/sessions/${code}/advance`, { data: { action, hostToken } });

  const phoneApi = await newAnonApi(baseURL!);
  const { token } = await (await phoneApi.post(`/api/sessions/${code}/join`, { data: { name: "Phone Team" } })).json();
  const teamContext = await newAnonContext(browser, baseURL);
  const phone = await teamContext.newPage();
  await phone.goto(`/play?code=${code}`);
  await phone.getByLabel("Team name").fill("Quizzly Bears");
  await phone.getByRole("button", { name: "Join session" }).click();
  await expect(phone.getByText("You’re in, Quizzly Bears.")).toBeVisible();

  const desk = await context.newPage();
  await desk.goto(`/host/${code}`);
  const tvContext = await newAnonContext(browser, baseURL);
  const tv = await tvContext.newPage();
  await tv.setViewportSize({ width: 1280, height: 720 });
  await tv.goto(`/tv/${code}`);

  await advance("start");
  await phoneApi.post(`/api/sessions/${code}/answers`, { data: { token, questionIndex: 0, text: "Canberra" } });
  await expect(desk.getByText(NOT_YET)).toBeVisible({ timeout: 10_000 });

  await advance("show_scoreboard");
  await expect(tv.getByText(NOT_YET)).toBeVisible({ timeout: 10_000 });
  await expect(phone.getByText(NOT_YET)).toBeVisible({ timeout: 10_000 });
  await expect(tv.getByText("Phone Team")).toHaveCount(0);

  for (const action of ["ask_next", "ask_next", "close_round", "reveal_all"]) await advance(action);
  await expect(tv.getByText("Phone Team")).toBeVisible({ timeout: 10_000 });
  await expect(tv.getByText(NOT_YET)).toHaveCount(0);
  await expect(desk.getByText(NOT_YET)).toHaveCount(0);
  await expect(phone.getByText(NOT_YET)).toHaveCount(0);

  await phoneApi.dispose();
  await teamContext.close();
  await tvContext.close();
  await context.close();
});
