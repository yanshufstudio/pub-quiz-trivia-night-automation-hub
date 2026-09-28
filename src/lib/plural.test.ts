import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { countOf } from "@/lib/plural";

describe("countOf", () => {
  it("drops the s at one", () => {
    expect(countOf(1, "round")).toBe("1 round");
    expect(countOf(1, "question")).toBe("1 question");
  });

  it("keeps it everywhere else, including zero", () => {
    expect(countOf(0, "round")).toBe("0 rounds");
    expect(countOf(2, "round")).toBe("2 rounds");
    expect(countOf(11, "question")).toBe("11 questions");
  });

  it("takes an explicit plural when the suffix will not do", () => {
    expect(countOf(1, "entry", "entries")).toBe("1 entry");
    expect(countOf(3, "entry", "entries")).toBe("3 entries");
  });
});

describe("no page re-invents the s", () => {
  /**
   * The bug was four independent hard-coded plurals, so the guard is that none
   * of them comes back. It matches an interpolated count immediately followed by
   * a bare plural noun — `{n} rounds`, `{count} questions` — which is exactly
   * the shape that was wrong.
   */
  const HARD_CODED = /\{[^{}]*\}\s+(rounds|questions|points|teams|packs)\b/;

  function tsxFiles(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) tsxFiles(full, found);
      else if (entry.endsWith(".tsx")) found.push(full);
    }
    return found;
  }

  it("has no interpolated count followed by a bare plural noun", () => {
    const offenders = tsxFiles("src")
      .filter((file) => HARD_CODED.test(readFileSync(file, "utf8")))
      .map((file) => {
        const line = readFileSync(file, "utf8")
          .split("\n")
          .find((l) => HARD_CODED.test(l));
        return `${file}: ${line?.trim()}`;
      });

    expect(offenders, "use countOf from @/lib/plural instead").toEqual([]);
  });
});
