import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET as getPack } from "@/app/api/packs/[id]/route";
import { GET as getPdf } from "@/app/api/packs/[id]/pdf/route";
import { GET as exportPack } from "@/app/api/packs/[id]/export/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { createPackFromGenerated } from "@/lib/create-pack";
import { db } from "@/lib/db";
import { PACK_NOT_FOUND_MESSAGE } from "@/lib/pack-access";
import { signInTestHost, type TestHost } from "./auth-fixture";

/**
 * Reading somebody else's pack.
 *
 * Every read by id used to be open — the theory was that a cuid is
 * unlisted — so `GET /api/packs/[id]` handed the whole pack to anyone at all,
 * and the editor, the print sheets, the PDFs and the export handed it to any
 * *other* signed-in host who had an id. A quizmaster's unrun pack is the one
 * thing here worth stealing, and "unlisted" stops being private the moment
 * an id is shared, logged, screenshotted or guessed.
 *
 * Every surface below answers a pack it may not read exactly as it answers a
 * pack that is not there. That is the property, not a nicety: an answer that
 * distinguished them would turn each of these into an existence oracle.
 */

const BASE = "http://localhost:3000";
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

function as(host: TestHost | null, url: string, method = "GET", body?: unknown) {
  return new NextRequest(`${BASE}${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(host ? host.cookieHeader : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function packInput(title: string) {
  return {
    title,
    rounds: [
      {
        title: "Round A",
        category: "General",
        questions: [{ text: "Who wrote it?", answer: "the owner", points: 1, type: "TEXT" as const }],
      },
    ],
  };
}

const ownedPack = (creatorId: string | null) =>
  createPackFromGenerated(packInput(`Read Access ${Math.random().toString(36).slice(2)}`), "read access", creatorId);

/**
 * Every read surface that takes a pack id, as one list. A surface added to
 * the app and forgotten here is exactly the failure this guards against.
 */
const READ_SURFACES: { name: string; run: (host: TestHost | null, packId: string) => Promise<Response> }[] = [
  {
    name: "GET /api/packs/[id]",
    run: (host, id) => getPack(as(host, `/api/packs/${id}`), idParams(id)),
  },
  {
    name: "GET /api/packs/[id]/pdf?type=answers",
    run: (host, id) => getPdf(as(host, `/api/packs/${id}/pdf?type=answers`), idParams(id)),
  },
  {
    name: "GET /api/packs/[id]/export",
    run: (host, id) => exportPack(as(host, `/api/packs/${id}/export`), idParams(id)),
  },
  {
    // The least obvious one. Running a session puts every question and every
    // answer on the host desk, so starting one is a read.
    name: "POST /api/sessions",
    run: (host, id) => createSession(as(host, "/api/sessions", "POST", { packId: id })),
  },
];

const owner = await signInTestHost();
const stranger = await signInTestHost();
const ownersPack = await ownedPack(owner.id);
const demoPack = await ownedPack(null);

describe("a pack is readable only by the host who owns it", () => {
  for (const surface of READ_SURFACES) {
    describe(surface.name, () => {
      it("serves the owner", async () => {
        const res = await surface.run(owner, ownersPack.id);
        expect(res.status, await res.text()).toBeLessThan(300);
      });

      it("404s for another signed-in host, exactly as a missing pack does", async () => {
        const [notMine, missing] = await Promise.all([
          surface.run(stranger, ownersPack.id),
          surface.run(stranger, "cmthisidwasnevermintedatall"),
        ]);

        expect(notMine.status).toBe(404);
        expect(missing.status).toBe(404);

        // Same status, same content type, same bytes. Anything that differed
        // would let an id be probed for existence, which is the whole point
        // of answering 404 rather than 403.
        expect(notMine.headers.get("content-type")).toBe(missing.headers.get("content-type"));
        const [notMineBody, missingBody] = await Promise.all([notMine.text(), missing.text()]);
        expect(notMineBody).toBe(missingBody);
        expect(JSON.parse(notMineBody)).toEqual({ error: PACK_NOT_FOUND_MESSAGE });
      });

      it("401s with no session at all", async () => {
        const res = await surface.run(null, ownersPack.id);
        expect(res.status).toBe(401);
      });

      it("serves the ownerless demo pack to any signed-in host", async () => {
        // The demo is the one pack everybody may read — it is how a new host
        // sees what a pack looks like, and Export → Import is how they take
        // an editable copy.
        const res = await surface.run(stranger, demoPack.id);
        expect(res.status, await res.text()).toBeLessThan(300);
      });
    });
  }

  it("starts no session for a stranger, rather than starting one and hiding it", async () => {
    const before = await db.session.count({ where: { packId: ownersPack.id } });
    await createSession(as(stranger, "/api/sessions", "POST", { packId: ownersPack.id }));
    expect(await db.session.count({ where: { packId: ownersPack.id } })).toBe(before);
  });
});

/**
 * The two host *pages* that read a pack. They are server components rather
 * than route handlers, so they are driven directly with `next/headers`
 * stubbed to carry a session — the same check, at the surface a person
 * actually reaches.
 */
describe("the host pages refuse a pack they may not read", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("next/headers");
  });

  async function renderAs(host: TestHost, page: "editor" | "print", packId: string) {
    vi.doMock("next/headers", () => ({
      headers: async () => new Headers(host.cookieHeader),
    }));
    vi.resetModules();
    const mod =
      page === "editor"
        ? await import("@/app/packs/[id]/page")
        : await import("@/app/packs/[id]/print/page");
    return mod.default({ params: Promise.resolve({ id: packId }) });
  }

  for (const page of ["editor", "print"] as const) {
    it(`${page}: renders for the owner`, async () => {
      await expect(renderAs(owner, page, ownersPack.id)).resolves.toBeTruthy();
    });

    it(`${page}: is not found for another host, exactly as a missing pack is`, async () => {
      // notFound() throws; both cases have to throw the same way, or the
      // page is an existence oracle too.
      const mine = await renderAs(stranger, page, ownersPack.id).catch((err: Error) => err);
      const missing = await renderAs(stranger, page, "cmthisidwasnevermintedatall").catch((err: Error) => err);

      expect(mine).toBeInstanceOf(Error);
      expect(missing).toBeInstanceOf(Error);
      expect((mine as Error).message).toBe((missing as Error).message);
      expect((mine as Error).message).toContain("404");
    });

    it(`${page}: renders the ownerless demo pack for any signed-in host`, async () => {
      await expect(renderAs(stranger, page, demoPack.id)).resolves.toBeTruthy();
    });
  }
});
