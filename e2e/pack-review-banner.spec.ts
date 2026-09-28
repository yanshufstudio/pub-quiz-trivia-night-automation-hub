import { test, expect, type APIRequestContext } from "@playwright/test";
import path from "node:path";
import { createClient } from "@libsql/client";
import { signedInContext } from "./sign-in-helper";

/**
 * ACC2: a generated pack whose accuracy review did not run carries a banner
 * in the editor. Nothing else does — not a checked pack, and not an imported,
 * older or demo pack, which never went through the review at all.
 *
 * Generation needs a funded model, so the review status is written straight
 * into the suite's database, the one the dev server under test reads.
 */
const e2eDb = createClient({ url: `file:${path.resolve(__dirname, "../prisma/e2e.db")}` });

async function importOwnedPack(api: APIRequestContext) {
  const res = await api.post("/api/packs/import", {
    data: {
      format: "pub-quiz-pack",
      version: 2,
      title: `Review Banner ${Date.now()}`,
      rounds: [
        {
          title: "Round One",
          category: "General Knowledge",
          questions: [{ text: "What is the capital of Australia?", answer: "Canberra", points: 1, type: "TEXT" }],
        },
      ],
    },
  });
  expect(res.ok(), `import failed: ${res.status()}`).toBeTruthy();
  return (await res.json()).pack as { id: string };
}

async function setReviewStatus(packId: string, status: string | null) {
  await e2eDb.execute({ sql: 'UPDATE "QuizPack" SET "reviewStatus" = ? WHERE "id" = ?', args: [status, packId] });
}

const BANNER = "This pack wasn't checked — give it an extra careful read before the night.";

test("a pack that wasn't checked says so, and the host can dismiss it", async ({ browser, baseURL }) => {
  const { context, api } = await signedInContext(browser, baseURL!);
  const pack = await importOwnedPack(api);
  await setReviewStatus(pack.id, "not_checked");
  const page = await context.newPage();

  await page.goto(`/packs/${pack.id}`);
  const banner = page.getByRole("status").filter({ hasText: BANNER });
  await expect(banner).toBeVisible();
  // A banner, not a modal: the editor behind it is usable.
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await banner.getByRole("button", { name: "Dismiss" }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(BANNER)).toHaveCount(0);

  await context.close();
});

test("a checked pack, and a pack that never went through the review, show no banner", async ({ browser, baseURL }) => {
  const { context, api } = await signedInContext(browser, baseURL!);
  const checked = await importOwnedPack(api);
  await setReviewStatus(checked.id, "checked");
  const imported = await importOwnedPack(api);
  const page = await context.newPage();

  for (const id of [checked.id, imported.id]) {
    await page.goto(`/packs/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(BANNER)).toHaveCount(0);
  }

  await context.close();
});
