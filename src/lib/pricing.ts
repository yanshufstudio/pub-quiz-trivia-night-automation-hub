/**
 * What TriviaFoundry charges, in one place.
 *
 * These figures appear on /pricing and in the "What a subscription costs"
 * clause of /refunds, and PR #4's `PricingCards.tsx` currently carries a
 * third copy as bare `"$5"` and `"$25"` string literals with nothing tying
 * them to the Paddle price objects they sit beside. That is the failure that
 * matters here: if the live Paddle catalogue is created at a different
 * amount, a page can advertise one price while Paddle charges another, and
 * every test still passes. When PR #4 lands, point its cards at these
 * constants too.
 *
 * Amounts are USD and are the amounts Paddle is configured to charge. They
 * are written as whole dollars because that is what the catalogue holds; if
 * a price ever gains cents, change the rendering here rather than at each
 * call site.
 */

export const PRICE_MONTHLY_USD = 5;
/**
 * $45 a year: three months free against twelve monthly payments. The owner's
 * decision of 2026-09-21 (planning decision 27), replacing the $25 the
 * 2026-09-09 spec launched with. The live Paddle annual price is created at
 * 4500 cents to match; if the two ever differ, the site advertises one price
 * and Paddle charges another.
 */
export const PRICE_ANNUAL_USD = 45;

/**
 * How many months of the monthly plan the annual price saves, as /pricing
 * states it ("3 months free" at $5 and $45).
 *
 * Worked out rather than written, because the written version was wrong: the
 * page once said "two months free", carried over from PR #4's cards, when
 * the $25 a year it then advertised against $60 of monthly payments was
 * seven. Rounded down so that a price change which stops dividing evenly
 * understates the saving instead of overstating it; `pricing.test.ts`
 * asserts it divides evenly today.
 */
export const ANNUAL_MONTHS_FREE = Math.floor(12 - PRICE_ANNUAL_USD / PRICE_MONTHLY_USD);

/** `$5`, `$45` — one renderer so the pages cannot format differently. */
export function formatUsd(amount: number): string {
  return `$${amount}`;
}

/**
 * The free tier's ceiling as the marketing pages state it: packs per rolling
 * 30 days.
 *
 * This is deliberately a plain number rather than an import of `FREE_LIMIT`
 * from `src/lib/creator.ts`. That module imports the Prisma client at the top
 * level, and pulling a database client into a static marketing page to read
 * one integer is a poor trade. `pricing.test.ts` asserts this matches
 * `DEFAULT_FREE_LIMIT`, which is the value production runs.
 *
 * Note the coupling this leaves: a deploy that sets `FREE_PACK_LIMIT` to
 * something other than the default gets copy that understates or overstates
 * its own allowance. That is intended for preview deploys, where nobody is
 * reading the pricing page, and must not be done in production without
 * changing this line.
 */
export const FREE_PACK_ALLOWANCE = 2;
