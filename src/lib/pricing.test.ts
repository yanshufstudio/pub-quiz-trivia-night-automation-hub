import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_FREE_LIMIT } from "@/lib/creator";
import { DEFAULT_PRO_USER_DAILY_LIMIT, proDailyLimitMessage } from "@/lib/pro-limits";
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
      // "/" on every OS: callers match "pricing/page.tsx", and on Windows
      // path.relative returns backslashes.
      out.push([path.relative(APP_DIR, full).split(path.sep).join("/"), readFileSync(full, "utf8")]);
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
    // Pinned, not derived: $10 a month and $90 a year are the owner's decision
    // (2026-09-28), and the live Paddle prices are created at 1000 and 9000
    // cents to match.
    expect(PRICE_MONTHLY_USD).toBe(10);
    expect(PRICE_ANNUAL_USD).toBe(90);
  });

  it("states the annual saving the two prices actually give", () => {
    // /pricing once said "two months free" beside $5 and $25, which was
    // seven. The figure is derived; this pins what it derives to, and that the
    // division is exact, so the page never prints a floored approximation.
    expect(PRICE_MONTHLY_USD * 12 - PRICE_ANNUAL_USD).toBe(PRICE_MONTHLY_USD * ANNUAL_MONTHS_FREE);
    expect(ANNUAL_MONTHS_FREE).toBe(3);
  });

  it("states the free allowance production actually enforces", () => {
    // FREE_PACK_ALLOWANCE is what the marketing pages print; DEFAULT_FREE_LIMIT
    // is what canGenerate() enforces when FREE_PACK_LIMIT is unset, which is
    // how production runs. If someone changes the ceiling and not the copy,
    // the site advertises an allowance it does not give.
    expect(FREE_PACK_ALLOWANCE).toBe(DEFAULT_FREE_LIMIT);
  });

  it("formats whole dollars without stray decimals", () => {
    expect(formatUsd(PRICE_MONTHLY_USD)).toBe("$10");
    expect(formatUsd(PRICE_ANNUAL_USD)).toBe("$90");
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

/**
 * No public page states a Pro daily number (M12, Paul, 27 Sep).
 *
 * The pages used to print the per-subscriber cap, tied by a test to
 * DEFAULT_PRO_USER_DAILY_LIMIT so copy and enforcement could not drift. That
 * fixed the drift and made the number a published promise: changing the cap
 * became a pricing change, and lowering it during an incident would leave the
 * page false until somebody edited it. The enforcement is unchanged — the wizard
 * names the live figure and its reset at the moment somebody reaches it.
 *
 * This walks the sources rather than the rendered pages, which is the cheap half
 * of the guard: it catches a hard-coded number and a re-imported constant.
 * e2e/legal-pages.spec.ts checks the rendered text, which is the half that
 * catches a number arriving through an expression.
 */
describe("no public page publishes a Pro daily number", () => {
  const PUBLIC_PAGES = ["pricing/page.tsx", "terms/page.tsx"];

  /** "10 packs a day", "up to 10", "10 AI-generated packs", "10/day". */
  const NUMBER_NEAR_DAILY =
    /(\b\d+\b[^.\n]{0,40}\bpacks?\s+(a|per)\s+day\b)|(\bup\s+to\s+\d+\b)|(\b\d+\s*\/\s*day\b)/i;

  it("does not hard-code one on /pricing or /terms", () => {
    for (const page of PUBLIC_PAGES) {
      const [, source] = appSources().find(([rel]) => rel === page)!;
      const match = source.match(NUMBER_NEAR_DAILY);
      expect(match?.[0], `${page} states a Pro daily number: ${match?.[0]}`).toBeUndefined();
    }
  });

  it("does not reach for a constant that would print one", () => {
    // The constant is gone from src/lib/pricing.ts on purpose. This fails if a
    // page reintroduces one, which a digit search could not see.
    //
    // Pages only. The generate route names PRO_USER_DAILY_PACK_LIMIT in a comment
    // about the kill switch and pro-limits.ts defines it — those are the
    // enforcement, which is supposed to know the number. What must not know it is
    // anything that renders copy for a visitor.
    for (const [rel, source] of appSources()) {
      if (!/(^|\/)page\.tsx$/.test(rel)) continue;
      expect(source, rel).not.toMatch(/PRO_DAILY_PACK_ALLOWANCE|PRO_USER_DAILY_PACK_LIMIT/);
      // PRC5's 30-day fair-use cap is unpublished on the same terms.
      expect(source, rel).not.toMatch(
        /PRO_USER_PERIOD_PACK_LIMIT|PRO_TRIAL_PACK_LIMIT|DEFAULT_PRO_PERIOD_LIMIT|DEFAULT_PRO_TRIAL_LIMIT|proFairUseLimit\b/
      );
    }
  });

  it("says Pro is subject to fair use over 30 days, and that the wizard says when it resets (PRC6)", () => {
    for (const page of [...PUBLIC_PAGES, "faq/page.tsx"]) {
      const [, source] = appSources().find(([rel]) => rel === page)!;
      expect(source, page).toMatch(/fair use/);
      expect(source, page).toMatch(/rolling 30 days/);
      expect(source, page).toMatch(/the wizard tells you when it resets/);
    }
  });

  it("does not let the Pro card read as if Pro had no cap (PRC6)", () => {
    const [, source] = appSources().find(([rel]) => rel === "pricing/page.tsx")!;
    expect(source).toMatch(/fair-use allowance/);
  });

  it("still describes the shape of the limits, so the pages are not merely silent", () => {
    // Removing the number must not turn into saying nothing: somebody deciding
    // whether to pay is entitled to know that a fair-use limit exists.
    for (const page of PUBLIC_PAGES) {
      const [, source] = appSources().find(([rel]) => rel === page)!;
      expect(source, page).toMatch(/fair-use limit/);
      expect(source, page).toMatch(/safety limit/);
    }
  });

  it("leaves the enforcement's own message free to name the number", () => {
    // The cap still exists and the wizard still states it. This is the line that
    // says the two halves are deliberate rather than an oversight.
    expect(DEFAULT_PRO_USER_DAILY_LIMIT).toBeGreaterThan(0);
    expect(proDailyLimitMessage(DEFAULT_PRO_USER_DAILY_LIMIT)).toContain(
      String(DEFAULT_PRO_USER_DAILY_LIMIT)
    );
  });
});
