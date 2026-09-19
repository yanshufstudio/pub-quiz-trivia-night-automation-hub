import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET as getPdf } from "@/app/api/packs/[id]/pdf/route";
import { PATCH as updateQuestion } from "@/app/api/questions/[id]/route";
import { createPackFromGenerated } from "@/lib/create-pack";
import { DEMO_PACK, DEMO_PACK_PROMPT } from "@/lib/demo-pack";
import { db } from "@/lib/db";
import { testOwner } from "./owner-fixture";

const BASE = "http://localhost:3000";
const owner = await testOwner();

function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json", ...owner.cookieHeader },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json(res: Response) {
  return res.json();
}

describe("GET /api/packs/[id]/pdf", () => {
  let packId: string;
  let questionId: string;

  beforeAll(async () => {
    // A dedicated pack, not the shared idempotent /api/packs/seed one —
    // this suite mutates a question below, and that must not leak into
    // whatever other test files see when they seed the demo pack. The title
    // must differ too: /api/packs/seed reuses *any* pack matching
    // DEMO_PACK.title (see its findFirst), so reusing that title here let
    // this suite's mutated pack get silently picked up by other test files'
    // seed calls whenever this file happened to run first — a real,
    // intermittent cross-file test-order bug, not a one-off flake.
    const pack = await createPackFromGenerated(
      { ...DEMO_PACK, title: "PDF Route Test Pack (dedicated — not the shared seed pack)" },
      DEMO_PACK_PROMPT,
      owner.id
    );
    packId = pack.id;
    questionId = pack.rounds[0].questions[0].id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("rejects an unknown type", async () => {
    const res = await getPdf(new NextRequest(`${BASE}/api/packs/${packId}/pdf?type=nonsense`, { headers: owner.cookieHeader }), {
      params: Promise.resolve({ id: packId }),
    });
    expect(res.status).toBe(400);
  });

  it("404s for a pack that doesn't exist", async () => {
    const res = await getPdf(new NextRequest(`${BASE}/api/packs/does-not-exist/pdf?type=questions`, { headers: owner.cookieHeader }), {
      params: Promise.resolve({ id: "does-not-exist" }),
    });
    expect(res.status).toBe(404);
  });

  it.each(["questions", "answers", "script"] as const)(
    "renders a real, non-trivial PDF for type=%s",
    async (type) => {
      const res = await getPdf(new NextRequest(`${BASE}/api/packs/${packId}/pdf?type=${type}`, { headers: owner.cookieHeader }), {
        params: Promise.resolve({ id: packId }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(res.headers.get("content-disposition")).toMatch(/attachment; filename=".*\.pdf"/);

      const bytes = new Uint8Array(await res.arrayBuffer());
      // A real assertion, not just trusting the content-type header: PDFs
      // start with the %PDF- magic number, and a real rendered document
      // (not an empty stream) is comfortably more than a few hundred bytes.
      const header = new TextDecoder().decode(bytes.slice(0, 5));
      expect(header).toBe("%PDF-");
      expect(bytes.length).toBeGreaterThan(500);
    }
  );

  it("re-renders from live data instead of a stale/cached copy", async () => {
    // @react-pdf/renderer compresses its content streams, so the question
    // text isn't a plain substring of the output — asserting the bytes
    // actually change after an edit is a better regression guard anyway:
    // it catches a caching bug, which is the more realistic failure mode
    // for a "generate a file from the DB on every request" route.
    const before = await getPdf(new NextRequest(`${BASE}/api/packs/${packId}/pdf?type=questions`, { headers: owner.cookieHeader }), {
      params: Promise.resolve({ id: packId }),
    });
    const beforeBytes = new Uint8Array(await before.arrayBuffer());

    await updateQuestion(
      jsonRequest(`${BASE}/api/questions/${questionId}`, "PATCH", {
        text: "A brand new, much longer question that changes the rendered byte length?",
      }),
      { params: Promise.resolve({ id: questionId }) }
    );

    const after = await getPdf(new NextRequest(`${BASE}/api/packs/${packId}/pdf?type=questions`, { headers: owner.cookieHeader }), {
      params: Promise.resolve({ id: packId }),
    });
    const afterBytes = new Uint8Array(await after.arrayBuffer());

    expect(afterBytes.length).not.toBe(beforeBytes.length);
  });
});

describe("PATCH /api/questions/[id]", () => {
  let questionId: string;

  beforeAll(async () => {
    // Same reasoning as the pdf describe block above: a distinct title keeps
    // this suite's mutated pack (points changed to 5 below) from being
    // picked up by /api/packs/seed's findFirst-by-title in other test files.
    const pack = await createPackFromGenerated(
      { ...DEMO_PACK, title: "PATCH Question Test Pack (dedicated — not the shared seed pack)" },
      DEMO_PACK_PROMPT,
      owner.id
    );
    questionId = pack.rounds[0].questions[1].id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("404s for a question that doesn't exist", async () => {
    const res = await updateQuestion(
      jsonRequest(`${BASE}/api/questions/does-not-exist`, "PATCH", { text: "New text" }),
      { params: Promise.resolve({ id: "does-not-exist" }) }
    );
    expect(res.status).toBe(404);
  });

  it("rejects an empty text or answer", async () => {
    const res = await updateQuestion(jsonRequest(`${BASE}/api/questions/${questionId}`, "PATCH", { text: "" }), {
      params: Promise.resolve({ id: questionId }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects points outside 1-10", async () => {
    const tooLow = await updateQuestion(
      jsonRequest(`${BASE}/api/questions/${questionId}`, "PATCH", { points: 0 }),
      { params: Promise.resolve({ id: questionId }) }
    );
    expect(tooLow.status).toBe(400);

    const tooHigh = await updateQuestion(
      jsonRequest(`${BASE}/api/questions/${questionId}`, "PATCH", { points: 11 }),
      { params: Promise.resolve({ id: questionId }) }
    );
    expect(tooHigh.status).toBe(400);
  });

  it("updates only the fields provided, leaving the rest untouched", async () => {
    const before = await db.question.findUniqueOrThrow({ where: { id: questionId } });

    const res = await updateQuestion(
      jsonRequest(`${BASE}/api/questions/${questionId}`, "PATCH", { points: 5 }),
      { params: Promise.resolve({ id: questionId }) }
    );
    expect(res.status).toBe(200);
    const { question } = await json(res);
    expect(question.points).toBe(5);
    expect(question.text).toBe(before.text);
    expect(question.answer).toBe(before.answer);
  });
});
