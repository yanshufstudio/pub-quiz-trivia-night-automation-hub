import { test, expect, type APIRequestContext } from "@playwright/test";
import { signedInContext, randomEmail } from "./sign-in-helper";

/**
 * A host can get back to their own desk from another device (H4).
 *
 * The host key is written to one browser's local storage and shown on no
 * screen, so before this the second device was simply locked out: the desk
 * asked it to paste a key nobody had ever been given. What makes the recovery
 * real is a *different browser context* — a second context has its own local
 * storage, which is exactly what a second phone is.
 */

async function importOwnedPack(api: APIRequestContext) {
  const res = await api.post("/api/packs/import", {
    data: {
      format: "pub-quiz-pack",
      version: 2,
      title: `Second Device Pack ${Date.now()}`,
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

test("the host desk shows its own link, and the owner reopens it on another device", async ({
  browser,
  baseURL,
}) => {
  const email = randomEmail("hostlink");
  const { context, api } = await signedInContext(browser, baseURL!, email);
  const pack = await importOwnedPack(api);

  const firstDevice = await context.newPage();
  await firstDevice.goto(`/packs/${pack.id}`);
  await firstDevice.getByRole("button", { name: "Start live session" }).click();
  await firstDevice.waitForURL(/\/host\//);
  const code = firstDevice.url().split("/host/")[1];

  // Part 1: the desk states its own address, with a way to take it away.
  const hostLink = firstDevice.getByRole("heading", { name: "Host link", exact: true });
  await expect(hostLink).toBeVisible();
  await expect(firstDevice.getByText(`/host/${code}`)).toBeVisible();
  await expect(
    firstDevice.getByText("Keep this link to reopen the host desk on another device")
  ).toBeVisible();
  await expect(firstDevice.getByRole("button", { name: "Copy" })).toBeVisible();

  // The link carries no credential — that is the reason it is safe to copy.
  const shownLink = await firstDevice.getByText(`/host/${code}`).innerText();
  expect(shownLink).not.toMatch(/key|token|\?/);

  // Part 2: the same account, a different browser. No local storage, no key.
  const { context: secondDevice } = await signedInContext(browser, baseURL!, email);
  const secondPage = await secondDevice.newPage();

  // It finds its own live game listed, without having to remember the code.
  await secondPage.goto("/packs");
  await expect(secondPage.getByRole("heading", { name: "Your live games" })).toBeVisible();
  await secondPage.getByRole("link", { name: new RegExp(code) }).click();
  await secondPage.waitForURL(new RegExp(`/host/${code}`));

  // And the desk opens: the controls, not the paste-a-key screen.
  await expect(secondPage.getByRole("heading", { name: "Host key needed" })).toHaveCount(0);
  await expect(secondPage.getByText("Waiting for teams")).toBeVisible({ timeout: 10_000 });
  await expect(secondPage.getByRole("button", { name: "End game" })).toBeVisible();

  // A different account holding the same code is still a stranger to it.
  const { context: strangerContext } = await signedInContext(browser, baseURL!);
  const strangerPage = await strangerContext.newPage();
  await strangerPage.goto(`/host/${code}`);
  await expect(strangerPage.getByRole("heading", { name: "Host key needed" })).toBeVisible();
  await expect(strangerPage.getByText("Waiting for teams")).toHaveCount(0);

  // ...and sees no live game of their own on /packs.
  await strangerPage.goto("/packs");
  await expect(strangerPage.getByRole("heading", { name: "Your live games" })).toHaveCount(0);
});
