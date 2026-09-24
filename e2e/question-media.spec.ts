import { test, expect } from "@playwright/test";
import { newAnonApi, newAnonContext, signedInContext } from "./sign-in-helper";
import { PACK_FILE_FORMAT, PACK_FILE_VERSION } from "@/lib/pack-file";
import { questionMediaUrl } from "@/lib/question-media-url";
import { realPngBytes } from "@/test/image-fixtures";

/**
 * A question's image, in a browser.
 *
 * `GET /api/questions/[id]/media` used to serve the bytes to anyone holding
 * a question id. It does not any more (src/lib/question-media-access.ts),
 * and the thing most at risk from that change is the one thing that must
 * never break: a team's phone showing the picture round. So this drives the
 * real pages rather than the route — a host uploading, a team seeing it, and
 * a stranger not.
 */

const QUESTION_TEXT = "Which building is in the picture?";

test("a team sees the picture, and a stranger cannot fetch it", async ({ browser, baseURL }) => {
  const host = await signedInContext(browser, baseURL!);

  const imported = await host.api.post("/api/packs/import", {
    data: {
      format: PACK_FILE_FORMAT,
      version: PACK_FILE_VERSION,
      title: `Picture Round ${Math.random().toString(36).slice(2)}`,
      prompt: "a picture round",
      rounds: [
        {
          title: "Pictures",
          category: "Landmarks",
          questions: [
            { text: QUESTION_TEXT, answer: "the opera house", points: 1, type: "TEXT" },
            { text: "And the one after it?", answer: "later", points: 1, type: "TEXT" },
          ],
        },
      ],
    },
  });
  expect(imported.status(), await imported.text()).toBe(201);
  const { pack } = (await imported.json()) as {
    pack: { id: string; rounds: { questions: { id: string }[] }[] };
  };
  const [first, second] = pack.rounds[0].questions.map((q) => q.id);

  // Uploaded through the real route, as a host does from the editor.
  const uploaded = await host.api.post(`/api/questions/${first}/media`, {
    headers: { "content-type": "image/png" },
    data: await realPngBytes(320, 200),
  });
  expect(uploaded.status(), await uploaded.text()).toBe(201);

  const created = await host.api.post("/api/sessions", { data: { packId: pack.id } });
  expect(created.status()).toBe(201);
  const { session, hostToken } = (await created.json()) as {
    session: { code: string };
    hostToken: string;
  };

  // --- the team ---
  const teamContext = await newAnonContext(browser, baseURL!);
  const teamPage = await teamContext.newPage();
  await teamPage.goto(`/play?code=${session.code}`);
  await teamPage.getByLabel("Team name").fill("The Picture Takers");
  await teamPage.getByRole("button", { name: "Join session" }).click();
  await expect(teamPage.getByText("Sit tight.")).toBeVisible();

  await host.api.post(`/api/sessions/${session.code}/advance`, {
    data: { action: "start", hostToken },
  });
  await expect(teamPage.getByText(QUESTION_TEXT)).toBeVisible({ timeout: 10_000 });

  // The assertion that matters: the bytes actually arrived. A visible <img>
  // proves only that the element is there — a 404 renders one of those too.
  const teamImage = teamPage.locator('img[src*="/media"]').first();
  await expect(teamImage).toBeVisible();
  await expect
    .poll(() => teamImage.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 10_000 })
    .toBeGreaterThan(0);

  // --- the editor, which has no session code to offer, only a cookie ---
  const editorPage = await host.context.newPage();
  await editorPage.goto(`/packs/${pack.id}`);
  await expect(editorPage.getByText(QUESTION_TEXT)).toBeVisible();
  const editorImage = editorPage.locator('img[src*="/media"]').first();
  await expect
    .poll(() => editorImage.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 10_000 })
    .toBeGreaterThan(0);

  // --- the stranger ---
  const stranger = await newAnonApi(baseURL!);
  const bare = await stranger.get(questionMediaUrl(first), { failOnStatusCode: false });
  expect(bare.status(), "a question id alone should no longer be enough").toBe(404);

  // Nor the next question, with the team's own credentials: a team may read
  // the question it is being asked, and not the rest of the pack.
  const ahead = await stranger.get(
    questionMediaUrl(second, { code: session.code, token: "whatever" }),
    { failOnStatusCode: false }
  );
  expect(ahead.status()).toBe(404);
  await stranger.dispose();

  // --- the desk ---
  const deskPage = await host.context.newPage();
  await deskPage.goto(`/host/${session.code}`);
  await deskPage.getByPlaceholder("Host key").fill(hostToken);
  await deskPage.getByRole("button", { name: "Use key" }).click();
  await expect(deskPage.getByText(QUESTION_TEXT)).toBeVisible({ timeout: 10_000 });
  const deskImage = deskPage.locator('img[src*="/media"]').first();
  await expect
    .poll(() => deskImage.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 10_000 })
    .toBeGreaterThan(0);

  await teamContext.close();
  await host.context.close();
});
