import { test, expect } from "@playwright/test";
import { newAnonContext, signedInContext } from "./sign-in-helper";

/**
 * A team's phone in a round-mode game (RM8): every question asked so far, the
 * newest on top; "Saved" per answer; changeable until the round closes; then
 * the answers and the team's own marks as the host reveals them.
 */
test("a team answers a round on its phone", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const { context, api } = await signedInContext(browser, baseURL!);
  const { pack } = await (await api.post("/api/packs/seed")).json();
  const { session, hostToken } = await (await api.post("/api/sessions", { data: { packId: pack.id } })).json();
  const code = session.code as string;
  const advance = (action: string) => api.post(`/api/sessions/${code}/advance`, { data: { action, hostToken } });

  const teamContext = await newAnonContext(browser, baseURL);
  const phone = await teamContext.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`/play?code=${code}`);
  await phone.getByLabel("Team name").fill("Quizzly Bears");
  await phone.getByRole("button", { name: "Join session" }).click();
  await expect(phone.getByText("You’re in, Quizzly Bears.")).toBeVisible();
  // Nothing about a question before the host starts.
  await expect(phone.getByText("What is the capital of Australia?")).toHaveCount(0);

  await advance("start");
  const q1 = phone.getByLabel("Answer to Round 1 · Q1");
  await expect(q1).toBeVisible({ timeout: 10_000 });
  await expect(q1).toHaveAttribute("dir", "auto");
  await expect(phone.getByRole("heading", { name: "What is the capital of Australia?" })).toHaveAttribute("dir", "auto");
  await q1.fill("Sydney");
  await phone.getByRole("button", { name: "Save" }).click();
  await expect(phone.getByText("Saved", { exact: true })).toBeVisible();

  // The next question arrives on top; the first folds away, still saved.
  await advance("ask_next");
  await expect(phone.getByLabel("Answer to Round 1 · Q2")).toBeVisible({ timeout: 10_000 });
  const labels = await phone.locator("ol > li").evaluateAll((items) =>
    items.map((li) => li.textContent?.match(/Round 1 · Q\d/)?.[0])
  );
  expect(labels).toEqual(["Round 1 · Q2", "Round 1 · Q1"]);

  // Change of mind on Q1, until the round closes.
  await phone.getByText("Round 1 · Q1").click();
  await phone.getByLabel("Answer to Round 1 · Q1").fill("Canberra");
  await phone.getByLabel("Answer to Round 1 · Q1").press("Enter");
  await expect(phone.getByLabel("Answer to Round 1 · Q1")).toHaveValue("Canberra");

  await advance("ask_next");
  await advance("close_round");
  await expect(phone.getByText("Answers are in.", { exact: false })).toBeVisible({ timeout: 10_000 });
  await expect(phone.getByRole("textbox")).toHaveCount(0);
  await expect(phone.getByText(/Correct|Not this time/)).toHaveCount(0);

  await advance("reveal_next");
  await expect(phone.getByText("Correct · +1")).toBeVisible({ timeout: 10_000 });
  await expect(phone.getByText("Answer: Canberra")).toBeVisible();
  await expect(phone.getByText("Answer: Seven")).toHaveCount(0);

  await advance("reveal_all");
  await expect(phone.getByText("Round 1 total: 1 point")).toBeVisible({ timeout: 10_000 });
  await expect(phone.getByRole("heading", { name: "Scoreboard" })).toHaveCount(0);
  await advance("show_scoreboard");
  await expect(phone.getByRole("heading", { name: "Scoreboard" })).toBeVisible({ timeout: 10_000 });

  await teamContext.close();
  await context.close();
});
