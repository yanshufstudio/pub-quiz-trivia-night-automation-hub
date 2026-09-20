import { test, expect } from "@playwright/test";
import { newAnonContext, signedInContext } from "./sign-in-helper";

/**
 * The host desk goes on the pub TV, so this spec asserts what the *room* can
 * read off the wall while a question is still open — not what the host is
 * entitled to know.
 *
 * Before this, the desk showed each team's answer text, a green "+1" or a red
 * "0", and Correct/Wrong buttons during QUESTION_ACTIVE. The first team to
 * answer correctly therefore published the answer to everyone else, and since
 * a team may resubmit, the rest of the room could copy it off the screen and
 * still score.
 *
 * The demo pack's first question is "What is the capital of Australia?",
 * answer "Canberra".
 */
test("the desk shows only who has answered until the host reveals", async ({ browser, baseURL }) => {
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

  await hostPage.getByRole("button", { name: "Start quiz" }).click();
  await expect(hostPage.getByText("What is the capital of Australia?")).toBeVisible();

  await teamPage.getByRole("textbox").fill("Canberra");
  await teamPage.getByRole("button", { name: /submit/i }).click();

  const desk = hostPage.locator("aside");
  // The host must still be able to see that Alpha is in.
  await expect(desk.getByText("Answered")).toBeVisible();

  // ...and the room must not be able to read anything else off the wall.
  await expect(desk.getByText("Canberra")).toHaveCount(0);
  await expect(desk.getByText("+1")).toHaveCount(0);
  await expect(hostPage.getByRole("button", { name: "Correct" })).toHaveCount(0);
  await expect(hostPage.getByRole("button", { name: "Wrong" })).toHaveCount(0);

  // Reloaded first, so this reads the host page's own document rather than
  // what the client router left behind. The host reaches the desk from
  // /packs/<id> — the editor, which legitimately shows answers to the pack's
  // owner — and that page's RSC payload stays in the document as inert JSON
  // across the client-side navigation. It is not rendered, so it is not on
  // the TV; asserting against it would be asserting against the wrong page.
  await hostPage.reload();
  await expect(desk.getByText("Answered")).toBeVisible();
  expect(await hostPage.content()).not.toContain("Canberra");

  await hostPage.getByRole("button", { name: /reveal/i }).click();

  // From the reveal on, the host gets the full picture back — the text, the
  // score, and the override buttons they adjudicate with.
  await expect(desk.getByText("Canberra")).toBeVisible();
  await expect(desk.getByText("+1")).toBeVisible();
  await expect(hostPage.getByRole("button", { name: "Correct" })).toBeVisible();
  await expect(hostPage.getByRole("button", { name: "Wrong" })).toBeVisible();

  await hostContext.close();
});
