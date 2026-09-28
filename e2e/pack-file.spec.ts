import { test, expect, type FileChooser, type Page } from "@playwright/test";
import { signedInContext } from "./sign-in-helper";

/**
 * Press "Import pack" and return the file chooser it opens.
 *
 * The picker opens from React's onClick on the button, so a press that lands
 * before /packs has hydrated does nothing and no chooser ever comes. A plain
 * click-then-wait loses that race whenever the page's scripts are slow — it
 * failed that way in CI on 28 Sep, and fails every time with the scripts
 * delayed. Pressing again until a chooser opens waits for hydration without
 * guessing at a signal for it; a button that never opens one still fails.
 */
async function openImportChooser(page: Page): Promise<FileChooser> {
  let chooser: FileChooser | undefined;
  await expect(async () => {
    [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 2_000 }),
      page.getByRole("button", { name: "Import pack" }).click(),
    ]);
  }).toPass({ timeout: 20_000 });
  return chooser!;
}

// Export from the editor's "Export JSON", import through the /packs "Import
// pack" file picker, and land on a fresh copy — the two buttons are the only
// UI over the routes covered in src/test/pack-file.integration.test.ts.
test("a pack exported from the editor can be imported back from the packs list", async ({ browser, baseURL }) => {
  // The editor, Export and Import are all host surfaces now.
  const { context, api } = await signedInContext(browser, baseURL!);
  const page = await context.newPage();
  const seedRes = await api.post("/api/packs/seed");
  const { pack } = (await seedRes.json()) as { pack: { id: string; title: string } };

  await page.goto(`/packs/${pack.id}`);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("friday-night-demo-pack.json");
  const path = await download.path();

  await page.goto("/packs");
  const chooser = await openImportChooser(page);
  await chooser.setFiles(path);

  await page.waitForURL(/\/packs\/(?!.*friday)[a-z0-9]+$/i);
  expect(page.url()).not.toContain(pack.id);
  await expect(page.getByRole("heading", { level: 1, name: pack.title })).toBeVisible();

  await context.close();
});

test("importing something that isn't a pack file shows the error inline", async ({ browser, baseURL }) => {
  const { context } = await signedInContext(browser, baseURL!);
  const page = await context.newPage();
  await page.goto("/packs");
  const chooser = await openImportChooser(page);
  await chooser.setFiles({
    name: "notes.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ title: "Just some notes" })),
  });
  // Next dev mode mounts its own role="alert" region; pick ours by content.
  await expect(page.getByRole("alert").filter({ hasText: "pack file" })).toContainText("isn't a pack file");
  expect(page.url()).toMatch(/\/packs$/);
});
