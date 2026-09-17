import { describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
  }),
}));

import { COOKIE_NAME, getCreatorForPage } from "@/lib/creator";
import { db } from "@/lib/db";

describe("getCreatorForPage", () => {
  it("returns null and creates nothing for a cookie-less visitor", async () => {
    store.clear();
    const before = await db.creator.count();
    expect(await getCreatorForPage()).toBeNull();
    expect(await db.creator.count()).toBe(before);
  });

  it("returns null for a cookie with no matching row", async () => {
    store.set(COOKIE_NAME, "no-such-key");
    expect(await getCreatorForPage()).toBeNull();
  });

  it("returns the existing creator for a known cookie", async () => {
    const existing = await db.creator.create({ data: { deviceKey: `page-${Math.random().toString(36).slice(2)}` } });
    store.set(COOKIE_NAME, existing.deviceKey);
    expect((await getCreatorForPage())?.id).toBe(existing.id);
  });
});
