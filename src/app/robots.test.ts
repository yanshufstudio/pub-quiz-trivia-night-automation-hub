import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { SITE_URL } from "@/lib/site";

const result = robots();
const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
const wildcard = rules.find((r) => r.userAgent === "*" || r.userAgent?.includes("*"));

function asArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Longest-match-wins, the way Google resolves a path against a group, with
 * ties going to Allow. Enough for the prefix-only rules this file emits — it
 * knows nothing about `*` or `$` wildcards, which robots.ts does not use.
 */
function isAllowed(pathname: string): boolean {
  const longestMatch = (patterns: string[]) =>
    patterns.filter((p) => pathname.startsWith(p)).reduce((a, b) => (b.length > a.length ? b : a), "");
  const allow = longestMatch(asArray(wildcard?.allow));
  const disallow = longestMatch(asArray(wildcard?.disallow));
  return allow.length >= disallow.length;
}

/** Every route with a page.tsx under src/app, with dynamic segments filled in. */
function pageRoutes(dir = __dirname, prefix = ""): string[] {
  const found: string[] = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (item.isFile() && item.name === "page.tsx") found.push(prefix || "/");
    if (!item.isDirectory() || item.name.startsWith("_") || item.name === "api") continue;
    // [id] and [code] stand for a real cuid or room code; any value crawls the same.
    const segment = item.name.startsWith("[") ? "sample" : item.name;
    found.push(...pageRoutes(path.join(dir, item.name), `${prefix}/${segment}`));
  }
  return found;
}

describe("robots.txt", () => {
  it("addresses every crawler in one group and points at the sitemap", () => {
    expect(wildcard).toBeDefined();
    expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it("keeps quiz packs, print sheets, live sessions and the API out of the index", () => {
    // /packs is readable by id on purpose (unlisted cuids, see
    // src/lib/pack-access.ts) and /packs/<id>/print is the answer sheet.
    expect(isAllowed("/packs")).toBe(false);
    expect(isAllowed("/packs/cmu2qdlry000004kwpuii81g5")).toBe(false);
    expect(isAllowed("/packs/cmu2qdlry000004kwpuii81g5/print")).toBe(false);
    expect(isAllowed("/host/QUIZ42")).toBe(false);
    expect(isAllowed("/play")).toBe(false);
    expect(isAllowed("/play?code=QUIZ42")).toBe(false);
    expect(isAllowed("/api/packs")).toBe(false);
  });

  it("leaves the marketing and legal pages crawlable", () => {
    for (const pathname of ["/", "/create", "/terms", "/privacy", "/refunds"]) {
      expect(isAllowed(pathname), `${pathname} should be crawlable`).toBe(true);
    }
  });

  it("allows every URL the sitemap advertises", () => {
    // A sitemap entry that robots.txt blocks is a Search Console error.
    for (const entry of sitemap()) {
      const pathname = new URL(entry.url).pathname;
      expect(isAllowed(pathname), `${pathname} is in the sitemap but disallowed`).toBe(true);
    }
  });

  it("accounts for every page in the app: either in the sitemap or disallowed", () => {
    // The point of this one is the page that does not exist yet. A new route
    // fails here until someone decides whether it belongs in search.
    const listed = new Set(sitemap().map((e) => new URL(e.url).pathname));
    for (const route of pageRoutes()) {
      const decided = listed.has(route) || !isAllowed(route);
      expect(decided, `${route} is crawlable but not in the sitemap — add it or disallow it`).toBe(true);
    }
  });
});
