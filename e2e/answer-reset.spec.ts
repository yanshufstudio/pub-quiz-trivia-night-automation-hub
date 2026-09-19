import { test, expect } from "@playwright/test";
import { newAnonContext, signedInApi } from "./sign-in-helper";

// Regression test: the answer box must not carry the previous question's
// text into the next question. Before the fix, refresh() copied myAnswer.text
// into local state during REVEAL and nothing cleared it when the host
// advanced, so the next question opened pre-filled with the stale answer and
// a team could submit it by accident.
//
// The host side is driven through the API (see tie-ending.spec.ts for why);
// the team side is the real polling portal, which is the code under test.
test("team's answer box is empty when the next question arrives", async ({ browser, baseURL }) => {
  // The host is signed in; the team context below deliberately is not.
  const api = await signedInApi(baseURL!);
  const seedRes = await api.post("/api/packs/seed");
  expect(seedRes.ok()).toBeTruthy();
  const { pack } = (await seedRes.json()) as {
    pack: { id: string; rounds: { questions: { text: string }[] }[] };
  };
  const [firstQuestion, secondQuestion] = pack.rounds[0].questions;

  const sessionRes = await api.post("/api/sessions", { data: { packId: pack.id } });
  const { session, hostToken } = await sessionRes.json();
  const code = session.code as string;
  const advance = async (action: "start" | "reveal" | "next") => {
    const res = await api.post(`/api/sessions/${code}/advance`, { data: { action, hostToken } });
    expect(res.ok(), `advance ${action}: ${res.status()}`).toBeTruthy();
  };

  const teamContext = await newAnonContext(browser);
  const teamPage = await teamContext.newPage();
  await teamPage.goto("/play");
  await teamPage.getByLabel("Session code").fill(code);
  await teamPage.getByLabel("Team name").fill("Quiz Pigs");
  await teamPage.getByRole("button", { name: "Join session" }).click();
  await expect(teamPage.getByText("Sit tight.")).toBeVisible();

  await advance("start");
  await expect(teamPage.getByText(firstQuestion.text)).toBeVisible({ timeout: 10_000 });
  await teamPage.getByLabel("Your answer").fill("Canberra");
  await teamPage.getByRole("button", { name: "Submit answer" }).click();

  // Existing behaviour: on the same question the submitted answer stays
  // pre-filled so the team can update it.
  await expect(teamPage.getByRole("button", { name: "Update answer" })).toBeVisible({ timeout: 10_000 });
  await expect(teamPage.getByLabel("Your answer")).toHaveValue("Canberra");

  await advance("reveal");
  await expect(teamPage.getByText("You said: Canberra")).toBeVisible({ timeout: 10_000 });

  await advance("next");
  await expect(teamPage.getByText(secondQuestion.text)).toBeVisible({ timeout: 10_000 });

  // The new question starts clean: nothing pre-filled, fresh submit button.
  await expect(teamPage.getByLabel("Your answer")).toHaveValue("");
  await expect(teamPage.getByRole("button", { name: "Submit answer" })).toBeVisible();
  await expect(teamPage.getByRole("button", { name: "Submit answer" })).toBeDisabled();

  await teamContext.close();
  await api.dispose();
});
