import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { LEGAL_LAST_UPDATED, SITE_URL } from "@/lib/site";

const entries = sitemap();
const LEGAL_PATHS = ["/terms", "/privacy", "/refunds"];

/** "/pricing" from "https://triviafoundry.com/pricing"; "/" from the bare origin. */
function pathnameOf(url: string | URL): string {
  return new URL(url).pathname;
}

/**
 * Whether `dir` holds a page.tsx for the remaining path segments. A segment
 * may be matched by a dynamic `[param]` directory, which is how
 * /quizzes/halloween is served (src/app/quizzes/[slug]). Which slugs exist is
 * the quiz list's business, and src/content/quizzes/quizzes.test.ts checks it.
 */
function hasPage(dir: string, segments: string[]): boolean {
  if (segments.length === 0) return existsSync(path.join(dir, "page.tsx"));
  const [head, ...rest] = segments;
  const exact = path.join(dir, head);
  if (existsSync(exact) && hasPage(exact, rest)) return true;
  return readdirSync(dir, { withFileTypes: true }).some(
    (item) => item.isDirectory() && /^\[[^\].]+\]$/.test(item.name) && hasPage(path.join(dir, item.name), rest),
  );
}

describe("sitemap.xml", () => {
  it("lists every URL as an absolute URL on the canonical origin", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const url = String(entry.url);
      expect(url.startsWith(`${SITE_URL}/`) || url === SITE_URL).toBe(true);
    }
  });

  it("lists each page once, with no trailing slash to split the canonical URL", () => {
    const urls = entries.map((e) => String(e.url));
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) {
      expect(url === SITE_URL || !url.endsWith("/")).toBe(true);
    }
  });

  it("points only at pages that exist in the app directory", () => {
    for (const entry of entries) {
      const pathname = pathnameOf(entry.url);
      const segments = pathname === "/" ? [] : pathname.slice(1).split("/");
      expect(hasPage(__dirname, segments), `${pathname} has no page.tsx`).toBe(true);
    }
  });

  it("does not advertise a pack, host or play URL", () => {
    // Those trees are owner-only or per-session; robots.ts disallows them,
    // and a sitemap entry blocked by robots.txt is a Search Console error.
    for (const entry of entries) {
      expect(pathnameOf(entry.url)).not.toMatch(/^\/(packs|host|play|api)\b/);
    }
  });

  it("dates the legal pages with the same date the pages print", () => {
    for (const legalPath of LEGAL_PATHS) {
      const entry = entries.find((e) => pathnameOf(e.url) === legalPath);
      expect(entry, `${legalPath} missing from the sitemap`).toBeDefined();
      expect(entry?.lastModified).toBe(LEGAL_LAST_UPDATED);
    }
  });

  it("leaves changeFrequency and priority unset", () => {
    // Google ignores both. Setting them invites someone to maintain numbers
    // that mean nothing; see the note in sitemap.ts.
    for (const entry of entries) {
      expect(entry.changeFrequency).toBeUndefined();
      expect(entry.priority).toBeUndefined();
    }
  });
});
