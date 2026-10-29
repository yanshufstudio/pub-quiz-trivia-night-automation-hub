import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { signedInContext } from "./sign-in-helper";

/**
 * Print preview (/packs/<id>/print) for Halloween 2026, when hosts print
 * their sheets from the browser rather than from the PDF.
 *
 * Each sheet has one name, used everywhere it is shown: the tab, the sheet's
 * heading, the page title (so a PDF saved from the print window is named
 * after it) and the Download PDF file. "Print this sheet" prints whichever
 * sheet is on screen. The team sheet's line under the title is where a team
 * writes its name; the other two say where the host keeps them.
 */

const SHEETS = [
  { name: "Presenter script", file: "presenter-script" },
  { name: "Host answer key", file: "host-answer-key" },
  { name: "Team answer sheet", file: "team-answer-sheet" },
] as const;
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
  const downloadLink = (page: Page) => page.getByRole("link", { name: "Download PDF", exact: true });

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

    // The main button is filled; Download PDF is the outlined second one.
    const look = (el: HTMLElement) => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, border: style.borderTopWidth };
    };
    const main = await printButton(page).evaluate(look);
    const second = await downloadLink(page).evaluate(look);
    expect(main.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(second.background).toBe("rgba(0, 0, 0, 0)");
    expect(parseFloat(second.border)).toBeGreaterThanOrEqual(1);
    await page.close();
  });

  test("Print this sheet and Download PDF are hidden when printing", async () => {
    const page = await openPrintPage();
    await expect(printButton(page)).toBeVisible();
    await expect(downloadLink(page)).toBeVisible();
    await page.emulateMedia({ media: "print" });
    await expect(printButton(page)).toBeHidden();
    await expect(downloadLink(page)).toBeHidden();
    await expect(article(page)).toBeVisible();
    await page.close();
  });

  test("Download PDF names the file after the sheet", async () => {
    const page = await openPrintPage();
    const slug = pack.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    for (const sheet of SHEETS) {
      await page.getByRole("button", { name: sheet.name, exact: true }).click();
      const [download] = await Promise.all([page.waitForEvent("download"), downloadLink(page).click()]);
      expect(download.suggestedFilename()).toBe(`${slug}-${sheet.file}.pdf`);
    }
    await page.close();
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
