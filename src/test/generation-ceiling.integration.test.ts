import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";

vi.mock("@/lib/generate-pack", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/generate-pack")>()),
  generateQuizPack: vi.fn(),
}));

import { generateQuizPack, ModelDeclinedError } from "@/lib/generate-pack";
import { POST as generate } from "@/app/api/packs/generate/route";
import { COOKIE_NAME, FREE_LIMIT } from "@/lib/creator";
import { FREE_CEILING_ENV, PRO_CEILING_ENV, __resetMemoryCounters } from "@/lib/daily-ceiling";

const BASE = "http://localhost:3000";

const PACK = {
  pack: {
    title: "Ceiling Test Pack",
    rounds: [
      {
        title: "Round One",
        category: "General Knowledge",
        questions: [{ text: "What is the capital of Australia?", answer: "Canberra", points: 1, type: "TEXT" }],
      },
    ],
  },
  droppedQuestions: 0,
  droppedRounds: 0,
  truncated: false,
};

// The per-IP limiter's bucket is shared across the file, so every test poses
// as a different visitor rather than exhausting one address's 5-per-10-min.
let testIp = 200;

function generateRequest(cookie?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-forwarded-for": `10.9.0.${testIp}`,
  };
  if (cookie) headers.cookie = `${COOKIE_NAME}=${cookie}`;
  return new NextRequest(`${BASE}/api/packs/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ prompt: "Four rounds of pub trivia." }),
  });
}

const savedEnv: Record<string, string | undefined> = {};

/**
 * The free tier was voluntary and the Anthropic bill had no ceiling at all.
 * getOrCreateCreator mints a fresh Creator with a full allowance for any
 * request that arrives without a pq_creator cookie, so deleting the cookie
 * reset the allowance and never sending one skipped it entirely — a
 * cookie-less curl loop was an unlimited generator, bounded only by the
 * per-IP throttle. Signing the cookie would not have helped: the attack is
 * having no cookie at all.
 */
describe("the global daily generation ceiling", () => {
  beforeEach(() => {
    testIp += 1;
    for (const k of [FREE_CEILING_ENV, PRO_CEILING_ENV]) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    __resetMemoryCounters();
    vi.mocked(generateQuizPack).mockReset();
    vi.mocked(generateQuizPack).mockResolvedValue(PACK as never);
  });

  afterEach(() => {
    for (const k of [FREE_CEILING_ENV, PRO_CEILING_ENV]) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    __resetMemoryCounters();
    vi.mocked(generateQuizPack).mockReset();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("stops a caller who never sends a cookie, which nothing used to", async () => {
    process.env[FREE_CEILING_ENV] = "3";

    for (let i = 0; i < 3; i++) {
      // A brand-new identity every time — the whole point of the attack.
      expect((await generate(generateRequest())).status).toBe(201);
    }

    const refused = await generate(generateRequest());
    expect(refused.status).toBe(503);
    expect(refused.headers.get("Retry-After")).toBeTruthy();

    const body = await refused.json();
    expect(body.dailyCeilingReached).toBe(true);
    // Not a generic error: it says what happened and where to go.
    expect(body.error).toMatch(/pricing/i);
    expect(body.error).not.toMatch(/try again\b(?!.*tomorrow)/i);

    // And the model was never reached on the refused call.
    expect(vi.mocked(generateQuizPack)).toHaveBeenCalledTimes(3);
  });

  it("checks the ceiling before writing a Creator row", async () => {
    process.env[FREE_CEILING_ENV] = "0";
    const before = await db.creator.count();

    const refused = await generate(generateRequest());
    expect(refused.status).toBe(503);

    expect(await db.creator.count()).toBe(before);
    expect(vi.mocked(generateQuizPack)).not.toHaveBeenCalled();
  });

  it("hands the reservation back when the generation fails", async () => {
    process.env[FREE_CEILING_ENV] = "1";
    vi.mocked(generateQuizPack).mockRejectedValueOnce(new Error("upstream exploded"));

    expect((await generate(generateRequest())).status).toBe(502);

    // The failed attempt spent nothing, so the day's one slot is still there.
    expect((await generate(generateRequest())).status).toBe(201);
  });

  it("does not spend a free creator's allowance on a failed generation", async () => {
    vi.mocked(generateQuizPack).mockRejectedValueOnce(new Error("upstream exploded"));

    const failed = await generate(generateRequest());
    expect(failed.status).toBe(502);
    const deviceKey = failed.cookies.get(COOKIE_NAME)!.value;

    const creator = await db.creator.findUnique({ where: { deviceKey } });
    expect(creator?.packsGeneratedInPeriod).toBe(0);
  });

  it("keeps Pro out of the free bucket entirely", async () => {
    process.env[FREE_CEILING_ENV] = "0";
    process.env[PRO_CEILING_ENV] = "2";

    const pro = await db.creator.create({ data: { deviceKey: `pro-${Math.random()}`, plan: "PRO" } });

    // Free is shut, and it makes no difference to a Pro subscriber.
    expect((await generate(generateRequest())).status).toBe(503);
    expect((await generate(generateRequest(pro.deviceKey))).status).toBe(201);

    // Pro is also never charged against its own per-creator free allowance.
    const after = await db.creator.findUnique({ where: { id: pro.id } });
    expect(after?.packsGeneratedInPeriod).toBe(0);
  });
});

/**
 * M12: the free-cap check and the increment straddled a multi-second model
 * call, so two concurrent requests on one cookie both read the same pre-call
 * count, both passed, and both generated.
 */
describe("the per-creator free cap under concurrency", () => {
  beforeEach(() => {
    testIp += 1;
    __resetMemoryCounters();
    vi.mocked(generateQuizPack).mockReset();
    // A slow model call is what opened the window; keep it open on purpose.
    vi.mocked(generateQuizPack).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(PACK as never), 40))
    );
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("lets a cookie through exactly FREE_LIMIT times when all of them race", async () => {
    const creator = await db.creator.create({ data: { deviceKey: `race-${Math.random()}` } });

    // Twice the allowance, all in flight together.
    const attempts = Array.from({ length: FREE_LIMIT * 2 }, () => generate(generateRequest(creator.deviceKey)));
    const statuses = (await Promise.all(attempts)).map((r) => r.status);

    expect(statuses.filter((s) => s === 201)).toHaveLength(FREE_LIMIT);
    expect(statuses.filter((s) => s === 403)).toHaveLength(FREE_LIMIT);

    const after = await db.creator.findUnique({ where: { id: creator.id } });
    expect(after?.packsGeneratedInPeriod).toBe(FREE_LIMIT);
  });
});

/** UX 1: a decline is not a retryable failure. */
describe("a brief the model declines", () => {
  beforeEach(() => {
    testIp += 1;
    __resetMemoryCounters();
    vi.mocked(generateQuizPack).mockReset();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("comes back as 422 carrying the model's own reason, with no retry prompt", async () => {
    const reason = "I can't write a quiz round about how to synthesise nerve agents.";
    vi.mocked(generateQuizPack).mockRejectedValueOnce(new ModelDeclinedError(reason));

    const res = await generate(generateRequest());
    expect(res.status).toBe(422);

    const body = await res.json();
    expect(body.error).toBe(reason);
    expect(body.declined).toBe(true);
    // The old 502 body. Retrying a decline cannot work.
    expect(body.error).not.toMatch(/please try again/i);
  });

  it("still says something useful when the model declines silently", async () => {
    vi.mocked(generateQuizPack).mockRejectedValueOnce(new ModelDeclinedError(""));

    const res = await generate(generateRequest());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.declined).toBe(true);
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("does not spend the free allowance on a declined brief", async () => {
    vi.mocked(generateQuizPack).mockRejectedValueOnce(new ModelDeclinedError("no"));

    const res = await generate(generateRequest());
    const deviceKey = res.cookies.get(COOKIE_NAME)!.value;
    const creator = await db.creator.findUnique({ where: { deviceKey } });
    expect(creator?.packsGeneratedInPeriod).toBe(0);
  });
});
