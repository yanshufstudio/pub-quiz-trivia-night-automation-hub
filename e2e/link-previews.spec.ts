import { test, expect, type Page } from "@playwright/test";

/**
 * Link previews on the crawlable pages (SEO1), read from the rendered head.
 *
 * Until 2026-09-27 every one of these pages carried the homepage's og:title
 * and og:description, because Next merges `metadata` shallowly and a page
 * that set no `openGraph` inherited the layout's whole object. So the test
 * compares each page's preview against that page's own <title> and meta
 * description rather than against literals: a literal would only prove the
 * strings were typed twice.
 */

const SITE = "https://triviafoundry.com";

// Exactly the pages sitemap.ts lists and robots.ts leaves crawlable.
const PAGES = ["/", "/pricing", "/how-it-works", "/faq", "/terms", "/privacy", "/refunds"] as const;

async function head(page: Page) {
  return page.evaluate(() => {
    const meta = (sel: string) =>
      Array.from(document.head.querySelectorAll<HTMLMetaElement>(sel)).map((m) => m.content);
    const links = (rel: string) =>
      Array.from(document.head.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`)).map(
        (l) => l.getAttribute("href"),
      );
    return {
      title: document.title,
      description: meta('meta[name="description"]'),
      ogTitle: meta('meta[property="og:title"]'),
      ogDescription: meta('meta[property="og:description"]'),
      ogUrl: meta('meta[property="og:url"]'),
      ogImage: meta('meta[property="og:image"]'),
      ogImageWidth: meta('meta[property="og:image:width"]'),
      ogImageHeight: meta('meta[property="og:image:height"]'),
      twitterTitle: meta('meta[name="twitter:title"]'),
      twitterDescription: meta('meta[name="twitter:description"]'),
      canonical: links("canonical"),
    };
  });
}

const seenTitles = new Map<string, string>();

for (const path of PAGES) {
  test(`${path} previews as itself`, async ({ page }) => {
    await page.goto(path);
    const h = await head(page);
    const expectedUrl = path === "/" ? SITE : `${SITE}${path}`;

    expect(h.description, `${path} has one meta description`).toHaveLength(1);
    expect(h.ogTitle, `${path} og:title`).toEqual([h.title]);
    expect(h.ogDescription, `${path} og:description`).toEqual(h.description);
    expect(h.twitterTitle, `${path} twitter:title`).toEqual([h.title]);
    expect(h.twitterDescription, `${path} twitter:description`).toEqual(h.description);

    expect(h.ogUrl, `${path} og:url`).toEqual([expectedUrl]);
    expect(h.canonical, `${path} canonical`).toEqual([expectedUrl]);

    expect(h.ogImage, `${path} og:image`).toEqual([`${SITE}/og.png`]);
    expect(h.ogImageWidth).toEqual(["1200"]);
    expect(h.ogImageHeight).toEqual(["630"]);

    // The bug this guards was every page sharing one preview. Distinct
    // titles are what a person scrolling a chat actually sees.
    const other = seenTitles.get(h.title);
    expect(other, `${path} shares its title with ${other}`).toBeUndefined();
    seenTitles.set(h.title, path);
  });
}

test("the preview image is the real 1200×630 file", async ({ request }) => {
  const res = await request.get("/og.png");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  const png = await res.body();
  // IHDR: width and height are big-endian u32s at bytes 16 and 20.
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(630);
});

test("a page robots.txt disallows keeps the defaults and claims no canonical", async ({ page }) => {
  await page.goto("/sign-in");
  const h = await head(page);
  expect(h.canonical).toEqual([]);
  expect(h.ogUrl).toEqual([]);
  expect(h.ogImage).toEqual([`${SITE}/og.png`]);
});
