import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET as listPacks } from "@/app/api/packs/route";
import { DELETE as deletePack } from "@/app/api/packs/[id]/route";
import { POST as importPack } from "@/app/api/packs/import/route";
import { POST as createQuestion } from "@/app/api/questions/route";
import { DELETE as deleteQuestion, PATCH as patchQuestion } from "@/app/api/questions/[id]/route";
import { DELETE as deleteRound } from "@/app/api/rounds/[id]/route";
import { POST as moveRound } from "@/app/api/rounds/[id]/move/route";
import { createPackFromGenerated } from "@/lib/create-pack";
import { db } from "@/lib/db";
import { PACK_FILE_FORMAT, PACK_FILE_VERSION } from "@/lib/pack-file";
import { signInTestHost } from "./auth-fixture";

const BASE = "http://localhost:3000";

/** `cookie` is a whole Cookie header value — a session cookie from
 * signInTestHost, or a bare string when the test is about a bad one. */
function request(url: string, method: string, opts: { body?: unknown; cookie?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

/**
 * A creator with an account behind it. Ownership is still `QuizPack.creatorId`
 * against `Creator.id` — what changed is that reaching the check at all needs
 * a session, so an unowned request is a 401 where it used to be a 403.
 */
const newCreator = () => signInTestHost();

function packInput(title: string) {
  return {
    title,
    rounds: [
      {
        title: "Round A",
        category: "General",
        questions: [
          { text: "A1?", answer: "a1", points: 1, type: "TEXT" as const },
          { text: "A2?", answer: "a2", points: 1, type: "TEXT" as const },
        ],
      },
      {
        title: "Round B",
        category: "General",
        questions: [{ text: "B1?", answer: "b1", points: 1, type: "TEXT" as const }],
      },
    ],
  };
}

async function ownedPack(creatorId: string | null) {
  const title = `Pack Access Test ${Math.random().toString(36).slice(2)}`;
  return createPackFromGenerated(packInput(title), "pack access test", creatorId);
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("pack ownership gate", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("createPackFromGenerated stamps the creatorId it is given", async () => {
    const owner = await newCreator();
    const pack = await ownedPack(owner.id);
    const row = await db.quizPack.findUniqueOrThrow({ where: { id: pack.id } });
    expect(row.creatorId).toBe(owner.id);
  });

  describe("POST /api/questions", () => {
    it("lets the owner add a question", async () => {
      const owner = await newCreator();
      const pack = await ownedPack(owner.id);
      const res = await createQuestion(
        request(`${BASE}/api/questions`, "POST", { body: { roundId: pack.rounds[0].id }, cookie: owner.cookie })
      );
      expect(res.status).toBe(201);
    });

    it("403s for a different creator", async () => {
      const owner = await newCreator();
      const other = await newCreator();
      const pack = await ownedPack(owner.id);
      const res = await createQuestion(
        request(`${BASE}/api/questions`, "POST", { body: { roundId: pack.rounds[0].id }, cookie: other.cookie })
      );
      expect(res.status).toBe(403);
      const reloaded = await db.question.count({ where: { roundId: pack.rounds[0].id } });
      expect(reloaded).toBe(2);
    });

    it("401s with no session at all — the gate is now in front of ownership", async () => {
      const owner = await newCreator();
      const pack = await ownedPack(owner.id);
      const res = await createQuestion(request(`${BASE}/api/questions`, "POST", { body: { roundId: pack.rounds[0].id } }));
      expect(res.status).toBe(401);
    });

    it("403s on an ownerless pack even for a creator", async () => {
      const someone = await newCreator();
      const pack = await ownedPack(null);
      const res = await createQuestion(
        request(`${BASE}/api/questions`, "POST", { body: { roundId: pack.rounds[0].id }, cookie: someone.cookie })
      );
      expect(res.status).toBe(403);
    });

    it("still 404s for a round that doesn't exist, before any ownership check", async () => {
      const someone = await newCreator();
      const res = await createQuestion(
        request(`${BASE}/api/questions`, "POST", { body: { roundId: "nope" }, cookie: someone.cookie })
      );
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/questions/[id]", () => {
    it("lets the owner edit", async () => {
      const owner = await newCreator();
      const pack = await ownedPack(owner.id);
      const q = pack.rounds[0].questions[0];
      const res = await patchQuestion(
        request(`${BASE}/api/questions/${q.id}`, "PATCH", { body: { answer: "changed" }, cookie: owner.cookie }),
        params(q.id)
      );
      expect(res.status).toBe(200);
    });

    it("403s for a different creator and leaves the question untouched", async () => {
      const owner = await newCreator();
      const other = await newCreator();
      const pack = await ownedPack(owner.id);
      const q = pack.rounds[0].questions[0];
      const res = await patchQuestion(
        request(`${BASE}/api/questions/${q.id}`, "PATCH", { body: { answer: "vandalised" }, cookie: other.cookie }),
        params(q.id)
      );
      expect(res.status).toBe(403);
      const row = await db.question.findUniqueOrThrow({ where: { id: q.id } });
      expect(row.answer).toBe("a1");
    });

    it("403s on an ownerless pack", async () => {
      const someone = await newCreator();
      const pack = await ownedPack(null);
      const q = pack.rounds[0].questions[0];
      const res = await patchQuestion(
        request(`${BASE}/api/questions/${q.id}`, "PATCH", {
          body: { answer: "vandalised" },
          cookie: someone.cookie,
        }),
        params(q.id)
      );
      expect(res.status).toBe(403);
    });
  });

  describe("DELETE /api/questions/[id]", () => {
    it("lets the owner delete", async () => {
      const owner = await newCreator();
      const pack = await ownedPack(owner.id);
      const q = pack.rounds[0].questions[0];
      const res = await deleteQuestion(request(`${BASE}/api/questions/${q.id}`, "DELETE", { cookie: owner.cookie }), params(q.id));
      expect(res.status).toBe(200);
    });

    it("403s for a different creator", async () => {
      const owner = await newCreator();
      const other = await newCreator();
      const pack = await ownedPack(owner.id);
      const q = pack.rounds[0].questions[0];
      const res = await deleteQuestion(request(`${BASE}/api/questions/${q.id}`, "DELETE", { cookie: other.cookie }), params(q.id));
      expect(res.status).toBe(403);
      expect(await db.question.findUnique({ where: { id: q.id } })).not.toBeNull();
    });
  });

  describe("DELETE /api/rounds/[id]", () => {
    it("lets the owner delete a round", async () => {
      const owner = await newCreator();
      const pack = await ownedPack(owner.id);
      const res = await deleteRound(
        request(`${BASE}/api/rounds/${pack.rounds[0].id}`, "DELETE", { cookie: owner.cookie }),
        params(pack.rounds[0].id)
      );
      expect(res.status).toBe(200);
    });

    it("403s for a different creator", async () => {
      const owner = await newCreator();
      const other = await newCreator();
      const pack = await ownedPack(owner.id);
      const res = await deleteRound(
        request(`${BASE}/api/rounds/${pack.rounds[0].id}`, "DELETE", { cookie: other.cookie }),
        params(pack.rounds[0].id)
      );
      expect(res.status).toBe(403);
      expect(await db.round.count({ where: { packId: pack.id } })).toBe(2);
    });
  });

  describe("POST /api/rounds/[id]/move", () => {
    it("lets the owner reorder", async () => {
      const owner = await newCreator();
      const pack = await ownedPack(owner.id);
      const res = await moveRound(
        request(`${BASE}/api/rounds/${pack.rounds[1].id}/move`, "POST", { body: { direction: "up" }, cookie: owner.cookie }),
        params(pack.rounds[1].id)
      );
      expect(res.status).toBe(200);
    });

    it("403s for a different creator", async () => {
      const owner = await newCreator();
      const other = await newCreator();
      const pack = await ownedPack(owner.id);
      const res = await moveRound(
        request(`${BASE}/api/rounds/${pack.rounds[1].id}/move`, "POST", { body: { direction: "up" }, cookie: other.cookie }),
        params(pack.rounds[1].id)
      );
      expect(res.status).toBe(403);
      const rows = await db.round.findMany({ where: { packId: pack.id }, orderBy: { index: "asc" } });
      expect(rows.map((r) => r.id)).toEqual(pack.rounds.map((r) => r.id));
    });
  });

  describe("DELETE /api/packs/[id]", () => {
    // With ADMIN_TOKEN unset the admin gate is open by design (solo local
    // dev), which would mask the ownership check — so pin one here.
    beforeEach(() => vi.stubEnv("ADMIN_TOKEN", "test-admin-token"));
    afterEach(() => vi.unstubAllEnvs());

    it("still lets the operator's admin token delete any pack", async () => {
      const owner = await newCreator();
      const pack = await ownedPack(owner.id);
      const res = await deletePack(
        request(`${BASE}/api/packs/${pack.id}`, "DELETE", { headers: { "x-admin-token": "test-admin-token" } }),
        params(pack.id)
      );
      expect(res.status).toBe(200);
      expect(await db.quizPack.findUnique({ where: { id: pack.id } })).toBeNull();
    });

    it("lets the owner delete their own pack without an admin token", async () => {
      const owner = await newCreator();
      const pack = await ownedPack(owner.id);
      const res = await deletePack(request(`${BASE}/api/packs/${pack.id}`, "DELETE", { cookie: owner.cookie }), params(pack.id));
      expect(res.status).toBe(200);
      expect(await db.quizPack.findUnique({ where: { id: pack.id } })).toBeNull();
    });

    it("401s for a different creator without an admin token", async () => {
      const owner = await newCreator();
      const other = await newCreator();
      const pack = await ownedPack(owner.id);
      const res = await deletePack(request(`${BASE}/api/packs/${pack.id}`, "DELETE", { cookie: other.cookie }), params(pack.id));
      expect(res.status).toBe(401);
      expect(await db.quizPack.findUnique({ where: { id: pack.id } })).not.toBeNull();
    });
  });

  describe("DELETE /api/packs/[id] with ADMIN_TOKEN unset", () => {
    // The exact scenario the ownership check must survive: no operator
    // secret configured at all (e.g. forgotten before a deploy). Both
    // isAuthorizedAdmin and the route now fail closed here — see
    // src/lib/admin-auth.ts.
    beforeEach(() => vi.stubEnv("ADMIN_TOKEN", ""));
    afterEach(() => vi.unstubAllEnvs());

    it("401s a stranger with no cookie and no admin header, and the pack survives", async () => {
      const owner = await newCreator();
      const pack = await ownedPack(owner.id);
      const res = await deletePack(request(`${BASE}/api/packs/${pack.id}`, "DELETE"), params(pack.id));
      expect(res.status).toBe(401);
      expect(await db.quizPack.findUnique({ where: { id: pack.id } })).not.toBeNull();
    });

    it("401s a stranger who guesses at the x-admin-token header", async () => {
      const owner = await newCreator();
      const pack = await ownedPack(owner.id);
      const res = await deletePack(
        request(`${BASE}/api/packs/${pack.id}`, "DELETE", { headers: { "x-admin-token": "anything" } }),
        params(pack.id)
      );
      expect(res.status).toBe(401);
      expect(await db.quizPack.findUnique({ where: { id: pack.id } })).not.toBeNull();
    });

    it("401s on an ownerless pack even though it has no owner to protect it", async () => {
      const pack = await ownedPack(null);
      const res = await deletePack(request(`${BASE}/api/packs/${pack.id}`, "DELETE"), params(pack.id));
      expect(res.status).toBe(401);
      expect(await db.quizPack.findUnique({ where: { id: pack.id } })).not.toBeNull();
    });

    // The wrong-user case with no operator secret configured: a real,
    // signed-in-by-cookie visitor is still not this pack's creator, and the
    // absent ADMIN_TOKEN must not promote them to one.
    it("401s a different creator holding a valid cookie of their own", async () => {
      const owner = await newCreator();
      const other = await newCreator();
      const pack = await ownedPack(owner.id);
      const res = await deletePack(
        request(`${BASE}/api/packs/${pack.id}`, "DELETE", { cookie: other.cookie }),
        params(pack.id)
      );
      expect(res.status).toBe(401);
      expect(await db.quizPack.findUnique({ where: { id: pack.id } })).not.toBeNull();
    });

    it("401s a session cookie that is not a real session (e.g. a forged one)", async () => {
      const owner = await newCreator();
      const pack = await ownedPack(owner.id);
      const res = await deletePack(
        request(`${BASE}/api/packs/${pack.id}`, "DELETE", {
          cookie: "better-auth.session_token=not-a-real-session-token",
        }),
        params(pack.id)
      );
      expect(res.status).toBe(401);
      expect(await db.quizPack.findUnique({ where: { id: pack.id } })).not.toBeNull();
    });

    it("still lets the owner delete their own pack", async () => {
      const owner = await newCreator();
      const pack = await ownedPack(owner.id);
      const res = await deletePack(request(`${BASE}/api/packs/${pack.id}`, "DELETE", { cookie: owner.cookie }), params(pack.id));
      expect(res.status).toBe(200);
      expect(await db.quizPack.findUnique({ where: { id: pack.id } })).toBeNull();
    });
  });

  describe("GET /api/packs", () => {
    it("lists ownerless packs and the caller's own packs, never another creator's", async () => {
      const me = await newCreator();
      const other = await newCreator();
      const mine = await ownedPack(me.id);
      const theirs = await ownedPack(other.id);
      const shared = await ownedPack(null);

      const res = await listPacks(request(`${BASE}/api/packs`, "GET", { cookie: me.cookie }));
      expect(res.status).toBe(200);
      const ids = ((await res.json()).packs as { id: string }[]).map((p) => p.id);
      expect(ids).toContain(mine.id);
      expect(ids).toContain(shared.id);
      expect(ids).not.toContain(theirs.id);
    });

    it("401s a visitor with no session, rather than listing the shared packs", async () => {
      // Signed out there is no "own", so the list would be nothing but the
      // demo pack. Asking for an account is more honest than serving that.
      await ownedPack(null);
      const res = await listPacks(request(`${BASE}/api/packs`, "GET"));
      expect(res.status).toBe(401);
    });

    it("shows a signed-in host the ownerless packs as well as their own", async () => {
      const me = await newCreator();
      const other = await newCreator();
      const mine = await ownedPack(me.id);
      const theirs = await ownedPack(other.id);
      const shared = await ownedPack(null);

      const res = await listPacks(request(`${BASE}/api/packs`, "GET", { cookie: me.cookie }));
      const ids = ((await res.json()).packs as { id: string }[]).map((p) => p.id);
      expect(ids).toContain(mine.id);
      expect(ids).toContain(shared.id);
      expect(ids).not.toContain(theirs.id);
    });
  });

  describe("POST /api/packs/import", () => {
    const importFile = () => ({
      format: PACK_FILE_FORMAT,
      version: PACK_FILE_VERSION,
      title: `Imported Ownership Pack ${Math.random().toString(36).slice(2)}`,
      prompt: "imported",
      rounds: packInput("x").rounds,
    });

    it("stamps the signed-in importer as owner, and sets no cookie", async () => {
      const importer = await newCreator();
      const res = await importPack(
        request(`${BASE}/api/packs/import`, "POST", { body: importFile(), cookie: importer.cookie })
      );
      expect(res.status).toBe(201);
      expect(res.headers.get("set-cookie")).toBeNull();

      const { pack } = await res.json();
      const row = await db.quizPack.findUniqueOrThrow({ where: { id: pack.id } });
      expect(row.creatorId).toBe(importer.id);
    });

    it("401s an import with no session, and writes no pack", async () => {
      const before = await db.quizPack.count();
      const res = await importPack(request(`${BASE}/api/packs/import`, "POST", { body: importFile() }));
      expect(res.status).toBe(401);
      expect(await db.quizPack.count()).toBe(before);
    });
  });
});
