import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Served at /robots.txt, which returned the branded 404 page until
 * 2026-09-17 because no route existed — so the first request a crawler makes
 * to the site got an error, and every path looked equally fair game.
 *
 * The disallow list is about crawl budget now rather than about privacy.
 * Pack reads are owner-only (src/lib/pack-access.ts), so a crawler that
 * found a /packs URL would get a redirect to /sign-in rather than an answer
 * sheet — but an advertised URL that 307s is a Search Console error, and
 * `/packs/<id>/print` is still the answer sheet to anyone who is signed in,
 * so the whole /packs tree stays out of the index. /host and /play are
 * per-session and gated on a host key or a team token: there is nothing
 * there to index, and a stale result would only send someone to a quiz that
 * finished months ago.
 *
 * /create and /sign-in join the list now that hosting needs an account.
 * /create redirects a signed-out visitor, so there is nothing there to
 * index; /sign-in is a form. Both also carry a `noindex` where they can (see
 * src/app/sign-in/page.tsx) — the disallow is what stops the crawl
 * happening at all, and the meta tag is what still holds for a crawler that
 * ignores robots.txt but honours a meta tag.
 *
 * Left crawlable: the homepage, /pricing and the three legal pages —
 * exactly what sitemap.ts lists.
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
        disallow: ["/api/", "/packs", "/host/", "/play", "/create", "/sign-in"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
