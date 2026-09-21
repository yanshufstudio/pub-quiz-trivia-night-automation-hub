import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { GET as status } from "@/app/api/creator/status/route";
import { signInTestHost } from "./auth-fixture";

const BASE = "http://localhost:3000";

function request(headers: Record<string, string> = {}) {
  return new NextRequest(`${BASE}/api/creator/status`, { headers });
}

describe("GET /api/creator/status", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("401s a visitor with no session, and writes nothing", async () => {
    // It used to answer "FREE, 0 of 2 used" to anyone, which was honest when
    // a cookie was identity — a visitor with no cookie really did have a
    // full allowance waiting. There is no allowance without an account now.
    const countBefore = await db.creator.count();
    const res = await status(request());
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await db.creator.count()).toBe(countBefore);
  });

  it("401s a stale pq_creator cookie, which is no longer identity on its own", async () => {
    const orphan = await db.creator.create({
      data: { deviceKey: `status-unclaimed-${Math.random().toString(36).slice(2)}`, packsGeneratedInPeriod: 2 },
    });
    const res = await status(request({ cookie: `pq_creator=${orphan.deviceKey}` }));
    expect(res.status).toBe(401);
  });

  it("returns the signed-in account's actual counts", async () => {
    const host = await signInTestHost();
    await db.creator.update({ where: { id: host.id }, data: { packsGeneratedInPeriod: 1 } });

    const res = await status(request(host.cookieHeader));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      plan: "FREE",
      packsGeneratedInPeriod: 1,
      limit: 2,
      email: host.email,
      // Added with Paddle: /pricing and /create read these.
      hasSubscription: false,
      subscriptionStatus: null,
    });
  });

  it("rolls an expired period to 0 without writing to the DB", async () => {
    const host = await signInTestHost();
    const longAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await db.creator.update({
      where: { id: host.id },
      data: { packsGeneratedInPeriod: 2, periodStartedAt: longAgo },
    });

    const res = await status(request(host.cookieHeader));
    expect((await res.json()).packsGeneratedInPeriod).toBe(0);

    const row = await db.creator.findUnique({ where: { id: host.id } });
    expect(row!.packsGeneratedInPeriod).toBe(2); // unchanged in the DB
    expect(row!.periodStartedAt.getTime()).toBe(longAgo.getTime());
  });
});
