import { describe, expect, it } from "vitest";
import { isLikelyCorrect, normalizeAnswer } from "@/lib/scoring";

describe("normalizeAnswer", () => {
  it("lowercases and trims", () => {
    expect(normalizeAnswer("  Canberra  ")).toBe("canberra");
  });

  it("strips a leading article", () => {
    expect(normalizeAnswer("The Beatles")).toBe("beatles");
    expect(normalizeAnswer("A Streetcar")).toBe("streetcar");
    expect(normalizeAnswer("An Apple")).toBe("apple");
  });

  it("strips punctuation and collapses whitespace", () => {
    expect(normalizeAnswer("Leonardo, DiCaprio!")).toBe("leonardo dicaprio");
    expect(normalizeAnswer("Spice   Girls")).toBe("spice girls");
  });
});

describe("isLikelyCorrect", () => {
  it("matches case- and punctuation-insensitively", () => {
    expect(isLikelyCorrect("canberra", "Canberra")).toBe(true);
    expect(isLikelyCorrect("the beatles", "Beatles")).toBe(true);
    expect(isLikelyCorrect("mars.", "Mars")).toBe(true);
  });

  it("rejects wrong answers", () => {
    expect(isLikelyCorrect("Venus", "Mars")).toBe(false);
    expect(isLikelyCorrect("", "Mars")).toBe(false);
  });

  it("also matches any of the host-approved acceptable answers", () => {
    expect(isLikelyCorrect("7", "Seven", ["7", "VII"])).toBe(true);
    expect(isLikelyCorrect("vii", "Seven", ["7", "VII"])).toBe(true);
    expect(isLikelyCorrect("Seven", "Seven", ["7", "VII"])).toBe(true);
  });

  it("normalizes acceptable answers the same way as the primary answer", () => {
    expect(isLikelyCorrect("the streetcar", "A Named Desire", ["The Streetcar"])).toBe(true);
  });

  it("still rejects an answer matching neither the primary nor any acceptable answer", () => {
    expect(isLikelyCorrect("8", "Seven", ["7", "VII"])).toBe(false);
  });

  it("defaults to no acceptable answers when the argument is omitted", () => {
    expect(isLikelyCorrect("7", "Seven")).toBe(false);
  });
});

// Everything below covers scripts the original ASCII-only character class
// deleted outright. The bug it guards against is not "an accent is dropped"
// but "a whole quiz scores every team correct": when every answer normalizes
// to the empty string, every answer matches every other one.
describe("normalizeAnswer beyond ASCII", () => {
  it("keeps Hebrew instead of deleting it", () => {
    expect(normalizeAnswer("ירושלים")).toBe("ירושלים");
    expect(normalizeAnswer("תל אביב")).toBe("תל אביב");
  });

  it("strips niqqud, so a pointed answer matches an unpointed one", () => {
    expect(normalizeAnswer("יְרוּשָׁלַיִם")).toBe("ירושלים");
  });

  it("folds Latin accents rather than deleting the letter", () => {
    expect(normalizeAnswer("café")).toBe("cafe");
    expect(normalizeAnswer("Zoë")).toBe("zoe");
  });

  it("keeps CJK", () => {
    expect(normalizeAnswer("東京")).toBe("東京");
  });

  it("strips punctuation before the leading article, not after", () => {
    // Quoted, the article used to survive: the regex saw the opening quote
    // where it expected "the", so this stopped matching a bare "Beatles".
    expect(normalizeAnswer('"The Beatles"')).toBe("beatles");
    expect(normalizeAnswer("'The Beatles'")).toBe("beatles");
  });

  it("still empties a submission that is only punctuation", () => {
    expect(normalizeAnswer("!!!")).toBe("");
    expect(normalizeAnswer("   ")).toBe("");
  });
});

describe("isLikelyCorrect across scripts", () => {
  it("scores Hebrew right and wrong answers apart — single and multi-word", () => {
    expect(isLikelyCorrect("ירושלים", "ירושלים")).toBe(true);
    expect(isLikelyCorrect("תל אביב", "תל אביב")).toBe(true);
    expect(isLikelyCorrect("ירושלים", "תל אביב")).toBe(false);
    // Both of these used to normalize to a single space and match.
    expect(isLikelyCorrect("תל אביב", "באר שבע")).toBe(false);
  });

  it("ignores punctuation around a Hebrew answer", () => {
    expect(isLikelyCorrect("ירושלים!", "ירושלים")).toBe(true);
    expect(isLikelyCorrect("יְרוּשָׁלַיִם", "ירושלים")).toBe(true);
  });

  it("refuses an empty or punctuation-only submission against a Hebrew answer", () => {
    // The headline bug: both sides normalized to "" and matched, so a team
    // that submitted nothing at all was marked correct.
    expect(isLikelyCorrect("", "ירושלים")).toBe(false);
    expect(isLikelyCorrect("!!!", "ירושלים")).toBe(false);
    expect(isLikelyCorrect("   ", "ירושלים")).toBe(false);
  });

  it("matches accented Latin in both directions", () => {
    expect(isLikelyCorrect("cafe", "café")).toBe(true);
    expect(isLikelyCorrect("café", "cafe")).toBe(true);
  });

  it("scores CJK right and wrong answers apart", () => {
    expect(isLikelyCorrect("東京", "東京")).toBe(true);
    expect(isLikelyCorrect("東京", "大阪")).toBe(false);
  });

  it("matches a quoted answer carrying a leading article", () => {
    expect(isLikelyCorrect('"The Beatles"', "Beatles")).toBe(true);
  });

  it("applies all of this to the acceptable-answers path too", () => {
    expect(isLikelyCorrect("ירושלים", "Jerusalem", ["ירושלים"])).toBe(true);
    expect(isLikelyCorrect("cafe", "coffee house", ["café"])).toBe(true);
    expect(isLikelyCorrect("東京", "Tokyo", ["東京"])).toBe(true);
    // An acceptable answer that normalizes to nothing must not become a
    // wildcard that every punctuation-only submission matches.
    expect(isLikelyCorrect("!!!", "Mars", ["???"])).toBe(false);
  });
});
