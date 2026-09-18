import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_FREE_LIMIT } from "@/lib/creator";
import {
  ANNUAL_MONTHS_FREE,
  FREE_PACK_ALLOWANCE,
  PRICE_ANNUAL_USD,
  PRICE_MONTHLY_USD,
  formatUsd,
} from "@/lib/pricing";

const APP_DIR = path.resolve(__dirname, "../app");

/** Every .ts/.tsx source file under src/app, as [repo-relative path, contents]. */
function appSources(dir = APP_DIR): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...appSources(full));
    else if (/\.tsx?$/.test(item.name) && !item.name.endsWith(".test.ts")) {
      out.push([path.relative(APP_DIR, full), readFileSync(full, "utf8")]);
    }
  }
  return out;
}

describe("pricing constants", () => {
  it("prices the annual plan below twelve months of the monthly one", () => {
    // The page advertises months free on the annual plan, so the annual price
    // has to actually be a discount. A copy-paste that made them equal would
    // otherwise ship.
    expect(PRICE_ANNUAL_USD).toBeLessThan(PRICE_MONTHLY_USD * 12);
    expect(PRICE_ANNUAL_USD).toBe(PRICE_MONTHLY_USD * 5);
  });

  it("states the annual saving the two prices actually give", () => {
    // /pricing once said "two months free" beside $5 and $25, which is seven.
    // The figure is now derived; this pins what it derives to, and that the
    // division is exact, so the page never prints a floored approximation.
    expect(PRICE_MONTHLY_USD * 12 - PRICE_ANNUAL_USD).toBe(PRICE_MONTHLY_USD * ANNUAL_MONTHS_FREE);
    expect(ANNUAL_MONTHS_FREE).toBe(7);
  });

  it("states the free allowance production actually enforces", () => {
    // FREE_PACK_ALLOWANCE is what the marketing pages print; DEFAULT_FREE_LIMIT
    // is what canGenerate() enforces when FREE_PACK_LIMIT is unset, which is
    // how production runs. If someone changes the ceiling and not the copy,
    // the site advertises an allowance it does not give.
    expect(FREE_PACK_ALLOWANCE).toBe(DEFAULT_FREE_LIMIT);
  });

  it("formats whole dollars without stray decimals", () => {
    expect(formatUsd(PRICE_MONTHLY_USD)).toBe("$5");
    expect(formatUsd(PRICE_ANNUAL_USD)).toBe("$25");
    expect(formatUsd(0)).toBe("$0");
  });
});

describe("no page keeps its own copy of a price", () => {
  // This is the failure this module exists to prevent, and the one PR #4
  // still carries: `PricingCards.tsx` hard-codes "$5" and "$25" with nothing
  // tying them to the Paddle price objects beside them, so a live catalogue
  // created at a different amount would advertise one price and charge
  // another with every test still green. Point that file at these constants
  // when it lands.
  it("writes no bare dollar amount anywhere under src/app", () => {
    const offenders = appSources()
      .filter(([, text]) => /\$\d/.test(text))
      .map(([file]) => file);
    expect(offenders, "import from @/lib/pricing and render with formatUsd").toEqual([]);
  });
});
