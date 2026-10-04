import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SiteAnalytics } from "@/components/SiteAnalytics";
import { SiteFooter } from "@/components/SiteFooter";
import { HOME_DESCRIPTION, HOME_TITLE, OG_IMAGE, SITE_NAME } from "@/lib/page-metadata";
import { SITE_URL } from "@/lib/site";
import manifest from "./manifest";
import "./globals.css";

// All three faces are self-hosted from src/fonts (see the README there) so
// the build never depends on Google Fonts being reachable.

// The sign face: a slab serif with the weight of a painted pub sign. One
// weight, no italic — globals.css switches font-synthesis off for it so the
// headings that still ask for font-semibold don't get a faux bold.
const display = localFont({
  variable: "--font-display",
  src: "../fonts/alfa-slab-one-latin-400-normal.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
});

const body = localFont({
  variable: "--font-body",
  src: "../fonts/nunito-sans-latin-wght-normal.woff2",
  weight: "200 1000",
  style: "normal",
  display: "swap",
});

const mono = localFont({
  variable: "--font-mono-plex",
  src: [
    { path: "../fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/ibm-plex-mono-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute base for the share-card URLs below. The origin is shared with
  // sitemap.ts and robots.ts, so it comes from src/lib/site.ts rather than
  // being spelled out here a third time.
  metadataBase: new URL(SITE_URL),
  // The defaults for pages that set no preview of their own — in practice
  // the ones robots.ts disallows. Every crawlable page, the homepage
  // included, sets its own through pageMetadata() (src/lib/page-metadata.ts),
  // because a page that sets `openGraph` replaces this object rather than
  // merging with it. No canonical here on purpose: a layout-level canonical
  // would tell a crawler every page is the homepage.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: HOME_TITLE,
    description: "Writes your pub quiz or trivia night, then runs it live.",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: "Writes your pub quiz or trivia night, then runs it live.",
    images: [{ url: OG_IMAGE.url, alt: OG_IMAGE.alt }],
  },
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  applicationName: "TriviaFoundry",
  // Installable from the browser menu (Chromium, iOS 16.4+). No service
  // worker on purpose: the live session is polling, so an "offline" shell
  // would only look alive while being dead. manifest.ts carries the rest.
  appleWebApp: { capable: true, title: "TriviaFoundry", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  // Stage green, the same token manifest.ts uses for theme_color: it colours
  // the phone's browser chrome and the installed app's status bar, so the
  // two must not drift apart. Read from the manifest rather than repeated as
  // a literal — the visual-identity redesign moved this colour and dropped
  // this export entirely, which took the meta tag off every page with
  // nothing in the unit suite to notice.
  themeColor: manifest().theme_color,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Rendered here rather than per page so the legal links Paddle's
            website review looks for are reachable from everywhere by
            default. It removes itself on the live-night and print surfaces —
            see SiteFooter. */}
        <SiteFooter />
        <SiteAnalytics />
      </body>
    </html>
  );
}
