import { test, expect } from "@playwright/test";
import { signedInContext } from "./sign-in-helper";

/**
 * A paper team with no total for the round scores 0 for it. On a real night
 * round 2 had no total typed for the paper team, and "Reveal all" and
 * "Finish" both went ahead without a word. Both now say which paper teams
 * have no total, and still let the host carry on.
 */
test("Reveal all and Finish name the paper teams with no round total", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const { context, api } = await signedInContext(browser, baseURL!);
  const { pack } = await (await api.post("/api/packs/seed")).json();
  const { session, hostToken } = await (await api.post("/api/sessions", { data: { packId: pack.id } })).json();
  const code = session.code as string;
  const advance = (action: string) => api.post(`/api/sessions/${code}/advance`, { data: { action, hostToken } });
  const addPaper = async (name: string) =>
    (await (await api.post(`/api/sessions/${code}/teams`, { data: { hostToken, name } })).json()).team.id as string;
  const typeTotal = (teamId: string, roundIndex: number, points: number) =>
    api.put(`/api/sessions/${code}/round-scores`, { data: { hostToken, teamId, roundIndex, points } });

  await addPaper("The Pencils");
  const crayons = await addPaper("The Crayons");

  await advance("start");
  await advance("ask_next");
  await advance("ask_next");
  await advance("close_round");
  // One paper team has its round 1 total; the other does not.
  expect((await typeTotal(crayons, 0, 2)).ok()).toBe(true);

  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/host/${code}`);
  const bar = page.getByTestId("primary-action");

  // Reveal all: warned, by name, and only about the team with no total.
  await page.getByRole("button", { name: "Reveal all" }).click();
  await expect(bar).toContainText("The Pencils");
  await expect(bar).not.toContainText("The Crayons");
  await expect(bar.getByRole("button", { name: "Keep marking" })).toBeFocused();
  await bar.getByRole("button", { name: "Keep marking" }).click();
  await expect(page.getByText("0 of 3 answers revealed", { exact: false })).toBeVisible();

  // And the host can carry on anyway.
  await page.getByRole("button", { name: "Reveal all" }).click();
  await bar.getByRole("button", { name: "Yes, reveal all" }).click();
  await expect(page.getByText("3 of 3 answers revealed", { exact: false })).toBeVisible({ timeout: 10_000 });

  // Round 2: neither paper team has a total.
  await advance("next_round");
  await advance("ask_next");
  await advance("ask_next");
  await advance("close_round");
  await advance("reveal_all");
  await page.reload();
  await bar.getByRole("button", { name: "Finish quiz…" }).click();
  await expect(bar).toContainText("No round 2 total for");
  await expect(bar).toContainText("The Pencils");
  await expect(bar).toContainText("The Crayons");
  await bar.getByRole("button", { name: "Yes, finish the quiz" }).click();
  await expect(page.getByText(/Tonight’s champion/)).toBeVisible({ timeout: 10_000 });

  await context.close();
});

test("Reveal all goes straight ahead when every paper team has its total", async ({ browser, baseURL }) => {
  const { context, api } = await signedInContext(browser, baseURL!);
  const { pack } = await (await api.post("/api/packs/seed")).json();
  const { session, hostToken } = await (await api.post("/api/sessions", { data: { packId: pack.id } })).json();
  const code = session.code as string;
  const advance = (action: string) => api.post(`/api/sessions/${code}/advance`, { data: { action, hostToken } });
  const { team } = await (await api.post(`/api/sessions/${code}/teams`, { data: { hostToken, name: "The Pens" } })).json();

  await advance("start");
  await advance("ask_next");
  await advance("ask_next");
  await advance("close_round");
  await api.put(`/api/sessions/${code}/round-scores`, { data: { hostToken, teamId: team.id, roundIndex: 0, points: 3 } });

  const page = await context.newPage();
  await page.goto(`/host/${code}`);
  await page.getByRole("button", { name: "Reveal all" }).click();
  await expect(page.getByText("3 of 3 answers revealed", { exact: false })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Yes, reveal all" })).toHaveCount(0);
  // Next round too.
  await page.getByTestId("primary-action").getByRole("button", { name: "Next round" }).click();
  await expect(page.getByText("Round 2 · Q1 of 3")).toBeVisible({ timeout: 10_000 });

  await context.close();
});

test("revealing the last answer one at a time, and Next round, warn about a missing total too", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const { context, api } = await signedInContext(browser, baseURL!);
  const { pack } = await (await api.post("/api/packs/seed")).json();
  const { session, hostToken } = await (await api.post("/api/sessions", { data: { packId: pack.id } })).json();
  const code = session.code as string;
  const advance = (action: string) => api.post(`/api/sessions/${code}/advance`, { data: { action, hostToken } });
  await api.post(`/api/sessions/${code}/teams`, { data: { hostToken, name: "The Pencils" } });
  await advance("start");
  await advance("ask_next");
  await advance("ask_next");
  await advance("close_round");

  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/host/${code}`);
  const bar = page.getByTestId("primary-action");
  const note = "No round 1 total for The Pencils. They score 0 for it unless you type one.";

  // The first two reveals go straight ahead: the round is not over yet.
  await bar.getByRole("button", { name: "Reveal next answer" }).click();
  await expect(page.getByText("1 of 3 answers revealed", { exact: false })).toBeVisible({ timeout: 10_000 });
  await bar.getByRole("button", { name: "Reveal next answer" }).click();
  await expect(page.getByText("2 of 3 answers revealed", { exact: false })).toBeVisible({ timeout: 10_000 });

  // The last one says what Reveal all would have said.
  await bar.getByRole("button", { name: "Reveal next answer" }).click();
  await expect(bar).toContainText(note);
  await expect(bar.getByRole("button", { name: "Keep marking" })).toBeFocused();
  await bar.getByRole("button", { name: "Keep marking" }).click();
  await expect(page.getByText("2 of 3 answers revealed", { exact: false })).toBeVisible();
  await bar.getByRole("button", { name: "Reveal next answer" }).click();
  await bar.getByRole("button", { name: "Yes, reveal it" }).click();
  await expect(page.getByText("3 of 3 answers revealed", { exact: false })).toBeVisible({ timeout: 10_000 });

  // And so does Next round, which still lets the host go on.
  await bar.getByRole("button", { name: "Next round" }).click();
  await expect(bar).toContainText(note);
  await bar.getByRole("button", { name: "Not yet" }).click();
  await expect(page.getByText("3 of 3 answers revealed", { exact: false })).toBeVisible();
  await bar.getByRole("button", { name: "Next round" }).click();
  await bar.getByRole("button", { name: "Yes, next round" }).click();
  await expect(page.getByText("Round 2 · Q1 of 3")).toBeVisible({ timeout: 10_000 });

  await context.close();
});
