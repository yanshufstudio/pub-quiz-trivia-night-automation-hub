import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { signedInContext } from "./sign-in-helper";

/**
 * Print preview (/packs/<id>/print), where hosts print their sheets from the
 * browser.
 *
 * Each sheet has one name, used everywhere it is shown: the tab, the sheet's
 * heading and the page title (so a PDF saved from the print window is named
 * after it). "Print this sheet" prints whichever sheet is on screen, and is
 * the only print control. The team sheet's line under the title is where a
 * team writes its name; the other two say where the host keeps them.
 */

const SHEETS = [{ name: "Presenter script" }, { name: "Host answer key" }, { name: "Team answer sheet" }] as const;
const LECTERN = "keep this copy at the lectern";

function occurrences(text: string, needle: string) {
  return text.split(needle).length - 1;
}

test.describe("Print preview", () => {
  let context: BrowserContext;
  let pack: { id: string; title: string };

  test.beforeAll(async ({ browser, baseURL }) => {
    const signedIn = await signedInContext(browser, baseURL!);
    context = signedIn.context;
    pack = (await (await signedIn.api.post("/api/packs/seed")).json()).pack;
  });

  test.afterAll(async () => {
    await context.close();
  });

  // window.print is stubbed: it records which sheet was on screen when it
  // was called, instead of opening the print dialog.
  async function openPrintPage(): Promise<Page> {
    const page = await context.newPage();
    await page.addInitScript(() => {
      const printed: string[] = [];
      Object.assign(window, { printed });
      window.print = () => {
        printed.push(document.querySelector("article header p")?.textContent ?? "");
      };
    });
    await page.goto(`/packs/${pack.id}/print`);
    return page;
  }

  const kicker = (page: Page) => page.locator("article header p").first();
  const article = (page: Page) => page.locator("article");
  const printButton = (page: Page) => page.getByRole("button", { name: "Print this sheet", exact: true });

  test("the three tabs, in order, each with its sheet heading", async () => {
    const page = await openPrintPage();
    // The page's own buttons; `next dev` adds one of its own outside them.
    await expect(page.locator(".print-chrome").getByRole("button")).toHaveText([
      "Print this sheet",
      ...SHEETS.map((s) => s.name),
    ]);
    for (const sheet of SHEETS) {
      await page.getByRole("button", { name: sheet.name, exact: true }).click();
      await expect(kicker(page)).toHaveText(sheet.name);
    }
    await page.close();
  });

  test("Print this sheet prints the sheet on screen, and is the main button", async () => {
    const page = await openPrintPage();
    await printButton(page).click();
    await page.getByRole("button", { name: "Team answer sheet", exact: true }).click();
    await printButton(page).click();
    expect(await page.evaluate(() => (window as unknown as { printed: string[] }).printed)).toEqual([
      "Presenter script",
      "Team answer sheet",
    ]);

    // The main button is filled.
    const background = await printButton(page).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(background).not.toBe("rgba(0, 0, 0, 0)");
    await page.close();
  });

  test("Print this sheet is hidden when printing", async () => {
    const page = await openPrintPage();
    await expect(printButton(page)).toBeVisible();
    await page.emulateMedia({ media: "print" });
    await expect(printButton(page)).toBeHidden();
    await expect(article(page)).toBeVisible();
    await page.close();
  });

  test("there is no Download PDF: Print this sheet is the only print control on each tab", async () => {
    const page = await openPrintPage();
    for (const sheet of SHEETS) {
      await page.getByRole("button", { name: sheet.name, exact: true }).click();
      await expect(kicker(page)).toHaveText(sheet.name);
      await expect(page.getByText("Download PDF")).toHaveCount(0);
      await expect(page.locator(".print-chrome").getByRole("link")).toHaveText(["Back to editor"]);
      await expect(page.getByRole("button", { name: /print/i })).toHaveText(["Print this sheet"]);
    }
    await page.close();
  });

  test("the server-side PDF route is gone: GET /api/packs/<id>/pdf is 404", async () => {
    for (const type of ["script", "answers", "questions"]) {
      const res = await context.request.get(`/api/packs/${pack.id}/pdf?type=${type}`, { failOnStatusCode: false });
      expect(res.status(), type).toBe(404);
    }
  });

  test("the page title is the pack's title and the sheet on screen", async () => {
    // As served, before any script runs: the first sheet.
    const html = await (await context.request.get(`/packs/${pack.id}/print`)).text();
    expect(html).toContain(`<title>${pack.title} · Presenter script</title>`);

    const page = await openPrintPage();
    for (const sheet of [...SHEETS.slice(1), SHEETS[0]]) {
      await page.getByRole("button", { name: sheet.name, exact: true }).click();
      await expect(page).toHaveTitle(`${pack.title} · ${sheet.name}`);
    }
    await page.close();
  });

  test("the team sheet has one Team name line and no lectern line; the host's sheets keep it", async () => {
    const page = await openPrintPage();
    for (const sheet of SHEETS) {
      await page.getByRole("button", { name: sheet.name, exact: true }).click();
      await expect(kicker(page)).toHaveText(sheet.name);
      const text = (await article(page).textContent()) ?? "";
      if (sheet.name === "Team answer sheet") {
        expect(occurrences(text, "Team name:")).toBe(1);
        expect(occurrences(text, LECTERN)).toBe(0);
        await expect(page.locator("article header p").nth(1)).toHaveText(/^Team name: _+$/);
      } else {
        expect(occurrences(text, "Team name:")).toBe(0);
        expect(occurrences(text, LECTERN)).toBe(1);
      }
    }
    await page.close();
  });
});
