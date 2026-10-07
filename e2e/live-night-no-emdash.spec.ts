import { test, expect, type Page } from "@playwright/test";
import { newAnonContext, signedInContext } from "./sign-in-helper";

/**
 * No em dash on any screen of a live night: the host desk, a team's phone and
 * the TV, from the lobby through marking, the reveal, the warnings and the
 * final scores, plus the error text the desk shows when the game has moved
 * on. src/lib/live-night-copy.test.ts guards the source; this reads what the
 * screens actually render, including labels a screen reader hears.
 */

/**
 * `withTitle` only for the TV, which has its own tab title. The desk and the
 * phone still carry the site's default title, which is home-page copy and
 * changes with the other pages' em dashes, not here.
 */
async function expectNoEmDash(page: Page, where: string, { withTitle = false } = {}) {
  const found = await page.evaluate((withTitle) => {
    const texts = [withTitle ? document.title : "", document.body.innerText];
    for (const el of Array.from(document.querySelectorAll("[aria-label],[title],[alt],[placeholder]"))) {
      for (const name of ["aria-label", "title", "alt", "placeholder"]) {
        const value = el.getAttribute(name);
        if (value) texts.push(value);
      }
    }
    return texts.filter((text) => text.includes("—"));
  }, withTitle);
  expect(found, where).toEqual([]);
}

test("a live night shows no em dash on the desk, the phone or the TV", async ({ browser, baseURL }) => {
  test.setTimeout(150_000);
  const { context, api } = await signedInContext(browser, baseURL!);
  const { pack } = await (await api.post("/api/packs/seed")).json();
  const { session, hostToken } = await (await api.post("/api/sessions", { data: { packId: pack.id } })).json();
  const code = session.code as string;
  const advance = (action: string, extra: object = {}) =>
    api.post(`/api/sessions/${code}/advance`, { data: { action, hostToken, ...extra } });

  const host = await context.newPage();
  await host.setViewportSize({ width: 390, height: 844 });
  await host.goto(`/host/${code}`);
  await expect(host.getByRole("heading", { name: "Waiting for teams" })).toBeVisible();

  const teamContext = await newAnonContext(browser, baseURL);
  const phone = await teamContext.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`/play?code=${code}`);
  await phone.getByLabel("Team name").fill("Dashless");
  await phone.getByRole("button", { name: "Join session" }).click();
  await expect(phone.getByText("You’re in, Dashless.")).toBeVisible();

  const tvContext = await newAnonContext(browser, baseURL);
  const tv = await tvContext.newPage();
  await tv.goto(`/tv/${code}`);
  await expect(tv.locator("body")).toContainText(code, { timeout: 10_000 });

  await expect(host.getByText("Dashless")).toBeVisible({ timeout: 10_000 });
  await expectNoEmDash(host, "host lobby");
  await expectNoEmDash(phone, "phone lobby");
  await expectNoEmDash(tv, "TV lobby", { withTitle: true });

  // A paper team with no totals, and a phone team that answers only Q1, so the
  // marks grid has empty cells and both missing-total warnings come up.
  await api.post(`/api/sessions/${code}/teams`, { data: { hostToken, name: "The Pencils" } });
  await advance("start");
  await phone.getByLabel("Answer to Round 1 · Q1").fill("Canberra");
  await phone.getByRole("button", { name: "Save" }).click();
  await expect(phone.getByText("Saved", { exact: true })).toBeVisible();
  await expectNoEmDash(phone, "phone, round open");
  await advance("ask_next");
  await advance("ask_next");
  await advance("close_round");

  await expect(host.getByRole("heading", { name: "Round 1: check the marks" })).toBeVisible({ timeout: 10_000 });
  await expect(host.getByTestId("marks-grid").getByText("No answer").first()).toBeAttached();
  await expectNoEmDash(host, "host marking");
  await expectNoEmDash(phone, "phone marking");
  await expectNoEmDash(tv, "TV marking", { withTitle: true });

  await host.getByRole("button", { name: "Reveal all" }).click();
  await expect(host.getByTestId("primary-action")).toContainText("No round 1 total for The Pencils. They score 0");
  await expectNoEmDash(host, "host Reveal all warning");
  await host.getByRole("button", { name: "Yes, reveal all" }).click();
  await expect(host.getByText("3 of 3 answers revealed")).toBeVisible({ timeout: 10_000 });
  await expect(tv.getByText("Round 1: the answers")).toBeVisible({ timeout: 10_000 });
  await expectNoEmDash(host, "host reveal");
  await expectNoEmDash(phone, "phone reveal");
  await expectNoEmDash(tv, "TV reveal", { withTitle: true });

  // The last round, revealed: the phone says the final scores are coming.
  await advance("next_round");
  await advance("ask_next");
  await advance("ask_next");
  await advance("close_round");
  await advance("reveal_all");
  await expect(phone.getByText("That was the last round. The final scores are on their way.")).toBeVisible({
    timeout: 10_000,
  });
  await expectNoEmDash(phone, "phone, last round revealed");

  // What the desk shows when a press is refused.
  const pastLast = await advance("next_round");
  expect(pastLast.status()).toBe(409);
  expect((await pastLast.json()).error).toBe("That was the last round. Finish the quiz instead.");
  const stale = await advance("finish", { at: { roundIndex: 0, askedCount: 0, revealedCount: 0 } });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).error).toBe("The game moved on. Refresh and try again.");

  await host.getByTestId("primary-action").getByRole("button", { name: "Finish quiz…" }).click();
  await expect(host.getByRole("heading", { name: "Finish the quiz?" })).toBeVisible();
  await expect(host.getByTestId("primary-action")).toContainText("No round 2 total for The Pencils. They score 0");
  await expectNoEmDash(host, "host Finish confirm");
  await host.getByRole("button", { name: "Yes, finish the quiz" }).click();

  await expect(host.getByText(/Tonight’s champion/)).toBeVisible({ timeout: 10_000 });
  await expect(tv.getByText("Final scores")).toBeVisible({ timeout: 10_000 });
  await expect(phone.getByText("Final scores")).toBeVisible({ timeout: 10_000 });
  await expectNoEmDash(host, "host ended");
  await expectNoEmDash(phone, "phone ended");
  await expectNoEmDash(tv, "TV ended", { withTitle: true });

  await tvContext.close();
  await teamContext.close();
  await context.close();
});
