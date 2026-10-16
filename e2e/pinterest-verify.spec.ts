import { test, expect } from "@playwright/test";

/**
 * Pinterest's domain claim, read from the HTML exactly as the server sends it.
 *
 * Pinterest's crawler runs no JavaScript, so a browser-side check (page.goto,
 * then looking at document.head) would pass for a tag added after load and
 * still fail the claim. This is a plain HTTP request, once as an ordinary
 * client and once as Pinterestbot, because Next may stream metadata into
 * <body> for user agents it does not list as HTML-limited bots.
 */

const TAG = '<meta name="p:domain_verify" content="ef96d33147c907989bd2042961c0d28d"';

const CLIENTS = {
  "a plain client": undefined,
  Pinterestbot: "Mozilla/5.0 (compatible; Pinterestbot/1.0; +http://www.pinterest.com/bot.html)",
};

for (const [name, userAgent] of Object.entries(CLIENTS)) {
  test(`the raw HTML of / carries the Pinterest verification tag in <head> for ${name}`, async ({
    request,
  }) => {
    const res = await request.get("/", userAgent ? { headers: { "user-agent": userAgent } } : {});
    expect(res.status()).toBe(200);
    const html = await res.text();

    expect(html.split(TAG), "exactly one p:domain_verify tag").toHaveLength(2);
    const at = html.indexOf(TAG);
    expect(at, "the tag comes before </head>").toBeLessThan(html.indexOf("</head>"));
  });
}
