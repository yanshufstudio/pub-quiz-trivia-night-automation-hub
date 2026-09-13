import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { DELETE as deleteMedia, GET as getMedia, POST as uploadMedia } from "@/app/api/questions/[id]/media/route";
import { GET as getPack } from "@/app/api/packs/[id]/route";
import { DELETE as deleteQuestion } from "@/app/api/questions/[id]/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { GET as getSession } from "@/app/api/sessions/[code]/route";
import { POST as advanceSession } from "@/app/api/sessions/[code]/advance/route";
import { createPackFromGenerated } from "@/lib/create-pack";
import { COOKIE_NAME } from "@/lib/creator";
import { db } from "@/lib/db";
import { MAX_MEDIA_BYTES, MAX_MEDIA_PER_PACK, MEDIA_MIME } from "@/lib/media";
import {
  GIF_BYTES,
  pngBytes,
  realJpegBytes,
  realJpegWithExif,
  realPngBytes,
  SVG_SOURCE,
} from "@/test/image-fixtures";

const BASE = "http://localhost:3000";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function newCreator() {
  const deviceKey = `question-media-${Math.random().toString(36).slice(2)}`;
  const creator = await db.creator.create({ data: { deviceKey } });
  return { id: creator.id, cookie: deviceKey };
}

async function packWithQuestions(creatorId: string | null, questionCount = 2) {
  return createPackFromGenerated(
    {
      title: `Question Media Test ${Math.random().toString(36).slice(2)}`,
      rounds: [
        {
          title: "Round A",
          category: "General",
          questions: Array.from({ length: questionCount }, (_, i) => ({
            text: `A${i + 1}?`,
            answer: `a${i + 1}`,
            points: 1,
            type: "TEXT" as const,
          })),
        },
      ],
    },
    "question media test",
    creatorId
  );
}

/** Uploads are rate-limited per client IP. Every request here gets its own
 * unique `x-forwarded-for` unless one is passed in, so that no test can fail
 * because an earlier test in the file spent the budget — the limiter itself
 * is pinned by its own test below, on a fixed IP. */
let nextClientIp = 0;

function uploadRequest(
  questionId: string,
  body: Uint8Array | string,
  opts: { cookie?: string; contentType?: string; headers?: Record<string, string> } = {}
) {
  nextClientIp += 1;
  return new NextRequest(`${BASE}/api/questions/${questionId}/media`, {
    method: "POST",
    headers: {
      "Content-Type": opts.contentType ?? "application/octet-stream",
      "x-forwarded-for": `10.0.0.${nextClientIp % 254}:${nextClientIp}`,
      ...(opts.cookie ? { cookie: `${COOKIE_NAME}=${opts.cookie}` } : {}),
      ...(opts.headers ?? {}),
    },
    body: typeof body === "string" ? body : (new Uint8Array(body) as unknown as BodyInit),
  });
}

function readRequest(questionId: string, headers: Record<string, string> = {}) {
  return new NextRequest(`${BASE}/api/questions/${questionId}/media`, { headers });
}

/** The owner's pack, one uploaded PNG, ready to read back. A real, decodable
 * image: the route now re-encodes with sharp, which the header-only
 * `pngBytes()` fixture can't survive (see the `prepareImageForStorage` unit
 * tests in src/lib/media.test.ts for why that matters). */
async function packWithMedia() {
  const owner = await newCreator();
  const pack = await packWithQuestions(owner.id);
  const questionId = pack.rounds[0].questions[0].id;
  const res = await uploadMedia(
    uploadRequest(questionId, await realPngBytes(640, 480), { cookie: owner.cookie }),
    params(questionId)
  );
  expect(res.status).toBe(201);
  return { owner, pack, questionId };
}

