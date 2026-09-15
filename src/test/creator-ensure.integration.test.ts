import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/creator/ensure/route";
import { COOKIE_NAME } from "@/lib/creator";
import { db } from "@/lib/db";

describe("POST /api/creator/ensure", () => {
  it("creates a creator and sets the cookie for a new visitor", async () => {
    const res = await POST(new NextRequest("http://localhost:3000/api/creator/ensure", { method: "POST" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.plan).toBe("FREE");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${COOKIE_NAME}=`);
    expect(await db.creator.findUnique({ where: { id: body.creatorId } })).not.toBeNull();
  });

  it("returns the existing creator for a known cookie without a new cookie", async () => {
    const existing = await db.creator.create({ data: { deviceKey: `ensure-${Math.random().toString(36).slice(2)}` } });
    const res = await POST(
      new NextRequest("http://localhost:3000/api/creator/ensure", { method: "POST", headers: { cookie: `${COOKIE_NAME}=${existing.deviceKey}` } })
    );
    expect((await res.json()).creatorId).toBe(existing.id);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
