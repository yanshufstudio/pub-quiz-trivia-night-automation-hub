import { describe, expect, it } from "vitest";
import { canReadPack, visiblePacksWhere } from "@/lib/pack-access";

const ME = "creator-1";
const SOMEONE_ELSE = "creator-2";

describe("visiblePacksWhere", () => {
  it("shows a host the ownerless demo plus their own packs", () => {
    expect(visiblePacksWhere(ME)).toEqual({
      OR: [{ creatorId: null }, { creatorId: ME }],
    });
  });
});

describe("canReadPack", () => {
  it("lets a host read their own pack", () => {
    expect(canReadPack({ creatorId: ME }, ME)).toBe(true);
  });

  it("lets any signed-in host read the ownerless demo", () => {
    expect(canReadPack({ creatorId: null }, ME)).toBe(true);
    expect(canReadPack({ creatorId: null }, SOMEONE_ELSE)).toBe(true);
  });

  it("refuses somebody else's pack", () => {
    // The one that matters. Every read surface turns this into the same 404
    // a missing pack gets — see src/test/pack-read-access.integration.test.ts.
    expect(canReadPack({ creatorId: SOMEONE_ELSE }, ME)).toBe(false);
  });

  it("is not fooled by an empty creator id", () => {
    // A Creator id is a cuid and is never "", but a pack whose creatorId
    // somehow was would otherwise be readable by a host whose id was too.
    expect(canReadPack({ creatorId: "" }, ME)).toBe(false);
  });
});

describe("the list filter and the single-row check agree", () => {
  /**
   * They are two statements of one rule — a Prisma `where` for the list and
   * a predicate for one row — and a product where the list hides a pack the
   * editor still opens (or the reverse) is worse than either rule alone. So
   * this evaluates the filter by hand against every shape of pack there is.
   */
  function matchesFilter(pack: { creatorId: string | null }, creatorId: string): boolean {
    const where = visiblePacksWhere(creatorId);
    return (where.OR as { creatorId: string | null }[]).some((clause) => clause.creatorId === pack.creatorId);
  }

  const packs = [{ creatorId: null }, { creatorId: ME }, { creatorId: SOMEONE_ELSE }];

  for (const pack of packs) {
    it(`agrees for a pack owned by ${pack.creatorId ?? "nobody"}`, () => {
      expect(canReadPack(pack, ME)).toBe(matchesFilter(pack, ME));
    });
  }
});