describe("question media", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  describe("POST — the owner's upload", () => {
    it("stores a PNG and reports what it stored", async () => {
      const owner = await newCreator();
      const pack = await packWithQuestions(owner.id);
      const questionId = pack.rounds[0].questions[0].id;

      const res = await uploadMedia(
        uploadRequest(questionId, await realPngBytes(1024, 768), { cookie: owner.cookie }),
        params(questionId)
      );
      expect(res.status).toBe(201);
      expect((await res.json()).media).toMatchObject({
        mime: MEDIA_MIME.PNG,
        width: 1024,
        height: 768,
      });

      const row = await db.questionMedia.findUniqueOrThrow({ where: { questionId } });
      expect(row.byteSize).toBe(row.bytes.length);
    });

    it("stores a JPEG", async () => {
      const owner = await newCreator();
      const pack = await packWithQuestions(owner.id);
      const questionId = pack.rounds[0].questions[0].id;

      const res = await uploadMedia(
        uploadRequest(questionId, await realJpegBytes(300, 200), { cookie: owner.cookie }),
        params(questionId)
      );
      expect(res.status).toBe(201);
      expect((await res.json()).media).toMatchObject({ mime: MEDIA_MIME.JPEG, width: 300, height: 200 });
    });

    // The Content-Type on the request is a claim by whoever is uploading.
    // Nothing downstream may depend on it, so the stored (and later served)
    // type is the one sniffed from the bytes.
    it("ignores the request's Content-Type and trusts the bytes", async () => {
      const owner = await newCreator();
      const pack = await packWithQuestions(owner.id);
      const questionId = pack.rounds[0].questions[0].id;

      const res = await uploadMedia(
        uploadRequest(questionId, await realPngBytes(), { cookie: owner.cookie, contentType: "image/gif" }),
        params(questionId)
      );
      expect(res.status).toBe(201);
      expect((await res.json()).media.mime).toBe(MEDIA_MIME.PNG);
    });

    it("replaces the existing image rather than accumulating rows", async () => {
      const { questionId, owner } = await packWithMedia();
      const res = await uploadMedia(
        uploadRequest(questionId, await realJpegBytes(120, 90), { cookie: owner.cookie }),
        params(questionId)
      );
      expect(res.status).toBe(201);

      expect(await db.questionMedia.count({ where: { questionId } })).toBe(1);
      const row = await db.questionMedia.findUniqueOrThrow({ where: { questionId } });
      expect(row.mime).toBe(MEDIA_MIME.JPEG);
      expect(row.width).toBe(120);
    });

    // The route re-encodes through src/lib/media.ts's prepareImageForStorage
    // (sharp) rather than storing what was sent — proven here at the route
    // level, not just in the function's own unit tests, so the wiring itself
    // is what's under test.
    it("re-encodes the upload rather than storing the request bytes verbatim", async () => {
      const owner = await newCreator();
      const pack = await packWithQuestions(owner.id);
      const questionId = pack.rounds[0].questions[0].id;
      const withExif = await realJpegWithExif(8, 8);

      const res = await uploadMedia(uploadRequest(questionId, withExif, { cookie: owner.cookie }), params(questionId));
      expect(res.status).toBe(201);

      const row = await db.questionMedia.findUniqueOrThrow({ where: { questionId } });
      expect(Buffer.from(row.bytes)).not.toEqual(Buffer.from(withExif));
      const decoded = await sharp(row.bytes).metadata();
      expect(decoded.exif).toBeUndefined();
      expect(decoded.width).toBe(8);
      expect(decoded.height).toBe(8);
    });

    it("rejects SVG", async () => {
      const owner = await newCreator();
      const pack = await packWithQuestions(owner.id);
      const questionId = pack.rounds[0].questions[0].id;

      const res = await uploadMedia(uploadRequest(questionId, SVG_SOURCE, { cookie: owner.cookie }), params(questionId));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/SVG/);
      expect(await db.questionMedia.count({ where: { questionId } })).toBe(0);
    });

    it("rejects a format it does not support", async () => {
      const owner = await newCreator();
      const pack = await packWithQuestions(owner.id);
      const questionId = pack.rounds[0].questions[0].id;

      const res = await uploadMedia(uploadRequest(questionId, GIF_BYTES, { cookie: owner.cookie }), params(questionId));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/GIF/);
    });

    it("rejects an empty body", async () => {
      const owner = await newCreator();
      const pack = await packWithQuestions(owner.id);
      const questionId = pack.rounds[0].questions[0].id;

      const res = await uploadMedia(uploadRequest(questionId, new Uint8Array(), { cookie: owner.cookie }), params(questionId));
      expect(res.status).toBe(400);
    });

    it("rejects an oversized upload with 413", async () => {
      const owner = await newCreator();
      const pack = await packWithQuestions(owner.id);
      const questionId = pack.rounds[0].questions[0].id;

      const oversized = pngBytes(100, 100, MAX_MEDIA_BYTES);
      expect(oversized.length).toBeGreaterThan(MAX_MEDIA_BYTES);
      const res = await uploadMedia(uploadRequest(questionId, oversized, { cookie: owner.cookie }), params(questionId));
      expect(res.status).toBe(413);
      expect(await db.questionMedia.count({ where: { questionId } })).toBe(0);
    });

    it("rejects a decompression bomb on its declared dimensions", async () => {
      const owner = await newCreator();
      const pack = await packWithQuestions(owner.id);
      const questionId = pack.rounds[0].questions[0].id;

      const res = await uploadMedia(uploadRequest(questionId, pngBytes(40000, 40000), { cookie: owner.cookie }), params(questionId));
      expect(res.status).toBe(400);
    });

    // These two writes are the only ones in the app that accept a body this
    // size, and the pack owner is the only caller — but a cookie is not a
    // budget, so there is still a ceiling.
    it("rate-limits a flood from one client", async () => {
      const owner = await newCreator();
      const pack = await packWithQuestions(owner.id);
      const questionId = pack.rounds[0].questions[0].id;
      const flood = { cookie: owner.cookie, headers: { "x-forwarded-for": "203.0.113.7" } };

      const image = await realPngBytes(10, 10);
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 45; attempt++) {
        const res = await uploadMedia(uploadRequest(questionId, image, flood), params(questionId));
        statuses.push(res.status);
      }

      expect(statuses).toContain(429);
      expect(statuses.filter((status) => status === 201).length).toBeLessThanOrEqual(40);
    });

    it("404s on a question that does not exist", async () => {
      const owner = await newCreator();
      const res = await uploadMedia(uploadRequest("does-not-exist", pngBytes(), { cookie: owner.cookie }), params("does-not-exist"));
      expect(res.status).toBe(404);
    });
  });

  describe("POST — the per-pack cap", () => {
    it("blocks a new image once the pack holds the max, but still allows replacing one already there", async () => {
      const owner = await newCreator();
      const pack = await packWithQuestions(owner.id, MAX_MEDIA_PER_PACK + 1);
      const questions = pack.rounds[0].questions;
      const image = await realPngBytes(10, 10);

      for (let i = 0; i < MAX_MEDIA_PER_PACK; i++) {
        const res = await uploadMedia(uploadRequest(questions[i].id, image, { cookie: owner.cookie }), params(questions[i].id));
        expect(res.status).toBe(201);
      }
      expect(await db.questionMedia.count({ where: { question: { round: { packId: pack.id } } } })).toBe(
        MAX_MEDIA_PER_PACK
      );

      // The pack is now at the cap — a NEW image (a question that doesn't
      // already have one) is refused with 409.
      const overCap = questions[MAX_MEDIA_PER_PACK];
      const blocked = await uploadMedia(uploadRequest(overCap.id, image, { cookie: owner.cookie }), params(overCap.id));
      expect(blocked.status).toBe(409);
      expect(await db.questionMedia.count({ where: { questionId: overCap.id } })).toBe(0);

      // Replacing an image on a question that already has one is exempt —
      // it doesn't grow the pack's count, so it must still succeed at the cap.
      const replace = await uploadMedia(
        uploadRequest(questions[0].id, await realJpegBytes(20, 20), { cookie: owner.cookie }),
        params(questions[0].id)
      );
      expect(replace.status).toBe(201);
      expect(await db.questionMedia.count({ where: { question: { round: { packId: pack.id } } } })).toBe(
        MAX_MEDIA_PER_PACK
      );
    });
  });

  describe("POST — the ownership gate", () => {
    it("refuses an anonymous upload", async () => {
      const owner = await newCreator();
      const pack = await packWithQuestions(owner.id);
      const questionId = pack.rounds[0].questions[0].id;

      const res = await uploadMedia(uploadRequest(questionId, pngBytes()), params(questionId));
      expect(res.status).toBe(403);
      expect(await db.questionMedia.count({ where: { questionId } })).toBe(0);
    });

    it("refuses a different creator holding a valid cookie of their own", async () => {
      const owner = await newCreator();
      const stranger = await newCreator();
      const pack = await packWithQuestions(owner.id);
      const questionId = pack.rounds[0].questions[0].id;

      const res = await uploadMedia(uploadRequest(questionId, pngBytes(), { cookie: stranger.cookie }), params(questionId));
      expect(res.status).toBe(403);
      expect(await db.questionMedia.count({ where: { questionId } })).toBe(0);
    });

    // An ownerless pack (the seeded demo one) is editable by nobody, so
    // there is no cookie that unlocks an upload to it.
    it("refuses an upload to an ownerless pack", async () => {
      const anyone = await newCreator();
      const pack = await packWithQuestions(null);
      const questionId = pack.rounds[0].questions[0].id;

      const res = await uploadMedia(uploadRequest(questionId, pngBytes(), { cookie: anyone.cookie }), params(questionId));
      expect(res.status).toBe(403);
    });
  });

  describe("GET — serving the bytes", () => {
    it("serves the stored bytes with the sniffed type", async () => {
      const { questionId } = await packWithMedia();
      const res = await getMedia(readRequest(questionId), params(questionId));

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe(MEDIA_MIME.PNG);
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'none'");

      // The served bytes are a re-encode, not the upload verbatim (see
      // "re-encodes the upload..." above) — so this asserts what a real
      // decode of the served bytes reports, not byte-for-byte equality.
      const bytes = new Uint8Array(await res.arrayBuffer());
      const decoded = await sharp(Buffer.from(bytes)).metadata();
      expect(decoded.format).toBe("png");
      expect(decoded.width).toBe(640);
      expect(decoded.height).toBe(480);
    });

    // Reads by id are open across this app (see src/lib/pack-access.ts) —
    // a team's phone and the print sheet have no owner cookie and still
    // have to render the image.
    it("serves a visitor with no cookie at all", async () => {
      const { questionId } = await packWithMedia();
      const res = await getMedia(readRequest(questionId), params(questionId));
      expect(res.status).toBe(200);
    });

    it("revalidates with an ETag instead of going stale", async () => {
      const { questionId, owner } = await packWithMedia();
      const first = await getMedia(readRequest(questionId), params(questionId));
      const etag = first.headers.get("ETag");
      expect(etag).toBeTruthy();

      const cached = await getMedia(readRequest(questionId, { "if-none-match": etag! }), params(questionId));
      expect(cached.status).toBe(304);

      // Replacing the image must not keep serving the old one from a cache.
      await new Promise((resolve) => setTimeout(resolve, 5));
      await uploadMedia(uploadRequest(questionId, await realJpegBytes(50, 50), { cookie: owner.cookie }), params(questionId));
      const afterReplace = await getMedia(readRequest(questionId, { "if-none-match": etag! }), params(questionId));
      expect(afterReplace.status).toBe(200);
      expect(afterReplace.headers.get("ETag")).not.toBe(etag);
    });

    it("404s for a question with no image", async () => {
      const owner = await newCreator();
      const pack = await packWithQuestions(owner.id);
      const questionId = pack.rounds[0].questions[1].id;

      const res = await getMedia(readRequest(questionId), params(questionId));
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE", () => {
    it("lets the owner remove the image", async () => {
      const { questionId, owner } = await packWithMedia();
      const res = await deleteMedia(
        new NextRequest(`${BASE}/api/questions/${questionId}/media`, {
          method: "DELETE",
          headers: { cookie: `${COOKIE_NAME}=${owner.cookie}` },
        }),
        params(questionId)
      );
      expect(res.status).toBe(200);
      expect(await db.questionMedia.count({ where: { questionId } })).toBe(0);
    });

    it("refuses a stranger", async () => {
      const { questionId } = await packWithMedia();
      const stranger = await newCreator();
      const res = await deleteMedia(
        new NextRequest(`${BASE}/api/questions/${questionId}/media`, {
          method: "DELETE",
          headers: { cookie: `${COOKIE_NAME}=${stranger.cookie}` },
        }),
        params(questionId)
      );
      expect(res.status).toBe(403);
      expect(await db.questionMedia.count({ where: { questionId } })).toBe(1);
    });
  });

  describe("the pack payload", () => {
    it("reports hasMedia without carrying any bytes", async () => {
      const { pack, questionId } = await packWithMedia();
      const res = await getPack(new NextRequest(`${BASE}/api/packs/${pack.id}`), params(pack.id));
      expect(res.status).toBe(200);

      const body = await res.text();
      const questions = JSON.parse(body).pack.rounds[0].questions;
      expect(questions.find((q: { id: string }) => q.id === questionId).hasMedia).toBe(true);
      expect(questions.find((q: { id: string }) => q.id !== questionId).hasMedia).toBe(false);
      expect(body).not.toContain("bytes");
    });
  });

  describe("the session payload", () => {
    it("reports hasMedia on the current question, for host and team alike", async () => {
      const { pack, questionId } = await packWithMedia();

      const sessionRes = await createSession(
        new NextRequest(`${BASE}/api/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ packId: pack.id }),
        })
      );
      expect(sessionRes.status).toBe(201);
      const { session, hostToken } = await sessionRes.json();

      const started = await advanceSession(
        new NextRequest(`${BASE}/api/sessions/${session.code}/advance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start", hostToken }),
        }),
        { params: Promise.resolve({ code: session.code }) }
      );
      expect(started.status).toBe(200);

      const hostView = await getSession(
        new NextRequest(`${BASE}/api/sessions/${session.code}?as=host&hostToken=${hostToken}`),
        { params: Promise.resolve({ code: session.code }) }
      );
      const hostData = await hostView.json();
      expect(hostData.question.id).toBe(questionId);
      expect(hostData.question.hasMedia).toBe(true);
      // Never the bytes, never a URL — only the flag, same contract as the
      // pack payload above.
      expect(JSON.stringify(hostData)).not.toContain("bytes");
    });
  });

  it("drops the image when its question is deleted", async () => {
    const { questionId, owner } = await packWithMedia();
    const res = await deleteQuestion(
      new NextRequest(`${BASE}/api/questions/${questionId}`, {
        method: "DELETE",
        headers: { cookie: `${COOKIE_NAME}=${owner.cookie}` },
      }),
      params(questionId)
    );
    expect(res.status).toBe(200);
    expect(await db.questionMedia.count({ where: { questionId } })).toBe(0);
  });
});
