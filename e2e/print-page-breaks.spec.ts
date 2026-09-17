import { test, expect, request } from "@playwright/test";

/**
 * The browser print page (/packs/<id>/print) is the twin of the PDF
 * documents, and it kept the page-break policy the PDF renderer was fixed
 * out of in `a763086`: every round carried `break-inside-avoid`, so a round
 * taller than a sheet — which is what the wizard's own default brief
 * produces, ten questions to a round — was a block the browser could not fit
 * anywhere and therefore broke wherever it happened to land, mid-question
 * included. A quizmaster printing that walks into the room with questions cut
 * in half across the fold.
 *
 * `src/test/pdf-layout.integration.test.ts` guards the same policy on the PDF
 * side by counting react-pdf's overflow warnings. There is no equivalent
 * warning from a browser, so this reads the policy back off the computed
 * styles under print emulation: the round must be breakable, the question
 * must not be. That is the rule that was wrong, stated directly.
 */

const FULL_SIZE_PACK = {
  format: "pub-quiz-pack",
  version: 2,
  title: `Print Page Break Pack ${Math.random().toString(36).slice(2)}`,
  prompt: "print page-break test",
  // Four rounds of ten: the size the default brief generates, and the size at
  // which a round stops fitting on a sheet. The 2x5 demo pack every other
  // spec seeds fits on one page and so never exercises any of this.
  rounds: Array.from({ length: 4 }, (_, r) => ({
    title: `Round ${r + 1} Title`,
    category: "General Knowledge",
    questions: Array.from({ length: 10 }, (_, q) => ({
      text: `Which long-running quiz question, number ${q + 1} of round ${r + 1}, asks something with enough words in it to wrap onto a second line?`,
      answer: `The answer to round ${r + 1} question ${q + 1}`,
      points: 1,
      type: "TEXT" as const,
    })),
  })),
};

// The three tabs, and the element that holds one question in each of them.
const TABS = [
  { label: "Presenter script", question: "li" },
  { label: "Answer sheet", question: "tbody tr" },
  { label: "Question sheet", question: "li" },
] as const;

async function breakInside(page: import("@playwright/test").Page, selector: string) {
  return page.evaluate(
    (sel) =>
      [...document.querySelectorAll<HTMLElement>(sel)].map((el) => getComputedStyle(el).breakInside),
    selector
  );
}

test.describe("print page breaks at the size the default brief generates", () => {
  let packId: string;

  test.beforeAll(async ({ baseURL }) => {
    const api = await request.newContext({ baseURL });
    const res = await api.post("/api/packs/import", { data: FULL_SIZE_PACK });
    expect(res.status()).toBe(201);
    packId = (await res.json()).pack.id;
    await api.dispose();
  });

  for (const tab of TABS) {
    test(`${tab.label}: rounds flow, questions stay whole`, async ({ page }) => {
      await page.goto(`/packs/${packId}/print`);
      await page.getByRole("button", { name: tab.label }).click();
      await page.emulateMedia({ media: "print" });

      const article = "article.paper-sheet";
      const rounds = await breakInside(page, `${article} section`);
      expect(rounds).toHaveLength(4);
      // A round is taller than a page here. Asking for it whole is asking for
      // something impossible, and the browser answers by breaking it badly.
      expect(rounds.every((v) => v !== "avoid")).toBe(true);

      const questions = await breakInside(page, `${article} section ${tab.question}`);
      expect(questions).toHaveLength(40);
      expect(questions.every((v) => v === "avoid")).toBe(true);
    });
  }

  // Without this the whole file could pass against a page that never rendered
  // the layout at all, or against a browser that reports `breakInside` as
  // something this spec never compares against. Put the old policy back on a
  // round and confirm the same read does report it.
  test("the break-inside check itself detects the old policy", async ({ page }) => {
    await page.goto(`/packs/${packId}/print`);
    await page.emulateMedia({ media: "print" });

    const article = "article.paper-sheet";
    expect((await breakInside(page, `${article} section`)).every((v) => v !== "avoid")).toBe(true);

    await page.evaluate((sel) => {
      document.querySelector<HTMLElement>(`${sel} section`)!.style.breakInside = "avoid";
    }, article);

    expect((await breakInside(page, `${article} section`)).some((v) => v === "avoid")).toBe(true);
  });
});
