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

  it("still accepts a version 1 file — the version this build no longer writes but must keep reading", () => {
    const result = packFileSchema.safeParse({
      format: PACK_FILE_FORMAT,
      version: 1,
      title: "P",
      rounds: [round],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an embedded image on a question (version 2 only, but the field is just optional)", () => {
    const result = packFileSchema.safeParse({
      format: PACK_FILE_FORMAT,
      version: 2,
      title: "P",
      rounds: [
        {
          title: "R",
          category: "C",
          questions: [{ text: "Q?", answer: "A", image: { mime: "image/png", data: "AQIDBA==" } }],
        },
      ],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.rounds[0].questions[0].image).toEqual({ mime: "image/png", data: "AQIDBA==" });
  });

  it("rejects an image with an unsupported mime", () => {
    const result = packFileSchema.safeParse({
      format: PACK_FILE_FORMAT,
      version: 2,
      title: "P",
      rounds: [
        {
          title: "R",
          category: "C",
          questions: [{ text: "Q?", answer: "A", image: { mime: "image/gif", data: "AQIDBA==" } }],
        },
      ],
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

  it("embeds a question's media as base64, and omits the field entirely when there is none", () => {
    const file = toPackFile({
      id: "pack1",
      title: "Pack",
      prompt: "",
      createdAt: "2026-09-07T00:00:00.000Z",
      rounds: [
        {
          id: "r1",
          index: 0,
          title: "Picture Round",
          category: "General",
          questions: [
            {
              id: "q1",
              index: 0,
              text: "Which landmark?",
              answer: "Big Ben",
              points: 1,
              type: "TEXT",
              options: [],
              acceptableAnswers: [],
              hasMedia: true,
              media: { mime: "image/png", bytes: new Uint8Array([1, 2, 3, 4]) },
            },
            {
              id: "q2",
              index: 1,
              text: "No picture here",
              answer: "Correct",
              points: 1,
              type: "TEXT",
              options: [],
              acceptableAnswers: [],
              hasMedia: false,
              media: null,
            },
          ],
        },
      ],
    });

    expect(file.rounds[0].questions[0].image).toEqual({ mime: "image/png", data: "AQIDBA==" });
    expect(file.rounds[0].questions[1].image).toBeUndefined();
    // hasMedia itself is not a file field — only the bytes (as `image`) are.
    expect(JSON.stringify(file)).not.toContain("hasMedia");
    expect(packFileSchema.safeParse(JSON.parse(JSON.stringify(file))).success).toBe(true);
  });
});

describe("packFileSchema size ceilings", () => {
  const file = (rounds: unknown[]) => ({ format: PACK_FILE_FORMAT, version: PACK_FILE_VERSION, title: "Big", rounds });
  const q = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `Q${i}`, answer: "a" }));

  it("accepts a long real night (8 rounds of 15)", () => {
    const r = packFileSchema.safeParse(file(Array.from({ length: 8 }, (_, i) => ({ title: `R${i}`, category: "C", questions: q(15) }))));
    expect(r.success).toBe(true);
  });

  it("refuses more than 500 questions in total", () => {
    const r = packFileSchema.safeParse(file(Array.from({ length: 11 }, (_, i) => ({ title: `R${i}`, category: "C", questions: q(50) }))));
    expect(r.success).toBe(false);
  });

  it("refuses more than 60 questions in a round and more than 40 rounds", () => {
    expect(packFileSchema.safeParse(file([{ title: "R", category: "C", questions: q(61) }])).success).toBe(false);
    expect(packFileSchema.safeParse(file(Array.from({ length: 41 }, (_, i) => ({ title: `R${i}`, category: "C", questions: q(1) })))).success).toBe(false);
  });

  it("refuses a question longer than 2000 characters", () => {
    const r = packFileSchema.safeParse(file([{ title: "R", category: "C", questions: [{ text: "x".repeat(2001), answer: "a" }] }]));
    expect(r.success).toBe(false);
  });
});
