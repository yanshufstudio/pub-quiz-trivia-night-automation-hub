import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET as getPdf } from "@/app/api/packs/[id]/pdf/route";
import { createPackFromGenerated } from "@/lib/create-pack";
import { db } from "@/lib/db";

const BASE = "http://localhost:3000";

/**
 * The three print documents are laid out for a pack the size the wizard's
 * own default brief produces: four rounds of ten questions. At that size a
 * round is taller than an A4 page, which the old layout declared unbreakable
 * — react-pdf answered with "Node of type VIEW can't wrap between pages and
 * it's bigger than available page height" on every single render, and fell
 * back to breaking the round wherever it landed, mid-question included.
 *
 * The pack the other PDF tests use is the 2x5-question demo pack, which fits
 * on a page and so never exercised any of this.
 */
async function fullSizePack() {
  return createPackFromGenerated(
    {
      title: `PDF Layout Test Pack ${Math.random().toString(36).slice(2)}`,
      rounds: Array.from({ length: 4 }, (_, r) => ({
        title: `Round ${r + 1} Title`,
        category: "General Knowledge",
        questions: Array.from({ length: 10 }, (_, q) => ({
          // Roughly the length a generated question runs to; short strings
          // would understate how tall a real round is.
          text: `Which long-running quiz question, number ${q + 1} of round ${r + 1}, asks something with enough words in it to wrap onto a second line?`,
          answer: `The answer to round ${r + 1} question ${q + 1}`,
          points: 1,
          type: "TEXT" as const,
        })),
      })),
    },
    "pdf layout test",
    null
  );
}

describe("print documents at the size the default brief generates", () => {
  let packId: string;
  let warnings: string[];

  beforeAll(async () => {
    packId = (await fullSizePack()).id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  beforeEach(() => {
    warnings = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["questions", "answers", "script"] as const)(
    "lays out type=%s without a block too tall for its page",
    async (type) => {
      const res = await getPdf(new NextRequest(`${BASE}/api/packs/${packId}/pdf?type=${type}`), {
        params: Promise.resolve({ id: packId }),
      });
      expect(res.status).toBe(200);

      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");

      // 40 questions cannot fit on one page, so a correct layout must have
      // produced several — and none of them by overflowing.
      const pageCount = [...new TextDecoder("latin1").decode(bytes).matchAll(/\/Type\s*\/Page[^s]/g)].length;
      expect(pageCount).toBeGreaterThan(1);

      expect(warnings.filter((w) => /bigger than available page height/i.test(w))).toEqual([]);
    }
  );
});
