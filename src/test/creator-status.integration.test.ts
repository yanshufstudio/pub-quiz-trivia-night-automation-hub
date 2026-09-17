import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { GET as status } from "@/app/api/creator/status/route";

const BASE = "http://localhost:3000";

function requestWithCookie(cookie?: string) {
  return new NextRequest(`${BASE}/api/creator/status`, {
    headers: cookie ? { cookie: `pq_creator=${cookie}` } : {},
  });
}

describe("GET /api/creator/status", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("returns FREE defaults with no DB row for a visitor with no cookie", async () => {
    const countBefore = await db.creator.count();
    const res = await status(requestWithCookie());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ plan: "FREE", packsGeneratedInPeriod: 0, limit: 2, hasSubscription: false, subscriptionStatus: null });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await db.creator.count()).toBe(countBefore);
  });

  it("returns FREE defaults for a cookie with no matching row", async () => {
    const res = await status(requestWithCookie("no-such-device-key"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ plan: "FREE", packsGeneratedInPeriod: 0, limit: 2, hasSubscription: false, subscriptionStatus: null });
  });

  it("returns a real creator's actual counts", async () => {
    const creator = await db.creator.create({
      data: { deviceKey: "status-test-device", packsGeneratedInPeriod: 1 },
    });
    const res = await status(requestWithCookie(creator.deviceKey));
    expect(await res.json()).toEqual({ plan: "FREE", packsGeneratedInPeriod: 1, limit: 2, hasSubscription: false, subscriptionStatus: null });
  });

  it("rolls an expired period to 0 without writing to the DB", async () => {
    const longAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const creator = await db.creator.create({
      data: { deviceKey: "status-expired-device", packsGeneratedInPeriod: 2, periodStartedAt: longAgo },
    });
    const res = await status(requestWithCookie(creator.deviceKey));
    expect(await res.json()).toEqual({ plan: "FREE", packsGeneratedInPeriod: 0, limit: 2, hasSubscription: false, subscriptionStatus: null });

    const row = await db.creator.findUnique({ where: { deviceKey: creator.deviceKey } });
    expect(row!.packsGeneratedInPeriod).toBe(2); // unchanged in the DB
    expect(row!.periodStartedAt.getTime()).toBe(longAgo.getTime());
  });

  it("reports hasSubscription and subscriptionStatus", async () => {
    const deviceKey = `status-sub-${Math.random().toString(36).slice(2)}`;
    await db.creator.create({
      data: { deviceKey, plan: "PRO", paddleSubscriptionId: `sub_${deviceKey}`, subscriptionStatus: "active" },
    });
    const res = await status(requestWithCookie(deviceKey));
    const body = await res.json();
    expect(body.plan).toBe("PRO");
    expect(body.hasSubscription).toBe(true);
    expect(body.subscriptionStatus).toBe("active");
  });

  it("reports hasSubscription false for a cookie-less visitor", async () => {
    const res = await status(requestWithCookie());
    expect((await res.json()).hasSubscription).toBe(false);
  });
});
