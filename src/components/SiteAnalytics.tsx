"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics (SEO2): cookieless page-view counts.
 *
 * A client component only because `beforeSend` is a function, which a server
 * component cannot hand to a client one. Rendered once from the root layout.
 *
 * `beforeSend` drops the query string and fragment from every URL before it
 * leaves the browser. The one query string on this site that matters is the
 * join link's `?code=` (src/lib/join-url.ts) — the key to a live room — and
 * /privacy says the page address is sent without it, so this is what keeps
 * that sentence true. Paths are kept: they are what the dashboard is for.
 *
 * Until Web Analytics is enabled for the project in the Vercel dashboard,
 * /_vercel/insights/script.js answers 404 and the package logs one
 * console.log line; nothing throws, nothing is stored, no cookie is set
 * (e2e/analytics.spec.ts).
 */
export function stripQuery(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const url = new URL(event.url);
    url.search = "";
    url.hash = "";
    return { ...event, url: url.toString() };
  } catch {
    // Unparseable: drop the event rather than send a URL we could not clean.
    return null;
  }
}

export function SiteAnalytics() {
  return <Analytics beforeSend={stripQuery} />;
}
