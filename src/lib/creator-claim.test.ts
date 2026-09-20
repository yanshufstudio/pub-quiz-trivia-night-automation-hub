import { describe, expect, it } from "vitest";
import type { Creator } from "@prisma/client";
import { mergeAllowance } from "@/lib/creator-claim";

const DAY = 24 * 60 * 60 * 1000;

function creator(overrides: Partial<Creator> = {}): Creator {
  return {
    id: "creator_1",
    deviceKey: "device_1",
    plan: "FREE",
    packsGeneratedInPeriod: 0,
    periodStartedAt: new Date(),
    createdAt: new Date(),
    userId: null,
    ...overrides,
  };
}

/**
 * The merge rule is the one place claiming could become an exploit: sign in
 * with a fresh account, hand over a spent cookie, and walk away with an
 * allowance you had already used. So the rule is "take the higher count",
 * and these are what hold it there.
 */
describe("mergeAllowance", () => {
  it("takes the claimed creator's higher count, so claiming cannot refund an allowance", () => {
    const own = creator({ packsGeneratedInPeriod: 0 });
    const claimed = creator({ id: "creator_2", packsGeneratedInPeriod: 2 });
    expect(mergeAllowance(own, claimed).packsGeneratedInPeriod).toBe(2);
  });

  it("keeps the account's own higher count, so claiming a fresh cookie cannot refund one either", () => {
    const own = creator({ packsGeneratedInPeriod: 2 });
    const claimed = creator({ id: "creator_2", packsGeneratedInPeriod: 0 });
    expect(mergeAllowance(own, claimed).packsGeneratedInPeriod).toBe(2);
  });

  it("adopts the claimed period only when its count is the one that binds", () => {
    const mineStarted = new Date(Date.now() - 20 * DAY);
    const theirsStarted = new Date(Date.now() - 2 * DAY);

    const higherElsewhere = mergeAllowance(
      creator({ packsGeneratedInPeriod: 0, periodStartedAt: mineStarted }),
      creator({ id: "c2", packsGeneratedInPeriod: 2, periodStartedAt: theirsStarted })
    );
    expect(higherElsewhere.periodStartedAt).toEqual(theirsStarted);
  });

  it("keeps the account's own period on a tie, so a claim cannot lengthen the wait", () => {
    const mineStarted = new Date(Date.now() - 25 * DAY);
    const theirsStarted = new Date(Date.now() - 1 * DAY);

    const tied = mergeAllowance(
      creator({ packsGeneratedInPeriod: 2, periodStartedAt: mineStarted }),
      creator({ id: "c2", packsGeneratedInPeriod: 2, periodStartedAt: theirsStarted })
    );
    expect(tied.packsGeneratedInPeriod).toBe(2);
    expect(tied.periodStartedAt).toEqual(mineStarted);
  });

  it("does not carry across a count whose 30-day period has already lapsed", () => {
    // Both rows would have rolled to 0 on their own next read, so a merge
    // must not resurrect the spent count from either of them.
    const lapsed = new Date(Date.now() - 31 * DAY);
    const merged = mergeAllowance(
      creator({ packsGeneratedInPeriod: 0 }),
      creator({ id: "c2", packsGeneratedInPeriod: 2, periodStartedAt: lapsed })
    );
    expect(merged.packsGeneratedInPeriod).toBe(0);
  });

  it("keeps PRO from either side — a paid plan is not lost to signing in", () => {
    expect(
      mergeAllowance(creator({ plan: "FREE" }), creator({ id: "c2", plan: "PRO" })).plan
    ).toBe("PRO");
    expect(
      mergeAllowance(creator({ plan: "PRO" }), creator({ id: "c2", plan: "FREE" })).plan
    ).toBe("PRO");
    expect(
      mergeAllowance(creator({ plan: "FREE" }), creator({ id: "c2", plan: "FREE" })).plan
    ).toBe("FREE");
  });

  it("never returns a count below either input's effective count", () => {
    for (const mine of [0, 1, 2, 5]) {
      for (const theirs of [0, 1, 2, 5]) {
        const merged = mergeAllowance(
          creator({ packsGeneratedInPeriod: mine }),
          creator({ id: "c2", packsGeneratedInPeriod: theirs })
        );
        expect(merged.packsGeneratedInPeriod).toBeGreaterThanOrEqual(Math.max(mine, theirs));
      }
    }
  });
});
