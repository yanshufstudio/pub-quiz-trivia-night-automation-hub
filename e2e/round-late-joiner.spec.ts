import { test, expect } from "@playwright/test";
import { newAnonApi, newAnonContext, signedInContext } from "./sign-in-helper";

/**
 * A team that joins while a round is being marked (RM13). It had no part in
 * that round, so its phone shows none of it — no column of "No answer" cards —
 * and the host's marks grid leaves it out. It plays from the next round.
 */
test("a team that joins during marking sits the round out and plays the next", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const { context, api } = await signedInContext(browser, baseURL!);
  const { pack } = await (await api.post("/api/packs/seed")).json();
  const { session, hostToken } = await (await api.post("/api/sessions", { data: { packId: pack.id } })).json();
  const code = session.code as string;
  const advance = (action: string) => api.post(`/api/sessions/${code}/advance`, { data: { action, hostToken } });

  // One team plays round 1 from the start.
  const earlyApi = await newAnonApi(baseURL!);
  const { token } = await (await earlyApi.post(`/api/sessions/${code}/join`, { data: { name: "On Time" } })).json();
  for (const action of ["start", "ask_next", "ask_next"]) await advance(action);
  await earlyApi.post(`/api/sessions/${code}/answers`, { data: { token, questionIndex: 0, text: "Canberra" } });
  await advance("close_round");

  // Another arrives while the host is marking.
  const teamContext = await newAnonContext(browser, baseURL);
  const phone = await teamContext.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`/play?code=${code}`);
  await phone.getByLabel("Team name").fill("Late Arrivals");
  await phone.getByRole("button", { name: "Join session" }).click();
  await expect(phone.getByText("You’ll play from round 2.")).toBeVisible({ timeout: 10_000 });
  await expect(phone.getByText("No answer")).toHaveCount(0);
  await expect(phone.getByText("What is the capital of Australia?")).toHaveCount(0);

  // The host's grid has the team that played, not the one that could not have.
  const desk = await context.newPage();
  await desk.goto(`/host/${code}`);
  const grid = desk.getByTestId("marks-grid");
  await expect(grid.getByRole("rowheader", { name: "On Time" })).toBeVisible({ timeout: 10_000 });
  await expect(grid.getByText("Late Arrivals")).toHaveCount(0);
  // It can still be given a typed total, for a team that played on a sheet.
  await expect(desk.getByLabel("Round 1 total for Late Arrivals")).toBeVisible();
  await expect(desk.getByText("No answers this round")).toBeVisible();

  await advance("reveal_all");
  await expect(phone.getByText("You’ll play from round 2.")).toBeVisible();
  await expect(phone.getByText(/Round 1 total/)).toHaveCount(0);
  await expect(phone.getByText(/^Answer:/)).toHaveCount(0);

  await advance("next_round");
  await expect(phone.getByLabel("Answer to Round 2 · Q1")).toBeVisible({ timeout: 10_000 });
  await expect(phone.getByText("You’ll play from round 2.")).toHaveCount(0);

  await teamContext.close();
  await context.close();
});
