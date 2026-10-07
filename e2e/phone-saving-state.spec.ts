import { test, expect } from "@playwright/test";
import { newAnonContext, signedInContext } from "./sign-in-helper";

/**
 * On a slow connection the save's own answer can come back after the next
 * poll has already brought the saved answer. The status line then said
 * "Saved" while the button still said "Saving…". Until the save answers, both
 * say "Saving…".
 */
test("the status line says Saving… for as long as the button does", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const { context, api } = await signedInContext(browser, baseURL!);
  const { pack } = await (await api.post("/api/packs/seed")).json();
  const { session, hostToken } = await (await api.post("/api/sessions", { data: { packId: pack.id } })).json();
  const code = session.code as string;

  const teamContext = await newAnonContext(browser, baseURL);
  const phone = await teamContext.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`/play?code=${code}`);
  await phone.getByLabel("Team name").fill("Slow Sloths");
  await phone.getByRole("button", { name: "Join session" }).click();
  await expect(phone.getByText("You’re in, Slow Sloths.")).toBeVisible();
  await api.post(`/api/sessions/${code}/advance`, { data: { action: "start", hostToken } });

  // The save reaches the server at once; its answer is held back.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await phone.route(`**/api/sessions/${code}/answers`, async (route) => {
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });

  const status = phone.locator('p[aria-live="polite"]');
  await phone.getByLabel("Answer to Round 1 · Q1").fill("Canberra");
  await expect(status).toHaveText("Not saved yet");
  await phone.getByRole("button", { name: "Save" }).click();
  await expect(phone.getByRole("button", { name: "Saving…" })).toBeVisible();

  // A poll that already carries the saved answer lands first.
  await phone.waitForResponse(
    (res) => res.request().method() === "GET" && new URL(res.url()).pathname === `/api/sessions/${code}`
  );
  await phone.waitForTimeout(300);
  await expect(status).toHaveText("Saving…");
  await expect(phone.getByRole("button", { name: "Saving…" })).toBeVisible();

  release();
  await expect(status).toHaveText("Saved");

  await teamContext.close();
  await context.close();
});
