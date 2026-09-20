import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";

vi.mock("@/lib/generate-pack", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/generate-pack")>()),
  generateQuizPack: vi.fn(),
}));

import { generateQuizPack, ModelDeclinedError, UnusableModelOutputError } from "@/lib/generate-pack";
import { POST as generate } from "@/app/api/packs/generate/route";
import { FREE_LIMIT } from "@/lib/creator";
import { signInTestHost, type TestHost } from "./auth-fixture";
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

/**
 * A request from `host`, or from nobody at all when omitted.
 *
 * Every test below used to vary the `pq_creator` cookie, because that was
 * identity. It varies the account now — and the difference is the point of
 * this whole change: a caller could always drop a cookie, and cannot drop an
 * account.
 */
function generateRequest(host?: TestHost) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-forwarded-for": `10.9.0.${testIp}`,
    ...(host?.cookieHeader ?? {}),
  };
  return new NextRequest(`${BASE}/api/packs/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ prompt: "Four rounds of pub trivia." }),
  });
}

/** A brand-new account, the closest thing left to "a brand-new identity". */
const freshHost = () => signInTestHost();

const savedEnv: Record<string, string | undefined> = {};

/**
 * The free tier was voluntary and the Anthropic bill had no ceiling at all:
 * a request with no `pq_creator` cookie was handed a fresh Creator with a
 * full allowance, so dropping the cookie reset it and never sending one
 * skipped it entirely.
 *
 * Accounts close that particular door — generation now needs one — but the
 * global ceiling is still the thing that actually bounds the bill, because
 * signing up is free and an attacker can do it repeatedly. It has no
 * identity in its key at all, which is exactly why rotating accounts does
 * not move it. That is what the first test here proves.
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

  it("stops a caller who signs up a fresh account for every request", async () => {
    process.env[FREE_CEILING_ENV] = "3";

    for (let i = 0; i < 3; i++) {
      // A brand-new account every time — the cheapest attack still available
      // now that a cookie is not identity. The ceiling does not care.
      expect((await generate(generateRequest(await freshHost()))).status).toBe(201);
    }

    const refused = await generate(generateRequest(await freshHost()));
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

  it("refuses a caller with no account at all, before the ceiling is touched", async () => {
    process.env[FREE_CEILING_ENV] = "3";

    const refused = await generate(generateRequest());
    expect(refused.status).toBe(401);
    expect(vi.mocked(generateQuizPack)).not.toHaveBeenCalled();

    // The day's allowance is intact: a 401 must not cost a genuine host a slot.
    for (let i = 0; i < 3; i++) {
      expect((await generate(generateRequest(await freshHost()))).status).toBe(201);
    }
  });

  it("checks the ceiling before writing a pack or calling the model", async () => {
    process.env[FREE_CEILING_ENV] = "0";
    const before = await db.quizPack.count();

    const refused = await generate(generateRequest(await freshHost()));
    expect(refused.status).toBe(503);

    expect(await db.quizPack.count()).toBe(before);
    expect(vi.mocked(generateQuizPack)).not.toHaveBeenCalled();
  });

  // The ceiling is a bill control, and the bill is charged when the model
  // produces a completion — not when the app likes the result. A brief that
  // runs to the full 16k max_tokens and then fails validation is the most
  // expensive call this app can make, so refunding its unit would leave a
  // loop of exactly those bounded by nothing but the per-IP throttle.
  it("keeps the ceiling unit spent when the model ran and produced something unusable", async () => {
    process.env[FREE_CEILING_ENV] = "1";
    vi.mocked(generateQuizPack).mockRejectedValueOnce(
      new UnusableModelOutputError("ran to max_tokens and could not be salvaged", true)
    );

    expect((await generate(generateRequest(await freshHost()))).status).toBe(422);

    // The day's only unit was spent on a real, billed generation.
    const next = await generate(generateRequest(await freshHost()));
    expect(next.status).toBe(503);
    expect((await next.json()).dailyCeilingReached).toBe(true);
  });

  it("keeps it spent for a declined brief too — the model still ran", async () => {
    process.env[FREE_CEILING_ENV] = "1";
    vi.mocked(generateQuizPack).mockRejectedValueOnce(new ModelDeclinedError("no"));

    expect((await generate(generateRequest(await freshHost()))).status).toBe(422);
    expect((await generate(generateRequest(await freshHost()))).status).toBe(503);
  });

  it("hands the ceiling back when the API rejected the request outright", async () => {
    process.env[FREE_CEILING_ENV] = "1";
    // A 429 or a 5xx produces no completion, so there is nothing to charge
    // for and nothing to account against the day.
    vi.mocked(generateQuizPack).mockRejectedValueOnce(
      new Anthropic.APIError(503, { type: "error" }, "upstream down", undefined)
    );

    expect((await generate(generateRequest(await freshHost()))).status).toBe(503);
    expect((await generate(generateRequest(await freshHost()))).status).toBe(201);
  });

  it("never charges the caller a free pack for a failure, however it failed", async () => {
    // The two reservations are refunded on different terms, and this is the
    // half that always comes back: a user must not lose an allowance to our
    // failure, even one we were billed for.
    for (const err of [
      new UnusableModelOutputError("unusable", true),
      new ModelDeclinedError("no"),
      new Anthropic.APIError(503, { type: "error" }, "down", undefined),
    ]) {
      vi.mocked(generateQuizPack).mockRejectedValueOnce(err);
      const host = await freshHost();
      await generate(generateRequest(host));
      const creator = await db.creator.findUnique({ where: { id: host.id } });
      expect(creator?.packsGeneratedInPeriod).toBe(0);
    }
  });

  it("refuses a spent creator without touching the shared daily counter", async () => {
    process.env[FREE_CEILING_ENV] = "1";
    const spentHost = await freshHost();
    await db.creator.update({
      where: { id: spentHost.id },
      data: { packsGeneratedInPeriod: FREE_LIMIT },
    });

    // Their 403 must not INCR-then-DECR the day's counter: at the boundary
    // that churn can make a genuine visitor read one over the ceiling and be
    // refused capacity nobody is using.
    expect((await generate(generateRequest(spentHost))).status).toBe(403);

    // The day is untouched, so the one real slot is still there.
    expect((await generate(generateRequest(await freshHost()))).status).toBe(201);
  });

  it("does not spend a free creator's allowance on a failed generation", async () => {
    vi.mocked(generateQuizPack).mockRejectedValueOnce(new Error("upstream exploded"));

    const host = await freshHost();
    const failed = await generate(generateRequest(host));
    expect(failed.status).toBe(502);

    const creator = await db.creator.findUnique({ where: { id: host.id } });
    expect(creator?.packsGeneratedInPeriod).toBe(0);
  });

  it("keeps Pro out of the free bucket entirely", async () => {
    process.env[FREE_CEILING_ENV] = "0";
    process.env[PRO_CEILING_ENV] = "2";

    const proHost = await freshHost();
    await db.creator.update({ where: { id: proHost.id }, data: { plan: "PRO" } });

    // Free is shut, and it makes no difference to a Pro subscriber.
    expect((await generate(generateRequest(await freshHost()))).status).toBe(503);
    expect((await generate(generateRequest(proHost))).status).toBe(201);

    // Pro is also never charged against its own per-creator free allowance.
    const after = await db.creator.findUnique({ where: { id: proHost.id } });
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

  it("lets one account through exactly FREE_LIMIT times when all of them race", async () => {
    const host = await signInTestHost();

    // Twice the allowance, all in flight together.
    const attempts = Array.from({ length: FREE_LIMIT * 2 }, () => generate(generateRequest(host)));
    const statuses = (await Promise.all(attempts)).map((r) => r.status);

    expect(statuses.filter((s) => s === 201)).toHaveLength(FREE_LIMIT);
    expect(statuses.filter((s) => s === 403)).toHaveLength(FREE_LIMIT);

    const after = await db.creator.findUnique({ where: { id: host.id } });
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

    const res = await generate(generateRequest(await freshHost()));
    expect(res.status).toBe(422);

    const body = await res.json();
    expect(body.error).toBe(reason);
    expect(body.declined).toBe(true);
    // The old 502 body. Retrying a decline cannot work.
    expect(body.error).not.toMatch(/please try again/i);
  });

  it("still says something useful when the model declines silently", async () => {
    vi.mocked(generateQuizPack).mockRejectedValueOnce(new ModelDeclinedError(""));

    const res = await generate(generateRequest(await freshHost()));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.declined).toBe(true);
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("does not spend the free allowance on a declined brief", async () => {
    vi.mocked(generateQuizPack).mockRejectedValueOnce(new ModelDeclinedError("no"));

    const host = await freshHost();
    await generate(generateRequest(host));
    const creator = await db.creator.findUnique({ where: { id: host.id } });
    expect(creator?.packsGeneratedInPeriod).toBe(0);
  });
});
