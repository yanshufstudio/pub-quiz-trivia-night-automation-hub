import type { Metadata, Viewport } from "next";
import { Caveat, Fraunces, IBM_Plex_Mono, Work_Sans } from "next/font/google";
import manifest from "./manifest";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
  style: ["normal", "italic"],
});

const body = Work_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono-plex",
  subsets: ["latin"],
  weight: ["500", "600"],
});

// A hand-chalk marker face, used sparingly for short scrawled accents on
// the dark "stage" surfaces (see .chalk-script in globals.css) — never for
// body copy.
const chalk = Caveat({
  variable: "--font-chalk",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "Pub Quiz Automation Hub",
  description: "AI-generated pub quiz packs, presenter scripts, and a live team portal.",
  applicationName: "Pub Quiz Hub",
  // Installable from the browser menu (Chromium, iOS 16.4+). No service
  // worker on purpose: the live session is polling, so an "offline" shell
  // would only look alive while being dead. manifest.ts carries the rest.
  appleWebApp: { capable: true, title: "Quiz Hub", statusBarStyle: "black-translucent" },
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
      className={`${display.variable} ${body.variable} ${mono.variable} ${chalk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
