import { describe, expect, it } from "vitest";
import { isValidOptionSet, parseOptions, serializeOptions, toQuestionView } from "@/lib/question-types";

describe("parseOptions", () => {
  it("parses a valid JSON array", () => {
    expect(parseOptions(JSON.stringify(["Mars", "Venus"]))).toEqual(["Mars", "Venus"]);
  });

  it("returns an empty array for null, undefined, or empty string", () => {
    expect(parseOptions(null)).toEqual([]);
    expect(parseOptions(undefined)).toEqual([]);
    expect(parseOptions("")).toEqual([]);
  });

  it("returns an empty array for malformed JSON instead of throwing", () => {
    expect(parseOptions("not json")).toEqual([]);
  });

  it("drops non-string entries and non-array JSON rather than throwing", () => {
    expect(parseOptions(JSON.stringify(["Mars", 5, null]))).toEqual(["Mars"]);
    expect(parseOptions(JSON.stringify({ not: "an array" }))).toEqual([]);
  });
});

describe("serializeOptions / parseOptions round-trip", () => {
  it("round-trips a list of options", () => {
    const options = ["Mars", "Venus", "Jupiter"];
    expect(parseOptions(serializeOptions(options))).toEqual(options);
  });
});

describe("isValidOptionSet", () => {
  it("accepts at least 2 distinct options including the answer", () => {
    expect(isValidOptionSet(["Mars", "Venus"], "Mars")).toBe(true);
  });

  it("rejects fewer than 2 distinct options", () => {
    expect(isValidOptionSet(["Mars"], "Mars")).toBe(false);
    expect(isValidOptionSet(["Mars", "Mars"], "Mars")).toBe(false);
  });

  it("rejects when the answer isn't among the options", () => {
    expect(isValidOptionSet(["Venus", "Jupiter"], "Mars")).toBe(false);
  });

  it("trims whitespace and drops blanks before counting", () => {
    expect(isValidOptionSet([" Mars ", "Venus", "  "], "Mars")).toBe(true);
    expect(isValidOptionSet(["Mars", "  "], "Mars")).toBe(false);
  });

  it("trims the answer symmetrically with the options", () => {
    // Regression: the model occasionally emits a trailing space on the
    // answer; the options were trimmed but the answer was not, so a
    // perfectly good multiple-choice question failed validation.
    expect(isValidOptionSet(["Nirvana", "Oasis"], "Nirvana ")).toBe(true);
    expect(isValidOptionSet(["Nirvana", "Oasis"], " Nirvana")).toBe(true);
  });
});

describe("toQuestionView", () => {
  it("narrows type and parses options from a raw row shape", () => {
    const raw = { id: "q1", type: "MULTIPLE_CHOICE", options: JSON.stringify(["A", "B"]) };
    expect(toQuestionView(raw)).toEqual({
      id: "q1",
      type: "MULTIPLE_CHOICE",
      options: ["A", "B"],
      acceptableAnswers: [],
      hasMedia: false,
    });
  });

  it("yields an empty options array for a TEXT question", () => {
    const raw = { id: "q2", type: "TEXT", options: null };
    expect(toQuestionView(raw)).toEqual({
      id: "q2",
      type: "TEXT",
      options: [],
      acceptableAnswers: [],
      hasMedia: false,
    });
  });

  it("also parses acceptableAnswers when present", () => {
    const raw = {
      id: "q3",
      type: "TEXT",
      options: null,
      acceptableAnswers: JSON.stringify(["Seven", "7"]),
    };
    expect(toQuestionView(raw)).toEqual({
      id: "q3",
      type: "TEXT",
      options: [],
      acceptableAnswers: ["Seven", "7"],
      hasMedia: false,
    });
  });

  it("reports hasMedia when the media relation was included", () => {
    const raw = { id: "q4", type: "TEXT", options: null, media: { id: "m1" } };
    expect(toQuestionView(raw)).toMatchObject({ id: "q4", hasMedia: true });
  });

  // The flag replaces the relation rather than sitting beside it: a pack
  // payload must never carry image data, so the relation is dropped here
  // whatever a caller selected into it.
  it("drops the media relation instead of passing it through", () => {
    const view = toQuestionView({ id: "q5", type: "TEXT", options: null, media: { id: "m2" } });
    expect(view).not.toHaveProperty("media");
    expect(JSON.stringify(view)).not.toContain("m2");
  });

  it("reports no media when the relation was included and is empty", () => {
    expect(toQuestionView({ id: "q6", type: "TEXT", options: null, media: null })).toMatchObject({ hasMedia: false });
  });
});
