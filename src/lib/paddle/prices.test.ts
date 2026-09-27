import { afterEach, describe, expect, it, vi } from "vitest";
import { EXTRA_PRICE_IDS_ENV, ourPriceIds, priceOwnership } from "@/lib/paddle/prices";

/**
 * Telling our own subscriptions from the other product's on the same Paddle
 * account (C2).
 *
 * The asymmetry is the design and most of what is worth testing: only a positive
 * "these prices are not ours" drops an event. Anything unclassifiable keeps the
 * handling it had, because dropping a real subscription.canceled would leave
 * somebody on Pro after they stopped paying.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

function configure(monthly?: string, annual?: string, extra?: string) {
  vi.stubEnv("NEXT_PUBLIC_PADDLE_PRICE_MONTHLY", monthly ?? "");
  vi.stubEnv("NEXT_PUBLIC_PADDLE_PRICE_ANNUAL", annual ?? "");
  vi.stubEnv(EXTRA_PRICE_IDS_ENV, extra ?? "");
}

describe("ourPriceIds", () => {
  it("is the same configuration the checkout already uses", () => {
    // No new secret to set, and sandbox and production each recognise their own.
    configure("pri_monthly", "pri_annual");
    expect([...ourPriceIds()].sort()).toEqual(["pri_annual", "pri_monthly"]);
  });

  it("takes a retired price from PADDLE_EXTRA_PRICE_IDS, trimmed", () => {
    // The case this will meet: a price pulled from the checkout that still has
    // subscribers on it, who must keep their Pro.
    configure("pri_monthly", "pri_annual", " pri_old_2025 , pri_grandfathered ");
    expect(ourPriceIds().has("pri_old_2025")).toBe(true);
    expect(ourPriceIds().has("pri_grandfathered")).toBe(true);
  });

  it("is empty when nothing is configured, rather than containing blanks", () => {
    configure();
    expect(ourPriceIds().size).toBe(0);
  });
});

describe("priceOwnership", () => {
  const OURS = new Set(["pri_monthly", "pri_annual"]);

  it("recognises our own price", () => {
    expect(priceOwnership(["pri_monthly"], OURS)).toBe("ours");
    expect(priceOwnership(["pri_annual"], OURS)).toBe("ours");
  });

  it("recognises another product's price", () => {
    // The Or Zarua case: a real subscription on the same Paddle account, whose
    // events Paddle delivers here too.
    expect(priceOwnership(["pri_or_zarua_monthly"], OURS)).toBe("foreign");
  });

  it("calls a mixed bundle ours, because one of the lines is", () => {
    // A subscription carrying one of our prices is ours to act on even if
    // something else rides alongside it.
    expect(priceOwnership(["pri_or_zarua_monthly", "pri_annual"], OURS)).toBe("ours");
  });

  it("says unknown when the event names no price", () => {
    // Not "foreign". This is the branch that keeps a cancellation working when
    // its payload carries no items.
    expect(priceOwnership([], OURS)).toBe("unknown");
    expect(priceOwnership([null, undefined, "", "   "], OURS)).toBe("unknown");
  });

  it("says unknown when we have no configuration to compare against", () => {
    // A deploy that forgets NEXT_PUBLIC_PADDLE_PRICE_* must not silently stop
    // granting Pro to paying customers. Everything foreign would do exactly
    // that.
    expect(priceOwnership(["pri_monthly"], new Set())).toBe("unknown");
    expect(priceOwnership(["anything_at_all"], new Set())).toBe("unknown");
  });

  it("ignores surrounding whitespace on both sides of the comparison", () => {
    expect(priceOwnership([" pri_monthly "], OURS)).toBe("ours");
  });

  it("reads the environment when no set is passed", () => {
    configure("pri_env_monthly", "pri_env_annual");
    expect(priceOwnership(["pri_env_annual"])).toBe("ours");
    expect(priceOwnership(["pri_somebody_else"])).toBe("foreign");
  });
});
