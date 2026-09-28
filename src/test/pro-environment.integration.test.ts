import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/generate-pack", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/generate-pack")>()),
  generateQuizPack: vi.fn(),
}));

import { generateQuizPack } from "@/lib/generate-pack";
import { POST as webhook } from "@/app/api/paddle/webhook/route";
import { POST as generate } from "@/app/api/packs/generate/route";
import { GET as creatorStatus } from "@/app/api/creator/status/route";
import { db } from "@/lib/db";
import { FREE_LIMIT } from "@/lib/creator";
import { FREE_IP_DAILY_LIMIT_ENV, __resetFreeAllowanceCounters } from "@/lib/free-allowance";
import { __resetMemoryCounters } from "@/lib/daily-ceiling";
import {
  TEST_WEBHOOK_SECRET,
  signedCustomData,
  signedWebhookRequest,
  subscriptionPayload,
} from "./paddle-fixtures";
import { signInTestHost, type TestHost } from "./auth-fixture";

/**
 * Sandbox Pro must never be production Pro (C1), through the real webhook and
 * the real routes that read a plan.
 *
 * Preview deployments share the production database and talk to Paddle's
 * sandbox, and BETTER_AUTH_SECRET is set separately for Preview — so a sandbox
 * checkout on a preview is signed and verified by that preview, and then writes
 * plan: "PRO" to the very Creator row production reads. A subscription that cost
 * nothing could hand out real Pro.
 *
 * C2 does not close this and cannot: a sandbox price id is exactly what a
 * preview's own NEXT_PUBLIC_PADDLE_PRICE_* are set to, so the event is ours as
 * far as a price check can tell. What closes it is recording which Paddle
 * granted the Pro and refusing to honour a grant from the other one.
 */

const SANDBOX_PRICE = "pri_sandbox_monthly";
const LIVE_PRICE = "pri_live_monthly";

const PACK = {
  pack: {
    title: "C1 Pack",
    rounds: [
      {
        title: "Round One",
        category: "General Knowledge",
        questions: [{ text: "Capital of Australia?", answer: "Canberra", points: 1, type: "TEXT" }],
      },
    ],
  },
  droppedQuestions: 0,
  droppedRounds: 0,
  truncated: false,
};

let ip = 700;

function generateRequest(host: TestHost) {
  ip += 1;
  return new NextRequest("http://localhost:3000/api/packs/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.9.0.${ip % 250}`,
      ...host.cookieHeader,
    },
    body: JSON.stringify({ prompt: "Four rounds of pub trivia." }),
  });
}

