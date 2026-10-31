import { test, expect, type BrowserContext } from "@playwright/test";
import { signedInContext } from "./sign-in-helper";

/**
 * A small pack prints on one page. A 1-round, 3-question pack printed two
 * pages, the second blank, because the on-screen sheet's minimum height is
 * taller than a printed page. And the Host answer key's "ANSWER" header broke
 * mid-word ("ANS / WER") when long questions squeezed the answer column.
 */

function onePack(question: (q: number) => string) {
  return {
    format: "pub-quiz-pack",
    version: 2,
    title: `Print Fit Pack ${Math.random().toString(36).slice(2)}`,
    prompt: "print fit test",
    rounds: [
      {
        title: "Only Round",
        category: "General Knowledge",
        questions: Array.from({ length: 3 }, (_, q) => ({
          text: question(q),
          answer: `${q + 1}`,
          points: 1,
          type: "TEXT" as const,
        })),
      },
    ],
  };
}

// The size of the seed pack's rounds.
const SMALL_PACK = onePack((q) => `What is question number ${q + 1}?`);
// Long questions leave the answer column as narrow as it gets.
const WIDE_QUESTIONS_PACK = onePack(
  (q) => `Question ${q + 1}: which long-winded quiz question takes up most of the width of the answer key, so that the answer column is left as narrow as it can be?`
);

const SHEETS = ["Presenter script", "Host answer key", "Team answer sheet"] as const;
const PAPERS = [
  { format: "A4", landscape: false },
  { format: "Letter", landscape: false },
  { format: "A4", landscape: true },
] as const;

/** Page objects in a PDF; `/Type /Pages` (the tree's root) is not one. */
function pageCount(pdf: Buffer) {
  return pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g)?.length ?? 0;
}

let context: BrowserContext;
let packId: string;
let widePackId: string;

test.beforeAll(async ({ browser, baseURL }) => {
  const signedIn = await signedInContext(browser, baseURL!);
  context = signedIn.context;
  const ids = [];
  for (const data of [SMALL_PACK, WIDE_QUESTIONS_PACK]) {
    const res = await signedIn.api.post("/api/packs/import", { data });
    expect(res.status()).toBe(201);
    ids.push((await res.json()).pack.id as string);
  }
  [packId, widePackId] = ids;
});

test.afterAll(async () => {
  await context.close();
});

for (const sheet of SHEETS) {
  test(`${sheet}: a 1-round, 3-question pack prints on one page`, async () => {
    const page = await context.newPage();
    await page.goto(`/packs/${packId}/print`);
    await page.getByRole("button", { name: sheet }).click();
    for (const paper of PAPERS) {
      const pdf = await page.pdf({ format: paper.format, landscape: paper.landscape, printBackground: true });
      expect(pageCount(pdf), `${paper.format}${paper.landscape ? " landscape" : ""}`).toBe(1);
    }
  });
}

test("the answer key's column headers each print on one line", async () => {
  const page = await context.newPage();
  // The printable width of A4 and US Letter with Chrome's default margins.
  await page.setViewportSize({ width: 700, height: 1000 });
  await page.goto(`/packs/${widePackId}/print`);
  await page.getByRole("button", { name: "Host answer key" }).click();
  await page.emulateMedia({ media: "print" });

  const lines = await page.evaluate(() =>
    [...document.querySelectorAll("article.paper-sheet thead th")].map((th) => {
      const range = document.createRange();
      range.selectNodeContents(th);
      return { text: th.textContent, lines: new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size };
    })
  );
  expect(lines.map((l) => l.text)).toEqual(["#", "Question", "Answer", "Pts"]);
  for (const l of lines) expect(l.lines, l.text!).toBe(1);
});
