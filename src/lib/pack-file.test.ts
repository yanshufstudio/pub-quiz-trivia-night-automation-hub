import { describe, expect, it } from "vitest";
import { PACK_FILE_FORMAT, PACK_FILE_VERSION, packFileSchema, toPackFile } from "@/lib/pack-file";

const round = {
  title: "Warm-Up",
  category: "General Knowledge",
  questions: [
    { text: "Capital of Australia?", answer: "Canberra", points: 1, type: "TEXT" as const },
    {
      text: "Continents?",
      answer: "Seven",
      points: 2,
      type: "TEXT" as const,
      acceptableAnswers: ["7", "VII"],
    },
    {
      text: "Red planet?",
      answer: "Mars",
      points: 1,
      type: "MULTIPLE_CHOICE" as const,
      options: ["Mars", "Venus", "Jupiter"],
    },
  ],
};

describe("packFileSchema", () => {
  it("accepts a file with the envelope and keeps acceptableAnswers and options", () => {
    const result = packFileSchema.safeParse({
      format: PACK_FILE_FORMAT,
      version: PACK_FILE_VERSION,
      title: "Pack",
      prompt: "A brief",
      rounds: [round],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.prompt).toBe("A brief");
    expect(result.data.rounds[0].questions[1].acceptableAnswers).toEqual(["7", "VII"]);
    expect(result.data.rounds[0].questions[2].options).toEqual(["Mars", "Venus", "Jupiter"]);
  });

  it("rejects a file with the wrong format tag", () => {
    const result = packFileSchema.safeParse({ format: "something-else", version: 1, title: "P", rounds: [round] });
    expect(result.success).toBe(false);
  });

  it("rejects a newer version than this build understands", () => {
    const result = packFileSchema.safeParse({
      format: PACK_FILE_FORMAT,
      version: PACK_FILE_VERSION + 1,
      title: "P",
      rounds: [round],
    });
    expect(result.success).toBe(false);
  });

  it("applies the generated-pack defaults so a hand-written file can omit points and type", () => {
    const result = packFileSchema.safeParse({
      format: PACK_FILE_FORMAT,
      version: PACK_FILE_VERSION,
      title: "P",
      rounds: [{ title: "R", category: "C", questions: [{ text: "Q?", answer: "A" }] }],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.rounds[0].questions[0].points).toBe(1);
    expect(result.data.rounds[0].questions[0].type).toBe("TEXT");
    expect(result.data.prompt).toBeUndefined();
  });
});

describe("toPackFile", () => {
  it("strips ids and timestamps and round-trips through the schema", () => {
    const file = toPackFile({
      id: "pack1",
      title: "Pack",
      prompt: "A brief",
      createdAt: "2026-09-07T00:00:00.000Z",
      rounds: [
        {
          id: "r1",
          index: 0,
          title: "Warm-Up",
          category: "General Knowledge",
          questions: [
            {
              id: "q1",
              index: 0,
              text: "Continents?",
              answer: "Seven",
              points: 2,
              type: "TEXT",
              options: [],
              acceptableAnswers: ["7"],
              hasMedia: false,
            },
            {
              id: "q2",
              index: 1,
              text: "Red planet?",
              answer: "Mars",
              points: 1,
              type: "MULTIPLE_CHOICE",
              options: ["Mars", "Venus"],
              acceptableAnswers: [],
              hasMedia: false,
            },
          ],
        },
      ],
    });
    expect(file.format).toBe(PACK_FILE_FORMAT);
    expect(file.version).toBe(PACK_FILE_VERSION);
    expect(JSON.stringify(file)).not.toContain('"id"');
    expect(JSON.stringify(file)).not.toContain("createdAt");
    // TEXT questions carry no options key, and empty acceptableAnswers is
    // omitted, so the file stays as small and readable as the generator's.
    expect(file.rounds[0].questions[0]).toEqual({
      text: "Continents?",
      answer: "Seven",
      points: 2,
      type: "TEXT",
      acceptableAnswers: ["7"],
    });
    expect(file.rounds[0].questions[1]).toEqual({
      text: "Red planet?",
      answer: "Mars",
      points: 1,
      type: "MULTIPLE_CHOICE",
      options: ["Mars", "Venus"],
    });
    expect(packFileSchema.safeParse(JSON.parse(JSON.stringify(file))).success).toBe(true);
  });
});
