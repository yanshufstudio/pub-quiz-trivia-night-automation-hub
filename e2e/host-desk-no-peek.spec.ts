import { test, expect } from "@playwright/test";
import { newAnonContext, signedInContext } from "./sign-in-helper";

/**
 * While a round is open, the host desk says who has answered and never what.
 *
 * The one-question desk went on the pub TV, and showing each team's answer
 * there published the first right answer to the room. A round-mode game has
 * its own TV view (/tv/CODE), but a host can still mirror a laptop by mistake,
 * so the desk keeps the rule while answers can still change: counts only.
 * From the close of the round it is the host's private marking view, with
 * every answer and the key.
 *
 * The demo pack's first question is "What is the capital of Australia?",
 * answer "Canberra".
 */
test("the desk shows only who has answered until the round closes", async ({ browser, baseURL }) => {
  // The desk is a host page, so the browser driving it needs a session —
  // and shares one with the API context that seeds the pack.
  const { context: hostContext, api } = await signedInContext(browser, baseURL!);
  const { pack } = await (await api.post("/api/packs/seed")).json();

  const hostPage = await hostContext.newPage();
  await hostPage.goto(`/packs/${pack.id}`);
  await hostPage.getByRole("button", { name: "Start live session" }).click();
  await hostPage.waitForURL(/\/host\//);
  const code = hostPage.url().split("/host/")[1];

  const teamPage = await (await newAnonContext(browser)).newPage();
  await teamPage.goto("/play");
  await teamPage.getByLabel(/code/i).fill(code);
  await teamPage.getByLabel(/team name/i).fill("Alpha");
  await teamPage.getByRole("button", { name: /join/i }).click();

  await hostPage.getByTestId("primary-action").getByRole("button", { name: "Start quiz" }).click();
  await expect(hostPage.getByText("What is the capital of Australia?")).toBeVisible();

  await teamPage.getByLabel("Answer to Round 1 · Q1").fill("Canberra");
  await teamPage.getByRole("button", { name: "Save" }).click();

  // The host must still be able to see that Alpha is in...
  await expect(hostPage.getByText("1 of 1 phone teams have answered this one.")).toBeVisible({ timeout: 10_000 });
  // ...and nothing else can be read off the screen.
  await expect(hostPage.getByText("Canberra")).toHaveCount(0);

  // Reloaded first, so this reads the host page's own document rather than
  // what the client router left behind: the editor this desk was reached from
  // legitimately shows answers to the pack's owner, and its RSC payload stays
  // in the document as inert JSON across the client-side navigation.
  await hostPage.reload();
  await expect(hostPage.getByText("1 of 1 phone teams have answered this one.")).toBeVisible({ timeout: 10_000 });
  expect(await hostPage.content()).not.toContain("Canberra");

  // From the close, the host gets the marking view: the answer and its mark.
  const primary = hostPage.getByTestId("primary-action");
  await primary.getByRole("button", { name: "Ask next question" }).click();
  await primary.getByRole("button", { name: "Ask next question" }).click();
  await primary.getByRole("button", { name: "Close round…" }).click();
  await hostPage.getByRole("button", { name: "Yes, close the round" }).click();
  await expect(hostPage.getByTestId("marks-grid").getByText("Canberra")).toBeVisible();

  await hostContext.close();
});
