import { test, expect } from "@playwright/test";
import { newAnonContext, signedInApi } from "./sign-in-helper";

// Each question in a round has its own answer box, and a new question's box
// starts empty — it never inherits the text typed for the one before, which a
// team would then save against the wrong question without noticing. The
// earlier question keeps what the team saved for it.
test("a new question's answer box is empty; the last one keeps its answer", async ({ browser, baseURL }) => {
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
  const advance = async (action: string) => {
    const res = await api.post(`/api/sessions/${code}/advance`, { data: { action, hostToken } });
    expect(res.ok(), `advance ${action}: ${res.status()}`).toBeTruthy();
  };

  const teamContext = await newAnonContext(browser);
  const teamPage = await teamContext.newPage();
  await teamPage.goto("/play");
  await teamPage.getByLabel("Session code").fill(code);
  await teamPage.getByLabel("Team name").fill("Quiz Pigs");
  await teamPage.getByRole("button", { name: "Join session" }).click();
  await expect(teamPage.getByText("You’re in, Quiz Pigs.")).toBeVisible();

  await advance("start");
  await expect(teamPage.getByText(firstQuestion.text)).toBeVisible({ timeout: 10_000 });
  await teamPage.getByLabel("Answer to Round 1 · Q1").fill("Canberra");
  await teamPage.getByRole("button", { name: "Save" }).click();
  await expect(teamPage.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });

  await advance("ask_next");
  await expect(teamPage.getByText(secondQuestion.text)).toBeVisible({ timeout: 10_000 });
  await expect(teamPage.getByLabel("Answer to Round 1 · Q2")).toHaveValue("");

  await teamPage.getByText("Round 1 · Q1").click();
  await expect(teamPage.getByLabel("Answer to Round 1 · Q1")).toHaveValue("Canberra");

  await teamContext.close();
  await api.dispose();
});
