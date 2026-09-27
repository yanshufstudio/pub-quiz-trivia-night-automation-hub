import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";

/**
 * The whole of N1, driven through the real route: with the shared counter
 * throwing on every call, the rate limiter lets the request in and the daily
 * ceiling turns it away — and nothing is spent.
 *
 * The counter is replaced rather than the Redis client, because the client is
 * built once when src/lib/fixed-window-counter.ts is first imported and the
 * route has already imported it by the time a test could stub the environment.
 * What is faked is exactly what an unreachable Upstash does: every operation
 * rejects.
 */
vi.mock("@/lib/fixed-window-counter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/fixed-window-counter")>();
  const dead = (operation: string) => async () => {
    throw new actual.CounterUnavailableError(operation, new Error("WRONGPASS invalid auth token"));
  };
  return {
    ...actual,
    createFixedWindowCounter: () => ({
      hit: dead("hit"),
      secondsLeft: dead("secondsLeft"),
      release: dead("release"),
      resetMemory: () => {},
    }),
  };
});

vi.mock("@/lib/generate-pack", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/generate-pack")>()),
  generateQuizPack: vi.fn(),
}));

import { generateQuizPack } from "@/lib/generate-pack";
import { POST as generate } from "@/app/api/packs/generate/route";
import { CEILING_UNAVAILABLE_MESSAGE } from "@/lib/daily-ceiling";
import { signInTestHost } from "./auth-fixture";

const BASE = "http://localhost:3000";

describe("a generate request while Upstash is unreachable", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(generateQuizPack).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("is refused with 503 and the paused message, and never calls the model", async () => {
    const host = await signInTestHost();
    const res = await generate(
      new NextRequest(`${BASE}/api/packs/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "10.9.7.1",
          ...host.cookieHeader,
        },
        body: JSON.stringify({ prompt: "Four rounds of pub trivia." }),
      })
    );

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe(CEILING_UNAVAILABLE_MESSAGE);
    expect(body.generationPaused).toBe(true);

    // Seconds, not the hours an exhausted ceiling would ask for: this is an
    // outage, and it is over when it is over.
    expect(Number(res.headers.get("Retry-After"))).toBeLessThanOrEqual(60);

    // The point of failing closed. Nothing reached Anthropic, so the outage
    // cost nothing.
    expect(generateQuizPack).not.toHaveBeenCalled();

    // It got past the limiter to reach the ceiling at all, and said so once.
    expect(warn.mock.calls.flat().join(" ")).toContain("ratelimit-redis-error");
    expect(error.mock.calls.flat().join(" ")).toContain("daily-ceiling-redis-error");
  });

  it("does not answer with the words of an exhausted allowance", async () => {
    // The 27 Sep failure was confusing partly because the message did not
    // match the cause. A visitor must not be told to upgrade, or to come back
    // tomorrow, because a cache blinked.
    const host = await signInTestHost();
    const res = await generate(
      new NextRequest(`${BASE}/api/packs/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "10.9.7.2",
          ...host.cookieHeader,
        },
        body: JSON.stringify({ prompt: "Four rounds of pub trivia." }),
      })
    );

    const body = await res.json();
    expect(body.error).not.toMatch(/upgrade|tomorrow|Pro subscribers|ceiling/i);
    expect(body.dailyCeilingReached).toBeUndefined();
  });
});
