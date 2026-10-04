import type { Metadata } from "next";

/**
 * Link-preview metadata for the pages a crawler is allowed to read.
 *
 * Next merges `metadata` across segments **shallowly**: a page that sets
 * `title` and `description` but not `openGraph` inherits the root layout's
 * whole `openGraph` object. Until 2026-09-27 that meant every public page —
 * /pricing, /terms, /refunds and the rest — was shared with the homepage's
 * title and blurb, and none of them said which URL it was. A page that sets
 * `openGraph` at all replaces the layout's object entirely, so the share
 * image and site name have to travel with it; this helper is what keeps them
 * together.
 *
 * Only for the pages robots.ts leaves crawlable (and sitemap.ts lists). The
 * disallowed ones — /packs, /host, /play, /create, /sign-in — keep the
 * layout's defaults and carry no canonical.
 */

const OG_IMAGE_ALT =
  "TriviaFoundry: writes your pub quiz or trivia night, then runs it live. A live scoreboard on a dark pub-green background.";

/** public/og.png, rendered by scripts/render-og.ts (npm run og). */
export const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: OG_IMAGE_ALT } as const;

export const SITE_NAME = "TriviaFoundry";

export const HOME_TITLE = "TriviaFoundry — pub quiz and trivia night packs, written and run live";

export const HOME_DESCRIPTION =
  "Writes your pub quiz or trivia night, then runs it live. Describe the rounds you want; get a full pack, a presenter script and printed answer sheets, then run it with teams on their phones.";

/**
 * `path` is relative to `metadataBase` (set in the root layout), so `/pricing`
 * resolves to https://triviafoundry.com/pricing for both og:url and the
 * canonical link.
 */
export function pageMetadata({
  path,
  title,
  description,
}: {
  path: string;
  title: string;
  description: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: path,
      title,
      description,
      images: [OG_IMAGE],
    },
    // Same reason as openGraph: without its own object a page inherits the
    // homepage's twitter:title and twitter:description.
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: OG_IMAGE.url, alt: OG_IMAGE.alt }],
    },
  };
}
