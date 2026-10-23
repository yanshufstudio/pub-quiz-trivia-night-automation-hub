import { test, expect, type APIRequestContext, type Locator } from "@playwright/test";
import { newAnonContext, signedInContext } from "./sign-in-helper";
import { switchToQuestionMode } from "./question-mode";
import { PACK_FILE_FORMAT, PACK_FILE_VERSION } from "@/lib/pack-file";
import { realPngBytes } from "@/test/image-fixtures";

/**
 * A question's picture keeps its own shape wherever it is shown.
 *
 * The host desk and the team phone used to put every picture in a full-width
 * white box, so a tall one sat between two white bands; the border and the
 * rounded corners now sit on the picture itself, centred in its column. The
 * TV used to show a picture at its own pixel size, so a small one filled a
 * quarter of the screen's height; it now scales every picture, up or down, to
 * the largest size its 760 x 720 picture area holds.
 */

const TALL = { text: "Whose portrait is this?", width: 174, height: 290 };
const WIDE = { text: "Which skyline is this?", width: 1600, height: 900 };

async function pictureGame(api: APIRequestContext) {
  const imported = await api.post("/api/packs/import", {
    data: {
      format: PACK_FILE_FORMAT,
      version: PACK_FILE_VERSION,
      title: `Picture Shapes ${Math.random().toString(36).slice(2)}`,
      prompt: "a picture round",
      rounds: [
        {
          title: "Pictures",
          category: "Pictures",
          questions: [
            { text: TALL.text, answer: "a tall one", points: 1, type: "TEXT" },
            { text: WIDE.text, answer: "a wide one", points: 1, type: "TEXT" },
          ],
        },
      ],
    },
  });
  expect(imported.status(), await imported.text()).toBe(201);
  const { pack } = (await imported.json()) as {
    pack: { id: string; rounds: { questions: { id: string }[] }[] };
  };
  const [tallId, wideId] = pack.rounds[0].questions.map((q) => q.id);
  for (const [id, picture] of [
    [tallId, TALL],
    [wideId, WIDE],
  ] as const) {
    const uploaded = await api.post(`/api/questions/${id}/media`, {
      headers: { "content-type": "image/png" },
      data: await realPngBytes(picture.width, picture.height),
    });
    expect(uploaded.status(), await uploaded.text()).toBe(201);
  }

  const created = await api.post("/api/sessions", { data: { packId: pack.id } });
  expect(created.status()).toBe(201);
  const { session, hostToken } = (await created.json()) as { session: { code: string }; hostToken: string };
  const code = session.code;
  const advance = async (action: string) => {
    const res = await api.post(`/api/sessions/${code}/advance`, { data: { action, hostToken } });
    expect(res.ok(), `${action}: ${res.status()}`).toBeTruthy();
  };
  return { code, advance, tallId, wideId };
}

const pictureOf = (questionId: string) => `img[src*="/questions/${questionId}/media"]`;

/** The picture's own box (inside its border), its natural shape, and where it sits in its column. */
async function measure(img: Locator) {
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 10_000 })
    .toBeGreaterThan(0);
  return img.evaluate((el: HTMLImageElement) => {
    const style = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const column = el.parentElement!;
    const c = column.getBoundingClientRect();
    const cs = getComputedStyle(column);
    const columnLeft = c.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
    const columnRight = c.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
    return {
      width: r.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth),
      height: r.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth),
      naturalRatio: el.naturalWidth / el.naturalHeight,
      background: style.backgroundColor,
      overflow: r.right - columnRight,
      offCentre: (r.left + r.right) / 2 - (columnLeft + columnRight) / 2,
    };
  });
}

/** Desk and phone: the box is the picture, centred, with nothing painted around it. */
async function expectFitsItsPicture(img: Locator) {
  const box = await measure(img);
  expect(box.width / box.height, "the box has the picture's own shape, no letterbox").toBeCloseTo(box.naturalRatio, 2);
  expect(box.background, "no white fill").toBe("rgba(0, 0, 0, 0)");
  expect(box.overflow, "fits the column").toBeLessThanOrEqual(0.5);
  expect(Math.abs(box.offCentre), "centred in the column").toBeLessThanOrEqual(1);
}

