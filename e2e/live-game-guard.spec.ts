import { test, expect } from "@playwright/test";
import { signedInContext } from "./sign-in-helper";

/**
 * The editor refuses to restructure a pack that is being played, the host desk
 * offers a way to end the game, and the refusal lifts once it is ended
 * (H5/H6/L9).
 *
 * Driven through the two real surfaces rather than the API, because the part
 * worth proving is that a host sees the reason and can act on it. The API's own
 * refusals are covered per-route in
 * src/test/live-game-guard.integration.test.ts.
 */

const LIVE_GAME_MESSAGE = "This pack has a live game. End the game first.";

/** A pack the signed-in host owns. The demo pack is ownerless — every host can
 * read it and none can edit it — so importing is how a spec gets an editable
 * one. */
async function importOwnedPack(api: import("@playwright/test").APIRequestContext) {
  const res = await api.post("/api/packs/import", {
    data: {
      format: "pub-quiz-pack",
      version: 2,
      title: `Live Guard E2E ${Date.now()}`,
      rounds: [
        {
          title: "Round One",
          category: "General Knowledge",
          questions: [
            { text: "What is the capital of Australia?", answer: "Canberra", points: 1, type: "TEXT" },
            { text: "How many strings has a violin?", answer: "Four", points: 1, type: "TEXT" },
          ],
        },
      ],
    },
  });
  expect(res.ok(), `import failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const { pack } = await res.json();
  return pack as { id: string };
}

test("a live game blocks structural edits until the host ends it", async ({ browser, baseURL }) => {
  const { context, api } = await signedInContext(browser, baseURL!);
  const pack = await importOwnedPack(api);
  const page = await context.newPage();

  await page.goto(`/packs/${pack.id}`);
  const addQuestion = page.getByRole("button", { name: "+ Add question" });

  // Baseline: with no session on the pack, adding a question works. Without
  // this the test could pass against an editor that never adds one at all.
  await expect(addQuestion).toBeVisible();
  await expect(page.getByLabel("Question text")).toHaveCount(2);
  await addQuestion.click();
  await expect(page.getByText(LIVE_GAME_MESSAGE)).toHaveCount(0);
  await expect(page.getByLabel("Question text")).toHaveCount(3);

  // Start the game the way a host does.
  await page.getByRole("button", { name: "Start live session" }).click();
  await page.waitForURL(/\/host\//);
  const code = page.url().split("/host/")[1];
  expect(code).toMatch(/^[A-Z0-9]{5}$/);

  // Back in the editor, the same button now refuses — and says why, in the
  // words the host can act on.
  await page.goto(`/packs/${pack.id}`);
  await expect(page.getByLabel("Question text")).toHaveCount(3);
  await page.getByRole("button", { name: "+ Add question" }).click();
  await expect(page.getByText(LIVE_GAME_MESSAGE)).toBeVisible();
  // Refused, not merely reported: no fourth question appeared.
  await expect(page.getByLabel("Question text")).toHaveCount(3);

  // The host desk offers the way out, behind a confirmation: this screen sits
  // on a TV in reach of the room, and ending a game cannot be undone.
  await page.goto(`/host/${code}`);
  await page.getByRole("button", { name: "End game" }).click();
  await expect(page.getByRole("heading", { name: "End this game for everyone?" })).toBeVisible();

  // Backing out leaves the game running.
  await page.getByRole("button", { name: "Keep playing" }).click();
  await expect(page.getByRole("heading", { name: "End this game for everyone?" })).toHaveCount(0);

  await page.getByRole("button", { name: "End game" }).click();
  await page.getByRole("button", { name: "Yes, end the game" }).click();

  // Ended: the control retires itself, because there is nothing left to end.
  await expect(page.getByRole("button", { name: "End game" })).toHaveCount(0, { timeout: 10_000 });

  // And the editor is free again.
  await page.goto(`/packs/${pack.id}`);
  await page.getByRole("button", { name: "+ Add question" }).click();
  await expect(page.getByLabel("Question text")).toHaveCount(4);
  await expect(page.getByText(LIVE_GAME_MESSAGE)).toHaveCount(0);
});
