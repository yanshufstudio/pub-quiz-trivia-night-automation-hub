import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Served at /robots.txt, which returned the branded 404 page until
 * 2026-09-17 because no route existed — so the first request a crawler makes
 * to the site got an error, and every path looked equally fair game.
 *
 * The disallow list is about pack privacy as much as crawl budget.
 * `src/lib/pack-access.ts` keeps reads by id open on purpose ("unlisted,
 * cuid ids") so the demo pack, the PDF export and the print sheets work
 * without an account. Unlisted stops being private the moment a crawler
 * finds the URL, and `/packs/<id>/print` *is* the answer sheet, so the whole
 * /packs tree stays out of the index. /host and /play are per-session and
 * gated on a host key or a team token: there is nothing there to index, and
 * a stale result would only send someone to a quiz that finished months ago.
 *
 * Left crawlable: the homepage, /create and the three legal pages — exactly
 * what sitemap.ts lists.
 *
 * The trailing slashes are deliberate and not uniform. `/api/` and `/host/`
 * have one because only nested routes exist under them, so a future
 * /hosting-guide page stays crawlable. `/packs` and `/play` have none
 * because the bare path is itself a page and `Disallow: /packs/` would not
 * match `/packs`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/packs", "/host/", "/play"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
