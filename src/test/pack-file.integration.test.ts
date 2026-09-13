import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET as exportPack } from "@/app/api/packs/[id]/export/route";
import { POST as importPack } from "@/app/api/packs/import/route";
import { createPackFromGenerated } from "@/lib/create-pack";
import { DEMO_PACK, DEMO_PACK_PROMPT } from "@/lib/demo-pack";
import { db } from "@/lib/db";
import { MAX_MEDIA_PER_PACK } from "@/lib/media";
import { PACK_FILE_FORMAT, PACK_FILE_VERSION } from "@/lib/pack-file";
import { parseOptions } from "@/lib/question-types";
import { REAL_PNG_1X1, realPngBytes } from "@/test/image-fixtures";

function packWithMediaInput(questionCount: number) {
  return {
    ...DEMO_PACK,
    title: `Export Media Pack ${Math.random().toString(36).slice(2)}`,
    rounds: [
      {
        title: "Picture Round",
        category: "General",
        questions: Array.from({ length: questionCount }, (_, i) => ({
          text: `Which landmark ${i + 1}?`,
          answer: `Landmark ${i + 1}`,
          points: 1,
          type: "TEXT" as const,
        })),
      },
    ],
  };
}

async function packWithQuestionMedia(pack: Awaited<ReturnType<typeof createPackFromGenerated>>) {
  await db.questionMedia.create({
    data: {
      questionId: pack.rounds[0].questions[0].id,
      mime: "image/png",
      bytes: REAL_PNG_1X1,
      byteSize: REAL_PNG_1X1.length,
      width: 1,
      height: 1,
    },
  });
}

