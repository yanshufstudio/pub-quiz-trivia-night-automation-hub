import { describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
    set: (name: string, value: string) => void store.set(name, value),
  }),
}));

import { COOKIE_NAME, getOrCreateCreatorForPage } from "@/lib/creator";
import { db } from "@/lib/db";

describe("getOrCreateCreatorForPage", () => {
  it("creates a creator and sets the cookie when none exists", async () => {
    store.clear();
    const creator = await getOrCreateCreatorForPage();
    expect(store.get(COOKIE_NAME)).toBe(creator.deviceKey);
    expect(await db.creator.findUnique({ where: { id: creator.id } })).not.toBeNull();
  });

  it("returns the existing creator for a known cookie", async () => {
    const existing = await db.creator.create({ data: { deviceKey: `page-${Math.random().toString(36).slice(2)}` } });
    store.set(COOKIE_NAME, existing.deviceKey);
    const creator = await getOrCreateCreatorForPage();
    expect(creator.id).toBe(existing.id);
  });
});
