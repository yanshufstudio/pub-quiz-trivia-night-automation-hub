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

/**
 * $10 a month, the owner's decision of 2026-09-28, replacing $5. The live
 * Paddle monthly price is created at 1000 cents to match. Subscribers on the
 * old $5/$45 prices keep Pro through PADDLE_EXTRA_PRICE_IDS.
 */
export const PRICE_MONTHLY_USD = 10;
/**
 * $90 a year: three months free against twelve monthly payments. The owner's
 * decision of 2026-09-28, replacing $45. The live Paddle annual price is
 * created at 9000 cents to match; if the two ever differ, the site advertises
 * one price and Paddle charges another.
 */
export const PRICE_ANNUAL_USD = 90;

/**
 * How many months of the monthly plan the annual price saves, as /pricing
 * states it ("3 months free" at $10 and $90).
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

/**
 * There is deliberately no PRO_DAILY_PACK_ALLOWANCE here any more (M12, Paul,
 * 27 Sep).
 *
 * It existed so /pricing and /terms could print the per-subscriber daily cap,
 * and a test tied it to DEFAULT_PRO_USER_DAILY_LIMIT so the copy could not drift
 * from the enforcement. That solved the drift and created a worse problem: a
 * number on a public page is a promise, so changing the cap became a pricing
 * change, and lowering it during an incident would make the page false until
 * somebody edited it.
 *
 * So the pages describe the shape — a daily fair-use limit per account and a
 * service-wide daily safety limit — and the *product* states the number at the
 * only moment it matters, when somebody reaches it (proDailyLimitMessage in
 * src/lib/pro-limits.ts, which reads the live limit). Nothing about the
 * enforcement changed: PRO_USER_DAILY_PACK_LIMIT still defaults to 10, the 429
 * still names the figure and its reset, the kill switch still answers 503, and
 * the shared ceiling is still PRO_DAILY_PACK_CEILING.
 *
 * `noPublishedProDailyNumber` in src/lib/pricing.test.ts walks the two pages and
 * fails if either puts a digit next to a daily Pro allowance, so this cannot be
 * quietly undone by adding the number back to a page.
 *
 * FREE_PACK_ALLOWANCE above stays: "2 packs every 30 days" is the offer itself
 * rather than a fair-use guard, a visitor cannot choose the free tier without
 * knowing it, and it does not move during an incident.
 */