const BASE = "http://localhost:3000";

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("pack export / import", () => {
  let packId: string;

  beforeAll(async () => {
    // Dedicated pack (see routes.integration.test.ts for why the title must
    // not be DEMO_PACK.title): this one gets an acceptableAnswers entry so the
    // round trip proves the host-approved alternates survive the file.
    const pack = await createPackFromGenerated(
      { ...DEMO_PACK, title: "Export Round-Trip Pack (dedicated)" },
      DEMO_PACK_PROMPT
    );
    packId = pack.id;
    await db.question.update({
      where: { id: pack.rounds[0].questions[1].id },
      data: { acceptableAnswers: JSON.stringify(["7", "VII"]) },
    });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("404s when exporting a pack that doesn't exist", async () => {
    const res = await exportPack(new NextRequest(`${BASE}/api/packs/nope/export`), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(res.status).toBe(404);
  });

  it("exports a downloadable file and imports it back as an identical new pack", async () => {
    const res = await exportPack(new NextRequest(`${BASE}/api/packs/${packId}/export`), {
      params: Promise.resolve({ id: packId }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="export-round-trip-pack.*\.json"$/);
    const file = await res.json();
    expect(file.format).toBe(PACK_FILE_FORMAT);
    expect(file.version).toBe(PACK_FILE_VERSION);
    expect(JSON.stringify(file)).not.toContain('"id"');

    const imported = await importPack(jsonRequest(`${BASE}/api/packs/import`, file));
    expect(imported.status).toBe(201);
    const { pack } = await imported.json();
    expect(pack.id).not.toBe(packId);

    const original = await db.quizPack.findUniqueOrThrow({
      where: { id: packId },
      include: { rounds: { orderBy: { index: "asc" }, include: { questions: { orderBy: { index: "asc" } } } } },
    });
    const copy = await db.quizPack.findUniqueOrThrow({
      where: { id: pack.id },
      include: { rounds: { orderBy: { index: "asc" }, include: { questions: { orderBy: { index: "asc" } } } } },
    });
    expect(copy.title).toBe(original.title);
    expect(copy.prompt).toBe(original.prompt);
    expect(copy.rounds.length).toBe(original.rounds.length);
    original.rounds.forEach((round, r) => {
      expect(copy.rounds[r].title).toBe(round.title);
      expect(copy.rounds[r].category).toBe(round.category);
      expect(copy.rounds[r].questions.length).toBe(round.questions.length);
      round.questions.forEach((q, i) => {
        const c = copy.rounds[r].questions[i];
        expect([c.text, c.answer, c.points, c.type]).toEqual([q.text, q.answer, q.points, q.type]);
        expect(parseOptions(c.options)).toEqual(parseOptions(q.options));
        expect(parseOptions(c.acceptableAnswers)).toEqual(parseOptions(q.acceptableAnswers));
      });
    });
    expect(parseOptions(copy.rounds[0].questions[1].acceptableAnswers)).toEqual(["7", "VII"]);
  });

  it("rejects a file that isn't a pack file with a readable 400", async () => {
    const res = await importPack(jsonRequest(`${BASE}/api/packs/import`, { title: "Not a pack" }));
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toMatch(/pack file/i);
  });

  it("rejects a file from a newer format version", async () => {
    const res = await importPack(
      jsonRequest(`${BASE}/api/packs/import`, {
        format: PACK_FILE_FORMAT,
        version: PACK_FILE_VERSION + 1,
        title: "Future",
        rounds: [{ title: "R", category: "C", questions: [{ text: "Q?", answer: "A" }] }],
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a body that isn't JSON", async () => {
    const res = await importPack(
      new NextRequest(`${BASE}/api/packs/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not json",
      })
    );
    expect(res.status).toBe(400);
  });

  describe("version 2: embedded images", () => {
    it("exports a question's image as base64 and re-imports it as stored media", async () => {
      const pack = await createPackFromGenerated(packWithMediaInput(2), "media export test");
      await packWithQuestionMedia(pack);

      const res = await exportPack(new NextRequest(`${BASE}/api/packs/${pack.id}/export`), {
        params: Promise.resolve({ id: pack.id }),
      });
      expect(res.status).toBe(200);
      const file = await res.json();
      expect(file.version).toBe(2);
      const [withImage, withoutImage] = file.rounds[0].questions;
      expect(withImage.image).toMatchObject({ mime: "image/png" });
      expect(Buffer.from(withImage.image.data, "base64").length).toBeGreaterThan(0);
      // A question with no attached image has no `image` key at all — not
      // `null`, not an empty object — matching every other optional file field.
      expect(withoutImage.image).toBeUndefined();

      const imported = await importPack(jsonRequest(`${BASE}/api/packs/import`, file));
      expect(imported.status).toBe(201);
      const { pack: copyRef } = await imported.json();

      const copy = await db.quizPack.findUniqueOrThrow({
        where: { id: copyRef.id },
        include: {
          rounds: {
            orderBy: { index: "asc" },
            include: { questions: { orderBy: { index: "asc" }, include: { media: true } } },
          },
        },
      });
      expect(copy.rounds[0].questions[0].media).not.toBeNull();
      expect(copy.rounds[0].questions[0].media!.mime).toBe("image/png");
      // Re-encoded, not the byte-for-byte fixture — same guarantee as a
      // direct upload (src/lib/media.ts's prepareImageForStorage).
      expect(Buffer.from(copy.rounds[0].questions[0].media!.bytes)).not.toEqual(Buffer.from(REAL_PNG_1X1));
      expect(copy.rounds[0].questions[1].media).toBeNull();
    });

    it("drops an image that fails validation rather than failing the whole import", async () => {
      const file = {
        format: PACK_FILE_FORMAT,
        version: 2,
        title: "Hostile image import",
        rounds: [
          {
            title: "R",
            category: "C",
            questions: [
              { text: "Fine on its own", answer: "A", image: { mime: "image/png", data: "not-a-real-png-at-all" } },
              { text: "No image", answer: "B" },
            ],
          },
        ],
      };

      const res = await importPack(jsonRequest(`${BASE}/api/packs/import`, file));
      expect(res.status).toBe(201);
      const { pack: copyRef } = await res.json();

      const copy = await db.quizPack.findUniqueOrThrow({
        where: { id: copyRef.id },
        include: {
          rounds: { include: { questions: { orderBy: { index: "asc" }, include: { media: true } } } },
        },
      });
      expect(copy.rounds[0].questions).toHaveLength(2);
      expect(copy.rounds[0].questions[0].media).toBeNull();
      expect(copy.rounds[0].questions[1].media).toBeNull();
    });

    it("enforces the per-pack image cap on import, same as a direct upload", async () => {
      const questionCount = MAX_MEDIA_PER_PACK + 2;
      const imageBytes = await realPngBytes(10, 10);
      const file = {
        format: PACK_FILE_FORMAT,
        version: 2,
        title: "Cap test import",
        rounds: [
          {
            title: "R",
            category: "C",
            questions: Array.from({ length: questionCount }, (_, i) => ({
              text: `Q${i}`,
              answer: `A${i}`,
              image: { mime: "image/png", data: imageBytes.toString("base64") },
            })),
          },
        ],
      };

      const res = await importPack(jsonRequest(`${BASE}/api/packs/import`, file));
      expect(res.status).toBe(201);
      const { pack: copyRef } = await res.json();

      const mediaCount = await db.questionMedia.count({
        where: { question: { round: { packId: copyRef.id } } },
      });
      expect(mediaCount).toBe(MAX_MEDIA_PER_PACK);
    });
  });
});
