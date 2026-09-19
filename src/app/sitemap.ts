import type { MetadataRoute } from "next";
import { LEGAL_LAST_UPDATED, SITE_URL } from "@/lib/site";

/**
 * Served at /sitemap.xml and pointed at from robots.txt.
 *
 * Only the five pages a stranger can land on cold and get something from.
 * Everything else is per-session (/host, /play), unlisted by design (/packs
 * and the print sheets beneath it — see `src/lib/pack-access.ts`), behind an
 * account, or an API route, and robots.ts disallows all of them. Listing a
 * URL here that robots.txt blocks is the one sitemap mistake Search Console
 * actually complains about, so the two files are meant to be read together
 * and `sitemap.test.ts` checks they still agree.
 *
 * /create was listed here until host accounts landed. It now redirects a
 * signed-out visitor to /sign-in, so there is no longer a page there for a
 * crawler to index — an advertised URL that 307s is a Search Console error,
 * not an SEO opportunity. The homepage still carries the wizard's pitch and
 * the link to it.
 *
 * No `changeFrequency` and no `priority`: Google has said for years that it
 * ignores both, and a number nobody maintains is worse than no number.
 * `lastModified` appears only where a real date exists — the legal pages
 * already print theirs at the top of the page.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL },
    { url: `${SITE_URL}/pricing` },
    { url: `${SITE_URL}/terms`, lastModified: LEGAL_LAST_UPDATED },
    { url: `${SITE_URL}/privacy`, lastModified: LEGAL_LAST_UPDATED },
    { url: `${SITE_URL}/refunds`, lastModified: LEGAL_LAST_UPDATED },
  ];
}
