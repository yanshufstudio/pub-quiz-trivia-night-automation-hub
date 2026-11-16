import { describe, expect, it } from "vitest";
import { isValidElement } from "react";
import { errorText, getT, LANGUAGES, languageMeta } from "@/i18n";
import { MESSAGES } from "@/i18n/messages";

/**
 * L1: a language is a message file. These are the checks that make adding one
 * safe: every file has every key English has, no extra ones, the same plural
 * shape and the same placeholders, so a translation can never drop a team name
 * or a score out of a sentence.
 */

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): Map<string, string | Tree> {
  const out = new Map<string, string | Tree>();
  for (const [key, value] of Object.entries(tree)) {
    const path = `${prefix}${key}`;
    if (typeof value === "string" || "other" in value) out.set(path, value);
    else for (const [k, v] of leaves(value, `${path}.`)) out.set(k, v);
  }
  return out;
}

const placeholders = (message: string | Tree) =>
  [...new Set(JSON.stringify(message).match(/\{\w+\}/g) ?? [])].sort();

const english = leaves(MESSAGES.en as unknown as Tree);

describe.each(LANGUAGES)("the %s message file", (lang) => {
  const mine = leaves(MESSAGES[lang] as unknown as Tree);

  it("has every key English has, and no others", () => {
    expect([...mine.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it("uses the same placeholders in every message", () => {
    const meta = /^meta\./;
    const differ = [...english]
      .filter(([key]) => !meta.test(key))
      .filter(([key, message]) => {
        const theirs = mine.get(key);
        if (theirs === undefined) return false;
        // A plural can drop {count} in a form that spells the number out.
        const strip = (list: string[]) => list.filter((p) => p !== "{count}" && p !== "{n}");
        return JSON.stringify(strip(placeholders(theirs))) !== JSON.stringify(strip(placeholders(message)));
      })
      .map(([key]) => key);
    expect(differ).toEqual([]);
  });

  it("gives every count an `other` form, and a plural object wherever English has one", () => {
    for (const [key, message] of english) {
      const theirs = mine.get(key);
      expect(typeof theirs, key).toBe(typeof message);
      if (typeof theirs === "object") expect(typeof theirs.other, key).toBe("string");
    }
  });

  it("says its name, direction and Intl locale", () => {
    const meta = languageMeta(lang);
    expect(meta.name).toBeTruthy();
    expect(["ltr", "rtl"]).toContain(meta.dir);
    expect(() => new Intl.PluralRules(meta.intl)).not.toThrow();
  });
});

describe("the translator", () => {
  const t = getT("en");

  it("fills placeholders and picks plural forms by count", () => {
    expect(t("common.points", { count: 1 })).toBe("1 point");
    expect(t("common.points", { count: 0 })).toBe("0 points");
    expect(t("common.pts", { count: 2 })).toBe("2 pts");
    expect(t("team.youreIn", { team: "Quizzly Bears" })).toBe("You’re in, Quizzly Bears.");
  });

  it("formats numbers for the language", () => {
    expect(t("common.points", { count: 1200 })).toBe("1,200 points");
  });

  it("writes ordinals the way the old English helper did", () => {
    const cases: [number, string][] = [
      [1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"], [11, "11th"], [12, "12th"], [13, "13th"],
      [21, "21st"], [22, "22nd"], [23, "23rd"], [101, "101st"], [111, "111th"], [112, "112th"],
    ];
    for (const [n, expected] of cases) expect(t.ordinal(n)).toBe(expected);
  });

  it("joins names in a sentence", () => {
    expect(t.list(["A"])).toBe("A");
    expect(t.list(["A", "B"])).toBe("A and B");
    expect(t.list(["A", "B", "C"])).toBe("A, B and C");
  });

  it("puts React nodes into a sentence", () => {
    const node = { type: "span", props: {}, key: null } as unknown;
    const parts = t.rich("team.youSaid", { answer: node as React.ReactNode }) as React.ReactElement<{
      children: unknown;
    }>[];
    expect(parts.map((p) => (isValidElement(p) ? p.props.children : p))).toEqual(["You said: ", node, ""]);
  });

  it("refuses a key no file has", () => {
    // @ts-expect-error not a key
    expect(() => t("nope.never")).toThrow(/nope\.never/);
  });

  it("dates through Intl", () => {
    expect(t.date("2026-11-16T12:00:00Z", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })).toBe(
      "16 November 2026"
    );
  });
});

describe("errorText", () => {
  const t = getT("en");

  it("prefers the message for the error's code", () => {
    expect(errorText(t, { code: "noSuchCode", error: "Server words" }, "team.couldNotJoin")).toBe("Server words");
  });

  it("falls back to the server's text, then to the screen's own words", () => {
    expect(errorText(t, { error: "Server words" }, "team.couldNotJoin")).toBe("Server words");
    expect(errorText(t, {}, "team.couldNotJoin")).toBe("Could not join");
    expect(errorText(t, null, "team.couldNotJoin")).toBe("Could not join");
  });
});
