import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SiteFooter } from "@/components/SiteFooter";
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

const OG_ALT =
  "Triviafoundry: writes your pub quiz or trivia night, then runs it live. A live scoreboard on a dark pub-green background.";

export const metadata: Metadata = {
  // Absolute base for the share-card URLs below. public/og.png is rendered
  // by scripts/render-og.ts (npm run og).
  metadataBase: new URL("https://triviafoundry.com"),
  openGraph: {
    type: "website",
    siteName: "Triviafoundry",
    title: "Triviafoundry — pub quiz and trivia night packs, written and run live",
    description: "Writes your pub quiz or trivia night, then runs it live.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: OG_ALT }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Triviafoundry — pub quiz and trivia night packs, written and run live",
    description: "Writes your pub quiz or trivia night, then runs it live.",
    images: [{ url: "/og.png", alt: OG_ALT }],
  },
  title: "Triviafoundry — pub quiz and trivia night packs, written and run live",
  description:
    "Writes your pub quiz or trivia night, then runs it live. Describe the rounds you want; get a full pack, a presenter script and printed answer sheets, then run it with teams on their phones.",
  applicationName: "Triviafoundry",
  // Installable from the browser menu (Chromium, iOS 16.4+). No service
  // worker on purpose: the live session is polling, so an "offline" shell
  // would only look alive while being dead. manifest.ts carries the rest.
  appleWebApp: { capable: true, title: "Triviafoundry", statusBarStyle: "black-translucent" },
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
      </body>
    </html>
  );
}
