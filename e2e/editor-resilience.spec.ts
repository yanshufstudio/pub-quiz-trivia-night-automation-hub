import { test, expect, type APIRequestContext } from "@playwright/test";
import { signedInContext } from "./sign-in-helper";
import { throttleIfAsked, waitForHydration } from "./hydration";
import { SIGNED_OUT_MESSAGE } from "@/app/packs/[id]/PackEditor";

/**
 * What the editor does when a save does not go through (M5).
 *
 * Saves happen on blur, in a burst of small requests, so the failure modes here are
 * ordinary rather than exotic: venue wifi drops, a laptop wakes up, a session
 * expires while the tab was open. Each of them used to end the same way — the row
 * said "Couldn't save", or sat on "Saving…" for ever, and the host's text was gone.
 */

async function importOwnedPack(api: APIRequestContext) {
  const res = await api.post("/api/packs/import", {
    data: {
      format: "pub-quiz-pack",
      version: 2,
      title: `Editor Resilience ${Date.now()}`,
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
  expect(res.ok(), `import failed: ${res.status()}`).toBeTruthy();
  return (await res.json()).pack as { id: string };
}

test("an expired session says so, instead of a generic couldn't-save", async ({ browser, baseURL }) => {
  const { context, api } = await signedInContext(browser, baseURL!);
  const pack = await importOwnedPack(api);
  const page = await context.newPage();
  await throttleIfAsked(page);

  // Every PATCH answers 401, as an expired session would.
  await page.route("**/api/questions/*", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Sign in to do that" }) })
      : route.continue()
  );

  await page.goto(`/packs/${pack.id}`);
  await waitForHydration(page);
  const text = page.getByLabel("Question text").first();
  await text.fill("Edited while signed out");
  await expect(text).toHaveValue("Edited while signed out");
  await text.blur();

  await expect(page.getByText(SIGNED_OUT_MESSAGE)).toBeVisible();
  // The point of saying it: the text is still on screen to save again.
  await expect(text).toHaveValue("Edited while signed out");
});

test("a transient failure is retried rather than lost", async ({ browser, baseURL }) => {
  const { context, api } = await signedInContext(browser, baseURL!);
  const pack = await importOwnedPack(api);
  const page = await context.newPage();
  await throttleIfAsked(page);

  // The first PATCH fails with a 500; everything after it goes through. Editing is
  // a burst of small saves, so one blip must not lose what was just typed.
  let patches = 0;
  await page.route("**/api/questions/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    patches += 1;
    if (patches === 1) {
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) });
    }
    return route.continue();
  });

  await page.goto(`/packs/${pack.id}`);
  await waitForHydration(page);
  const text = page.getByLabel("Question text").first();
  await text.fill("Saved on the second try");
  await expect(text).toHaveValue("Saved on the second try");
  await text.blur();

  await expect(page.getByText("Saved").first()).toBeVisible();
  expect(patches, "the 500 is retried, so there is more than one attempt").toBeGreaterThanOrEqual(2);

  // And it really is on the server, not just on screen. Polled rather than read
  // once: "Saved" appears when the response arrives, and asserting the database in
  // the same instant is a race this test does not exist to lose.
  await expect
    .poll(async () => JSON.stringify(await (await api.get(`/api/packs/${pack.id}`)).json()), {
      timeout: 10_000,
    })
    .toContain("Saved on the second try");
});

test("a 4xx is not retried, because retrying cannot help", async ({ browser, baseURL }) => {
  const { context, api } = await signedInContext(browser, baseURL!);
  const pack = await importOwnedPack(api);
  const page = await context.newPage();
  await throttleIfAsked(page);

  let patches = 0;
  await page.route("**/api/questions/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    patches += 1;
    return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Invalid update" }) });
  });

  await page.goto(`/packs/${pack.id}`);
  await waitForHydration(page);
  const text = page.getByLabel("Question text").first();
  await text.fill("Rejected outright");
  await expect(text).toHaveValue("Rejected outright");
  await text.blur();

  await expect(page.getByText("Couldn’t save").first()).toBeVisible();
  expect(patches, "a 400 will never succeed, so it is sent once").toBe(1);
});

test("leaving with an unsaved edit is guarded, and saving releases the guard", async ({
  browser,
  baseURL,
}) => {
  const { context, api } = await signedInContext(browser, baseURL!);
  const pack = await importOwnedPack(api);
  const page = await context.newPage();
  await throttleIfAsked(page);
  await page.goto(`/packs/${pack.id}`);
  await waitForHydration(page);

  /** Whether anything on the page would stop an unload. A cancelable
   * beforeunload whose default gets prevented is exactly what a browser acts on. */
  const unloadIsGuarded = () =>
    page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });

  // Nothing typed yet: leaving is free.
  expect(await unloadIsGuarded()).toBe(false);

  // Typed and not blurred — which is the dangerous shape, because saves happen on
  // blur and this edit has not been sent anywhere.
  const text = page.getByLabel("Question text").first();
  await text.fill("Typed but never blurred");
  await expect(text).toHaveValue("Typed but never blurred");
  expect(await unloadIsGuarded()).toBe(true);

  // Blur, let it save, and the guard lifts.
  await text.blur();
  await expect(page.getByText("Saved").first()).toBeVisible();
  expect(await unloadIsGuarded()).toBe(false);
});