beforeEach(() => {
  vi.stubEnv("PADDLE_NOTIFICATION_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET);
  vi.mocked(generateQuizPack).mockReset();
  vi.mocked(generateQuizPack).mockResolvedValue(PACK as never);
  __resetFreeAllowanceCounters();
  __resetMemoryCounters();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetFreeAllowanceCounters();
  __resetMemoryCounters();
});

/** Apply a real, signed subscription.created for `host`, as `env` would. */
async function grantProAs(env: "sandbox" | "production", host: TestHost, price: string) {
  vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", env);
  vi.stubEnv("NEXT_PUBLIC_PADDLE_PRICE_MONTHLY", price);
  vi.stubEnv("NEXT_PUBLIC_PADDLE_PRICE_ANNUAL", `${price}-annual`);
  // A customer and subscription id of our own. subscriptionPayload defaults
  // customer_id to a shared "ctm_test", and the webhook falls back to matching a
  // creator by stored customer id when customData carries no valid signature —
  // so leaving the default here bound these creators to an id other files' tests
  // then matched, and "answers 500 for a creator it cannot find" started finding
  // one. The full-suite run caught it; the file on its own never could.
  const unique = Math.random().toString(36).slice(2, 10);
  const res = await webhook(
    signedWebhookRequest(
      subscriptionPayload({
        status: "active",
        priceIds: [price],
        customerId: `ctm_c1_${unique}`,
        subscriptionId: `sub_c1_${unique}`,
        customData: signedCustomData(host.id),
      })
    )
  );
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toMatchObject({ result: "applied" });
}

function statusRequest(host: TestHost) {
  return new NextRequest("http://localhost:3000/api/creator/status", { headers: host.cookieHeader });
}

/** Put the deployment in `env`, as a differently-configured deploy reading the
 * same database would be. */
function readingAs(env: "sandbox" | "production", price: string) {
  vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", env);
  vi.stubEnv("NEXT_PUBLIC_PADDLE_PRICE_MONTHLY", price);
  vi.stubEnv("NEXT_PUBLIC_PADDLE_PRICE_ANNUAL", `${price}-annual`);
}

describe("a sandbox subscription, read by production (C1)", () => {
  it("records which Paddle granted the Pro", async () => {
    const host = await signInTestHost();
    await grantProAs("sandbox", host, SANDBOX_PRICE);

    const row = await db.creator.findUniqueOrThrow({ where: { id: host.id } });
    expect(row.plan).toBe("PRO");
    expect(row.proEnvironment).toBe("sandbox");
  });

  it("is not Pro on production, at the surface that tells the UI", async () => {
    const host = await signInTestHost();
    await grantProAs("sandbox", host, SANDBOX_PRICE);

    // The same row, read by production.
    readingAs("production", LIVE_PRICE);
    const body = await (await creatorStatus(statusRequest(host))).json();
    expect(body.plan).toBe("FREE");
    // And it is subject to the free allowance like any other free account,
    // rather than being cosmetically downgraded.
    expect(body.limit).toBe(FREE_LIMIT);
  });

  it("is still Pro on the preview that granted it, so the sandbox walk works", async () => {
    const host = await signInTestHost();
    await grantProAs("sandbox", host, SANDBOX_PRICE);

    readingAs("sandbox", SANDBOX_PRICE);
    const body = await (await creatorStatus(statusRequest(host))).json();
    expect(body.plan).toBe("PRO");
  });
});

describe("a production subscription (C1)", () => {
  it("is Pro on production", async () => {
    const host = await signInTestHost();
    await grantProAs("production", host, LIVE_PRICE);

    const row = await db.creator.findUniqueOrThrow({ where: { id: host.id } });
    expect(row.proEnvironment).toBe("production");

    readingAs("production", LIVE_PRICE);
    const body = await (await creatorStatus(statusRequest(host))).json();
    expect(body.plan).toBe("PRO");
  });

  it("is not Pro on a preview, so a preview tests its own grant", async () => {
    const host = await signInTestHost();
    await grantProAs("production", host, LIVE_PRICE);

    readingAs("sandbox", SANDBOX_PRICE);
    const body = await (await creatorStatus(statusRequest(host))).json();
    expect(body.plan).toBe("FREE");
  });
});

describe("a Pro row from before the column existed", () => {
  it("keeps its Pro on production, so no paying customer changes state", async () => {
    // Every Pro row in production today has no proEnvironment. Shipping this
    // must not take anybody's subscription away.
    const host = await signInTestHost();
    await db.creator.update({
      where: { id: host.id },
      data: { plan: "PRO", subscriptionStatus: "active", proEnvironment: null },
    });

    readingAs("production", LIVE_PRICE);
    const body = await (await creatorStatus(statusRequest(host))).json();
    expect(body.plan).toBe("PRO");
  });
});

describe("what a sandbox grant can actually do on production", () => {
  it("is subject to the free allowance, not merely shown as FREE", async () => {
    // The readout being FREE is cosmetic on its own. This is the part that
    // matters: a free sandbox subscription buys no generation beyond the two
    // packs any free account gets.
    const host = await signInTestHost();
    await grantProAs("sandbox", host, SANDBOX_PRICE);

    readingAs("production", LIVE_PRICE);
    for (let i = 0; i < FREE_LIMIT; i++) {
      expect((await generate(generateRequest(host))).status).toBe(201);
    }

    const refused = await generate(generateRequest(host));
    expect(refused.status).toBe(403);
    await expect(refused.json()).resolves.toMatchObject({ limit: FREE_LIMIT });
  });

  it("is subject to the per-address free cap, which only free traffic pays", async () => {
    // The free allowance alone cannot prove the route treats this row as FREE:
    // canGenerate and reserveFreeGeneration gate that themselves whatever the
    // route thinks. This cap is one the route decides on its own — it is skipped
    // entirely for PRO — so it is what distinguishes a route reading
    // effectivePlan from one reading the raw row. The same goes for which daily
    // ceiling bucket is spent and whether a Pro per-subscriber unit is taken.
    vi.stubEnv(FREE_IP_DAILY_LIMIT_ENV, "1");
    const shared = "10.9.9.9";

    const first = await signInTestHost();
    await grantProAs("sandbox", first, SANDBOX_PRICE);
    readingAs("production", LIVE_PRICE);

    const req = () =>
      new NextRequest("http://localhost:3000/api/packs/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": shared,
          ...first.cookieHeader,
        },
        body: JSON.stringify({ prompt: "Four rounds of pub trivia." }),
      });

    expect((await generate(req())).status).toBe(201);
    const refused = await generate(req());
    expect(refused.status).toBe(429);
    await expect(refused.json()).resolves.toMatchObject({ freeIpLimitReached: true });
  });

  it("and a production grant is not, on production", async () => {
    const host = await signInTestHost();
    await grantProAs("production", host, LIVE_PRICE);

    readingAs("production", LIVE_PRICE);
    for (let i = 0; i < FREE_LIMIT + 1; i++) {
      expect((await generate(generateRequest(host))).status).toBe(201);
    }
  });
});
