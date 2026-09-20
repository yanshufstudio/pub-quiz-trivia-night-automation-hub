import { createElement, type ReactElement } from "react";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Document, Image, Page, renderToStream, View, type DocumentProps } from "@react-pdf/renderer";

import { GET as getPdf } from "@/app/api/packs/[id]/pdf/route";
import { createPackFromGenerated } from "@/lib/create-pack";
import { db } from "@/lib/db";
import { toDataUri } from "@/lib/media";
import { REAL_PNG_1X1 } from "@/test/image-fixtures";
import { signInTestHost } from "./auth-fixture";

/**
 * The invariant, pinned: **rendering a PDF must never make a network
 * request.**
 *
 * `@react-pdf/renderer` resolves `<Image src>` server-side, during render,
 * inside the serverless function. `@react-pdf/image`'s `fetchRemoteFile` is
 * a bare `fetch(src.uri, ...)` — no scheme restriction, no host allowlist,
 * no timeout, no size limit, and redirects followed. `GET /api/packs/[id]/pdf`
 * is deliberately unauthenticated (reads by id are open so the demo pack,
 * print and PDF work for a visitor). Put those two facts together and a
 * question image stored as a *URL* would be a server-side request forgery
 * hole with the fetched bytes handed back inside the PDF.
 *
 * The design's answer is that images are stored as bytes and handed to the
 * renderer as `data:` URIs, which `@react-pdf/image` decodes locally. This
 * file is what stops that from quietly regressing the day someone finds it
 * easier to pass a URL: every render here runs with `fetch` replaced by one
 * that serves `data:` URIs and throws on anything else, so a render that
 * reaches for the network fails here rather than in production.
 *
 * Written during phase 1 — before the PDF documents render images at all —
 * on purpose. The two control cases below are what keep it honest in the
 * meantime: they prove the stub really does catch a network fetch, so the
 * route case is a passing test rather than a vacuous one.
 */

const BASE = "http://localhost:3000";

// The PDF and export routes carry the answers, so they need an account now
// (src/lib/auth-guard.ts). Ownership is deliberately not required — an
// ownerless demo pack must still print.
const host = await signInTestHost();


/**
 * Replaces `fetch` for the duration of a render and returns the list of
 * *network* URLs it was asked for — which must always come back empty.
 *
 * `data:` URIs are let through to the real `fetch` rather than counted:
 * they carry their own bytes, reach nothing, and the renderer's own
 * dependencies use them (yoga-layout loads its WASM from one). Letting them
 * through is what makes "nothing else may be fetched" a check the render can
 * actually satisfy — and everything else throws, so a network fetch fails
 * the test twice over: it is recorded, and the render that attempted it
 * breaks.
 */
function stubNetwork() {
  const realFetch = globalThis.fetch;
  const networkCalls: string[] = [];
  vi.stubGlobal("fetch", (input: unknown, init?: unknown) => {
    const uri = typeof input === "string" ? input : String(input);
    if (uri.startsWith("data:")) {
      return (realFetch as (i: unknown, n?: unknown) => Promise<Response>)(input, init);
    }
    networkCalls.push(uri);
    throw new Error(`PDF rendering must not touch the network (tried ${uri})`);
  });
  return networkCalls;
}

async function packWithMedia() {
  const pack = await createPackFromGenerated(
    {
      title: `PDF Media Test ${Math.random().toString(36).slice(2)}`,
      rounds: [
        {
          title: "Picture Round",
          category: "General Knowledge",
          questions: [
            { text: "Which landmark is this?", answer: "The Angel of the North", points: 1, type: "TEXT" as const },
            { text: "And this one?", answer: "Blackpool Tower", points: 1, type: "TEXT" as const },
          ],
        },
      ],
    },
    "pdf media test",
    null
  );

  // Attached the way an upload would leave it: bytes in the row, no URL
  // anywhere in the database.
  for (const question of pack.rounds[0].questions) {
    await db.questionMedia.create({
      data: {
        questionId: question.id,
        mime: "image/png",
        bytes: REAL_PNG_1X1,
        byteSize: REAL_PNG_1X1.length,
        width: 1,
        height: 1,
      },
    });
  }
  return pack;
}

async function renderDocument(element: ReactElement<DocumentProps>) {
  const stream = await renderToStream(element);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe("PDF rendering is offline", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(["questions", "answers", "script"] as const)(
    "renders type=%s for a pack with media without fetching anything",
    async (type) => {
      const pack = await packWithMedia();
      const calls = stubNetwork();

      const res = await getPdf(new NextRequest(`${BASE}/api/packs/${pack.id}/pdf?type=${type}`, { headers: host.cookieHeader }), {
        params: Promise.resolve({ id: pack.id }),
      });

      expect(calls).toEqual([]);
      expect(res.status).toBe(200);
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    }
  );

  // Control 1: the mechanism the invariant rests on. A `data:` URI is
  // decoded in-process, so an image really can reach a PDF with the network
  // unavailable — this is what phase 3 must use.
  it("renders an image passed as a data: URI with no network at all", async () => {
    const calls = stubNetwork();
    const dataUri = toDataUri({ mime: "image/png", bytes: REAL_PNG_1X1 });
    expect(dataUri.startsWith("data:image/png;base64,")).toBe(true);

    const element = createElement(
      Document,
      null,
      createElement(Page, null, createElement(View, null, createElement(Image, { src: dataUri })))
    ) as unknown as ReactElement<DocumentProps>;

    const pdf = await renderDocument(element);
    expect(calls).toEqual([]);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  // Control 2: proof that the check above can fail. If this ever stops
  // recording a call, the stub has stopped seeing @react-pdf's fetch and
  // every other assertion in this file has quietly become worthless.
  it("would catch a remote src — the stub really does see @react-pdf's fetch", async () => {
    const calls = stubNetwork();
    const element = createElement(
      Document,
      null,
      createElement(
        Page,
        null,
        createElement(View, null, createElement(Image, { src: "http://169.254.169.254/latest/meta-data/" }))
      )
    ) as unknown as ReactElement<DocumentProps>;

    // The render fails precisely because the network is gone; what matters
    // is that it was attempted and observed.
    await renderDocument(element).catch(() => null);
    expect(calls).toEqual(["http://169.254.169.254/latest/meta-data/"]);
  });
});
