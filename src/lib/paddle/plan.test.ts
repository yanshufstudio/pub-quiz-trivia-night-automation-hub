import { describe, expect, it } from "vitest";
import { isNewerEvent, statusToPlan } from "./plan";

describe("statusToPlan", () => {
  it.each([
    ["active", "PRO"],
    ["trialing", "PRO"],
    ["past_due", "PRO"],
    ["canceled", "FREE"],
    ["paused", "FREE"],
    ["something-new", "FREE"],
  ])("%s → %s", (status, plan) => {
    expect(statusToPlan(status)).toBe(plan);
  });
});

describe("isNewerEvent", () => {
  const t1 = new Date("2026-09-09T10:00:00Z");
  const t2 = new Date("2026-09-09T10:00:01Z");
  it("accepts any event when nothing is stored", () => {
    expect(isNewerEvent(t1, null)).toBe(true);
  });
  it("accepts a later event", () => {
    expect(isNewerEvent(t2, t1)).toBe(true);
  });
  it("rejects an older event", () => {
    expect(isNewerEvent(t1, t2)).toBe(false);
  });
  it("accepts an equal timestamp (same-second updates from Paddle)", () => {
    expect(isNewerEvent(t1, t1)).toBe(true);
  });
});
