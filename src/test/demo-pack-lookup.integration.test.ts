import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as seed } from "@/app/api/packs/seed/route";
import { db } from "@/lib/db";
import { DEMO_PACK } from "@/lib/demo-pack";
import { createPackFromGenerated } from "@/lib/create-pack";
import { __resetFreeAllowanceCounters } from "@/lib/free-allowance";
import { signInTestHost, type TestHost } from "./auth-fixture";

const BASE = "http://localhost:3000";

/**
 * "Seed the demo pack" must never hand out somebody's own pack (M1).
 *
 * The lookup was by title alone, and the title is not reserved: a host who
 * imports or renames a pack to "…Demo Night" owns a row that matches it. The
 * next visitor to press the button would have been handed *that* pack — its
 * questions and its answers — and, because it is not ownerless, could not edit
 * it, so it would simply look broken.
 */

let ip = 900;
function seedRequest(host: TestHost) {
  ip += 1;
  return new NextRequest(`${BASE}/api/packs/seed`, {
    method: "POST",
    headers: { "x-forwarded-for": `10.5.0.${ip % 250}`, ...host.cookieHeader },
  });
}

beforeEach(() => {
  __resetFreeAllowanceCounters();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("POST /api/packs/seed", () => {
  it("never returns a pack that belongs to a host, even with the demo's title", async () => {
    const impostorOwner = await signInTestHost();
    // A host's own pack, carrying the demo's exact title and a question nobody
    // else should see.
    const impostor = await createPackFromGenerated(
      {
        title: DEMO_PACK.title,
        rounds: [
          {
            title: "Stolen Round",
            category: "General Knowledge",
            questions: [
              { text: "What is my secret question?", answer: "My secret answer", points: 1, type: "TEXT" },
            ],
          },
        ],
      },
      "impostor",
      impostorOwner.id
    );

    const visitor = await signInTestHost();
    const res = await seed(seedRequest(visitor));
    expect(res.ok).toBe(true);
    const { pack } = await res.json();

    expect(pack.id).not.toBe(impostor.id);
    expect(pack.creatorId).toBeNull();
    const text = JSON.stringify(pack);
    expect(text).not.toContain("My secret answer");
    expect(text).not.toContain("Stolen Round");
  });

  it("is still idempotent for the ownerless demo itself", async () => {
    // The behaviour the narrowed lookup must not lose: pressing the button twice
    // reuses the demo rather than piling up copies.
    const host = await signInTestHost();
    const first = await seed(seedRequest(host));
    const second = await seed(seedRequest(host));

    const a = (await first.json()).pack;
    const b = (await second.json()).pack;
    expect(b.id).toBe(a.id);
    expect(second.status).toBe(200);

    expect(await db.quizPack.count({ where: { title: DEMO_PACK.title, creatorId: null } })).toBe(1);
  });
});
