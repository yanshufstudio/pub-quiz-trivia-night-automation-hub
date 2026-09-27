import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * /faq and /how-it-works tell hosts the printed sheets can only print
 * Western European letters for now (L23). That is a fact about the fonts
 * here: the sheets use the PDF standard Times faces, which carry WinAnsi
 * (cp1252) encoding and no embedded glyphs — measured 2026-09-27 by rendering
 * "Łódź" and "Dvořák", which came out as "Aódz" and "DvoYák", while French and
 * German came through intact.
 *
 * If this fails because a Unicode font was registered, the sheets have
 * probably learned more letters: rewrite the note on both pages to match what
 * they can now print, then update this test.
 */
const source = readFileSync(path.join(__dirname, "documents.tsx"), "utf8");

describe("PDF sheet fonts", () => {
  it("uses only the standard Times faces, which is what the Western-European note describes", () => {
    const families = new Set([...source.matchAll(/fontFamily:\s*"([^"]+)"/g)].map((m) => m[1]));
    expect(families.size).toBeGreaterThan(0);
    for (const family of families) {
      expect(["Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic"]).toContain(family);
    }
  });

  it("registers no font of its own", () => {
    expect(source).not.toMatch(/Font\.register/);
  });
});
