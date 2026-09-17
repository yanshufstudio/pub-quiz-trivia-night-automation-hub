import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTACT_EMAIL, LEGAL_LAST_UPDATED, SITE_URL } from "@/lib/site";

const APP_DIR = path.resolve(__dirname, "../app");

/** Every .ts/.tsx file under src/app, as [repo-relative path, contents]. */
function appSources(dir = APP_DIR): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...appSources(full));
    else if (/\.tsx?$/.test(item.name) && !item.name.endsWith(".test.ts")) {
      out.push([path.relative(APP_DIR, full), readFileSync(full, "utf8")]);
    }
  }
  return out;
}

const sources = appSources();

describe("site constants", () => {
  it("gives the canonical origin as https with no trailing slash", () => {
    expect(SITE_URL).toMatch(/^https:\/\/[^/]+$/);
  });

  it("publishes a contact address that looks like one", () => {
    expect(CONTACT_EMAIL).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/);
  });

  it("dates the legal pages in ISO order so the sitemap can publish it verbatim", () => {
    expect(LEGAL_LAST_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(LEGAL_LAST_UPDATED))).toBe(false);
  });
});

describe("no page keeps its own copy of these", () => {
  // The whole point of src/lib/site.ts. Before 2026-09-17 the contact address
  // was written out five times across three legal pages and had drifted from
  // the one the GitHub organisation publishes; nobody noticed because each
  // copy looked fine on its own. These two tests are what notices.

  it("writes no mailto: link outside the shared ContactLink component", () => {
    const offenders = sources.filter(([, text]) => text.includes("mailto:")).map(([file]) => file);
    expect(offenders, "use <ContactLink /> from @/components/LegalPage").toEqual([]);
  });

  it("spells the contact address nowhere but src/lib/site.ts", () => {
    const offenders = sources.filter(([, text]) => text.includes(CONTACT_EMAIL)).map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it("builds metadataBase, robots.txt and the sitemap from SITE_URL", () => {
    const origin = SITE_URL.replace(/^https:\/\//, "");
    for (const file of ["layout.tsx", "robots.ts", "sitemap.ts"]) {
      const text = readFileSync(path.join(APP_DIR, file), "utf8");
      const code = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""); // comments may name the domain
      expect(code.includes(origin), `${file} hard-codes the origin`).toBe(false);
      expect(code.includes("SITE_URL"), `${file} should import SITE_URL`).toBe(true);
    }
  });
});
