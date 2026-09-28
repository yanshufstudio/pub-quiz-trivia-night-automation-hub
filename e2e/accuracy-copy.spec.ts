import { test, expect } from "@playwright/test";
import { signedInContext } from "./sign-in-helper";
import { AI_DISCLAIMER } from "@/lib/ai-disclaimer";

/**
 * ACC3 and ACC4. The disclaimer is one line, the same wherever it appears,
 * and appears where the host is about to rely on the pack — not on the
 * sheets that go to the room. The brief tips are reachable from the box the
 * brief is typed into.
 */

test("the disclaimer is under Generate, at the top of every pack, and on /faq — not on the printed sheets", async ({
  browser,
  baseURL,
}) => {
  const { context, api } = await signedInContext(browser, baseURL!);
  const page = await context.newPage();

  await page.goto("/create");
  await expect(page.getByText(AI_DISCLAIMER)).toBeVisible();

  // An imported pack, which never went through generation, gets it too.
  const res = await api.post("/api/packs/import", {
    data: {
      format: "pub-quiz-pack",
      version: 2,
      title: `Disclaimer ${Date.now()}`,
      rounds: [
        {
          title: "Round One",
          category: "General",
          questions: [{ text: "What is the capital of Australia?", answer: "Canberra", points: 1, type: "TEXT" }],
        },
      ],
    },
  });
  expect(res.ok()).toBeTruthy();
  const { pack } = (await res.json()) as { pack: { id: string } };
  await page.goto(`/packs/${pack.id}`);
  await expect(page.getByText(AI_DISCLAIMER)).toBeVisible();

  await page.goto(`/packs/${pack.id}/print`);
  await expect(page.getByText("What is the capital of Australia?").first()).toBeVisible();
  await expect(page.getByText(AI_DISCLAIMER)).toHaveCount(0);

  await page.goto("/faq");
  const entry = page.locator("#accuracy");
  await expect(entry.getByRole("heading", { name: "Is every question right?" })).toBeVisible();
  await expect(entry).toContainText(AI_DISCLAIMER);

  await context.close();
});

test("/create links to the brief tips, and the tips are there", async ({ browser, baseURL }) => {
  const { context } = await signedInContext(browser, baseURL!);
  const page = await context.newPage();

  await page.goto("/create");
  await page.getByRole("link", { name: "Tips for a good brief" }).click();
  await expect(page).toHaveURL(/\/how-it-works#brief-tips$/);

  const tips = page.locator("#brief-tips");
  await expect(tips.getByRole("heading", { name: "How to write a good brief" })).toBeVisible();
  await expect(tips).toContainText("how many questions in each");
  await expect(tips).toContainText("friends in a pub, medium");
  await expect(tips).toContainText("Say the language, if it isn’t English.");
  await expect(tips).toContainText("3 rounds of 8 questions in Hebrew: Israeli history, Israeli pop music, food.");
  await expect(tips).toContainText("children aged 8–12");

  await context.close();
});

test("no public page says a pack is fact-checked — the review is internal", async ({ page }) => {
  for (const path of ["/", "/pricing", "/how-it-works", "/faq", "/terms"]) {
    await page.goto(path);
    const text = await page.locator("body").innerText();
    expect(text, path).not.toMatch(/fact[- ]?check|verified questions|guaranteed accura/i);
  }
});