test("round mode: desk and phone draw the picture at its own shape", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const host = await signedInContext(browser, baseURL!);
  const { code, advance, tallId, wideId } = await pictureGame(host.api);

  const teamContext = await newAnonContext(browser, baseURL);
  const phone = await teamContext.newPage();
  await phone.setViewportSize({ width: 375, height: 812 });
  await phone.goto(`/play?code=${code}`);
  await phone.getByLabel("Team name").fill("Shape Keepers");
  await phone.getByRole("button", { name: "Join session" }).click();
  await expect(phone.getByText("You’re in, Shape Keepers.")).toBeVisible({ timeout: 10_000 });

  const desk = await host.context.newPage();
  await desk.setViewportSize({ width: 1280, height: 800 });
  await desk.goto(`/host/${code}`);

  await advance("start");
  for (const page of [desk, phone]) {
    await expect(page.getByText(TALL.text)).toBeVisible({ timeout: 10_000 });
    await expectFitsItsPicture(page.locator(pictureOf(tallId)));
  }

  await advance("ask_next");
  for (const page of [desk, phone]) {
    // From the second question the desk also lists it under "Asked so far", so the text shows twice there.
    await expect(page.getByText(WIDE.text).first()).toBeVisible({ timeout: 10_000 });
    await expectFitsItsPicture(page.locator(pictureOf(wideId)));
  }

  await teamContext.close();
  await host.context.close();
});

test("the TV scales a small picture up and a large one down to fill its picture area", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const host = await signedInContext(browser, baseURL!);
  const { code, advance, tallId, wideId } = await pictureGame(host.api);

  const tvContext = await newAnonContext(browser, baseURL);
  const tv = await tvContext.newPage();
  await tv.setViewportSize({ width: 1920, height: 1080 });
  await tv.goto(`/tv/${code}`);
  await expect(tv.getByText(code, { exact: true })).toBeVisible();

  // At 1920 x 1080 the stage is drawn at scale 1, so these are stage pixels.
  await advance("start");
  const tvTall = tv.locator(pictureOf(tallId));
  await expect.poll(async () => (await measure(tvTall)).height, { timeout: 10_000 }).toBeCloseTo(720, 0);
  const tall = await measure(tvTall);
  expect(tall.width / tall.height, "shape kept").toBeCloseTo(tall.naturalRatio, 2);
  expect(tall.width).toBeLessThanOrEqual(760);
  expect(tall.background, "no white fill").toBe("rgba(0, 0, 0, 0)");
  const insideStage = await tvTall.evaluate((el) => {
    const s = document.querySelector('[data-testid="tv-stage"]')!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return r.left >= s.left && r.right <= s.right && r.top >= s.top && r.bottom <= s.bottom;
  });
  expect(insideStage, "the full-height picture stays on the stage").toBe(true);

  await advance("ask_next");
  const tvWide = tv.locator(pictureOf(wideId));
  await expect.poll(async () => (await measure(tvWide)).width, { timeout: 10_000 }).toBeCloseTo(760, 0);
  const wide = await measure(tvWide);
  expect(wide.width / wide.height, "shape kept").toBeCloseTo(wide.naturalRatio, 2);
  expect(wide.height).toBeLessThanOrEqual(720);
  expect(wide.background, "no white fill").toBe("rgba(0, 0, 0, 0)");

  await tvContext.close();
  await host.context.close();
});

test("question mode: desk and phone draw the picture at its own shape", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const host = await signedInContext(browser, baseURL!);
  const { code, advance, tallId, wideId } = await pictureGame(host.api);
  await switchToQuestionMode(code);

  const teamContext = await newAnonContext(browser, baseURL);
  const phone = await teamContext.newPage();
  await phone.setViewportSize({ width: 375, height: 812 });
  await phone.goto(`/play?code=${code}`);
  await phone.getByLabel("Team name").fill("Shape Keepers");
  await phone.getByRole("button", { name: "Join session" }).click();
  await expect(phone.getByText("You’re in, Shape Keepers.")).toBeVisible({ timeout: 10_000 });

  const desk = await host.context.newPage();
  await desk.setViewportSize({ width: 1280, height: 800 });
  await desk.goto(`/host/${code}`);

  await advance("start");
  for (const page of [desk, phone]) {
    await expect(page.getByText(TALL.text)).toBeVisible({ timeout: 10_000 });
    await expectFitsItsPicture(page.locator(pictureOf(tallId)));
  }

  await advance("reveal");
  await advance("next");
  for (const page of [desk, phone]) {
    await expect(page.getByText(WIDE.text)).toBeVisible({ timeout: 10_000 });
    await expectFitsItsPicture(page.locator(pictureOf(wideId)));
  }

  await teamContext.close();
  await host.context.close();
});
