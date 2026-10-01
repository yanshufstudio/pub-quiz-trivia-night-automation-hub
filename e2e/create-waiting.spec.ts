import { test, expect, type Page, type Route } from "@playwright/test";
import { signedInContext } from "./sign-in-helper";

/**
 * PRC3. A pack now takes 15-50 s (ACC5: generation, then the accuracy check),
 * and /create used to show nothing but "Generating…" for all of it. While
 * busy it now says what is happening, how long it has been, and — past three
 * minutes — that it is slower than usual. The status is announced politely;
 * the timer is not, so a screen reader is not read a number every second.
 * The model is never called: the route is held open by the test.
 */

const LINE = "Writing and fact-checking your pack. This usually takes up to about a minute. Keep this tab open.";

/** Holds /api/packs/generate open until the test replies. */
function holdGenerate(page: Page) {
  const route = new Promise<Route>((resolve) => {
    void page.route("**/api/packs/generate", (r) => resolve(r));
  });
  return {
    reply: async (status: number, body: unknown) =>
      (await route).fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }),
  };
}

test("while generating: the line, a timer and a status that moves on with time; cleared on an error", async ({
  browser,
  baseURL,
}) => {
  const { context } = await signedInContext(browser, baseURL!);
  const page = await context.newPage();
  await page.clock.install({ time: new Date("2026-09-29T10:00:00Z") });
  await page.goto("/create");
  const held = holdGenerate(page);

  const button = page.getByRole("button", { name: /Generat/ });
  await button.click();

  const status = page.getByRole("status");
  const timer = page.getByTestId("generate-elapsed");
  await expect(button).toBeDisabled();
  await expect(page.getByText(LINE)).toBeVisible();
  await expect(status).toHaveText("Writing questions…");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(timer).toHaveText("0:00");
  await expect(timer).toHaveAttribute("aria-hidden", "true");

  await page.clock.fastForward(30_000);
  await expect(timer).toHaveText("0:30");
  await expect(status).toHaveText("Checking facts…");
  await expect(button).toBeDisabled();

  await page.clock.fastForward(30_000);
  await expect(timer).toHaveText("1:00");
  await expect(status).toHaveText("Almost done…");

  await page.clock.fastForward(121_000);
  await expect(timer).toHaveText("3:01");
  await expect(status).toHaveText("Still working, taking longer than usual.");
  await expect(button).toBeDisabled();
  // No invented progress: nothing on the page claims a percentage.
  await expect(page.getByText(/\d+\s?%/)).toHaveCount(0);

  await held.reply(502, { error: "Couldn't generate a quiz pack right now. Please try again." });
  await expect(page.getByText("Couldn't generate a quiz pack right now. Please try again.")).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(timer).toHaveCount(0);
  await expect(page.getByText(LINE)).toHaveCount(0);
  await expect(button).toBeEnabled();

  await context.close();
});

test("the waiting state goes away when the pack arrives", async ({ browser, baseURL }) => {
  const { context, api } = await signedInContext(browser, baseURL!);
  const page = await context.newPage();

  // A real pack for the success response to point at, without the model.
  const imported = await api.post("/api/packs/import", {
    data: {
      format: "pub-quiz-pack",
      version: 2,
      title: `Waiting ${Date.now()}`,
      rounds: [
        {
          title: "Round One",
          category: "General",
          questions: [{ text: "What is the capital of Australia?", answer: "Canberra", points: 1, type: "TEXT" }],
        },
      ],
    },
  });
  expect(imported.ok()).toBeTruthy();
  const { pack } = (await imported.json()) as { pack: { id: string } };

  await page.goto("/create");
  const held = holdGenerate(page);
  await page.getByRole("button", { name: "Generate pack" }).click();
  await expect(page.getByRole("status")).toHaveText("Writing questions…");

  await held.reply(201, { pack: { id: pack.id } });
  await expect(page).toHaveURL(new RegExp(`/packs/${pack.id}$`));
  await expect(page.getByText(LINE)).toHaveCount(0);
  await expect(page.getByTestId("generate-elapsed")).toHaveCount(0);

  await context.close();
});

test("the waiting indicator does not animate under prefers-reduced-motion", async ({ browser, baseURL }) => {
  const { context } = await signedInContext(browser, baseURL!);
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/create");
  holdGenerate(page);
  await page.getByRole("button", { name: "Generate pack" }).click();

  const dot = page.getByTestId("generate-pulse");
  await expect(dot).toBeVisible();
  expect(await dot.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(await dot.evaluate((el) => getComputedStyle(el).animationName)).not.toBe("none");

  await context.close();
});
