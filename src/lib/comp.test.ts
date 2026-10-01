import { afterEach, describe, expect, it, vi } from "vitest";
import { isCompEmail, PRO_COMP_EMAILS_ENV } from "@/lib/comp";
import { canGenerate, effectivePlan, FREE_LIMIT } from "@/lib/creator";
import type { Creator } from "@prisma/client";

/**
 * PRC4. The owner's own accounts get Pro from a server-only list, with no
 * Paddle subscription, no trial and nothing written to the database. It
 * applies only where the variable is set.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isCompEmail", () => {
  it("comps nobody when the variable is unset or blank", () => {
    vi.stubEnv(PRO_COMP_EMAILS_ENV, undefined as unknown as string);
    expect(isCompEmail("owner@example.com")).toBe(false);
    for (const blank of ["", "   ", " , ,, "]) {
      vi.stubEnv(PRO_COMP_EMAILS_ENV, blank);
      expect(isCompEmail("owner@example.com"), JSON.stringify(blank)).toBe(false);
    }
  });

  it("comps a listed address, and the same mailbox written differently", () => {
    vi.stubEnv(PRO_COMP_EMAILS_ENV, " owner@example.com , paul.name@gmail.com ");
    for (const email of [
      "owner@example.com",
      "  Owner@Example.COM ",
      "owner+quiz@example.com",
      "paulname@gmail.com",
      "Paul.Name+tf@googlemail.com",
    ]) {
      expect(isCompEmail(email), email).toBe(true);
    }
  });

  it("does not comp an address that is merely similar", () => {
    vi.stubEnv(PRO_COMP_EMAILS_ENV, "owner@example.com");
    for (const email of ["owner@example.co", "other@example.com", "owner.x@example.com", "", null, undefined]) {
      expect(isCompEmail(email), String(email)).toBe(false);
    }
  });

  it("is a server-only variable: never NEXT_PUBLIC_, so it cannot reach the browser bundle", () => {
    expect(PRO_COMP_EMAILS_ENV).toBe("PRO_COMP_EMAILS");
  });
});

describe("effectivePlan with owner comp", () => {
  const free = { plan: "FREE", proEnvironment: null } as const;

  it("makes a comped account PRO without anything on its row", () => {
    vi.stubEnv(PRO_COMP_EMAILS_ENV, "owner@example.com");
    expect(effectivePlan(free, "Owner+x@example.com")).toBe("PRO");
  });

  it("leaves everyone else, and a caller that passes no email, on their own plan", () => {
    vi.stubEnv(PRO_COMP_EMAILS_ENV, "owner@example.com");
    expect(effectivePlan(free, "someone@example.com")).toBe("FREE");
    expect(effectivePlan(free)).toBe("FREE");
    vi.stubEnv(PRO_COMP_EMAILS_ENV, "");
    expect(effectivePlan(free, "owner@example.com")).toBe("FREE");
  });

  it("lets a comped account past the free allowance", () => {
    vi.stubEnv(PRO_COMP_EMAILS_ENV, "owner@example.com");
    const spent = { plan: "FREE", proEnvironment: null, packsGeneratedInPeriod: FREE_LIMIT, periodStartedAt: new Date() } as Creator;
    expect(canGenerate(spent)).toBe(false);
    expect(canGenerate(spent, "owner@example.com")).toBe(true);
  });
});
