/**
 * Which prices are ours.
 *
 * The Paddle account this app bills through **also sells another product** (Or
 * Zarua), and Paddle delivers every subscription notification on the account to
 * every configured webhook destination. So the webhook was being handed events
 * about subscriptions that have nothing to do with TriviaFoundry, and it read
 * their status and set `plan` from it — it never looked at what had been bought
 * (C2).
 *
 * Two things went wrong with that, not one:
 *
 * 1. A foreign subscription whose customData happened to name a creator could
 *    have granted Pro. That needed a forged signature, so it was not reachable
 *    in practice (see checkout-token.ts) — but nothing in the webhook was
 *    *relying* on the signature to keep foreign products out; it was luck.
 * 2. Every foreign event answered 500, because no creator could be found for
 *    it, so Paddle retried it for three days. The other product's ordinary
 *    business showed up as a wall of failing deliveries on our endpoint, which
 *    is exactly the signal a real problem would have used.
 *
 * The price ids come from the same configuration the checkout already uses, so
 * sandbox and production each recognise their own and there is no new secret to
 * set. `PADDLE_EXTRA_PRICE_IDS` is there for the case this will eventually
 * meet: a price that is retired from the checkout but still has subscribers on
 * it, who must keep their Pro.
 */

export const EXTRA_PRICE_IDS_ENV = "PADDLE_EXTRA_PRICE_IDS";

/**
 * The same prices with Paddle's 14-day trial on them (PRC7). Server-only: the
 * checkout route decides who is offered a trial and returns the price id, so
 * the browser never chooses one.
 */
export const TRIAL_PRICE_ENV = {
  month: "PADDLE_PRICE_MONTHLY_TRIAL",
  year: "PADDLE_PRICE_ANNUAL_TRIAL",
} as const;

/**
 * Read per call rather than memoised, for the same reason the ceilings are: it
 * is configuration the owner may change without a rebuild, and re-reading it
 * costs nothing next to a webhook's database work.
 */
export function ourPriceIds(): ReadonlySet<string> {
  const configured = [
    process.env.NEXT_PUBLIC_PADDLE_PRICE_MONTHLY,
    process.env.NEXT_PUBLIC_PADDLE_PRICE_ANNUAL,
    process.env[TRIAL_PRICE_ENV.month],
    process.env[TRIAL_PRICE_ENV.year],
    ...(process.env[EXTRA_PRICE_IDS_ENV] ?? "").split(","),
  ];
  return new Set(
    configured.map((id) => id?.trim()).filter((id): id is string => Boolean(id))
  );
}

/**
 * - `ours`: the event names at least one price we sell.
 * - `foreign`: the event names prices, and none of them is ours.
 * - `unknown`: the event names no prices we can read, or we have no price
 *   configuration to compare against.
 *
 * Only `foreign` is a positive finding, and only `foreign` is acted on. That
 * asymmetry is the whole design: an event we cannot classify must not be
 * dropped, because dropping a real `subscription.canceled` would leave somebody
 * on Pro after they stopped paying. An unreadable event keeps the behaviour it
 * has always had — matched by its stored binding, or answered 500 and retried.
 *
 * An empty price configuration returns `unknown` rather than making everything
 * foreign. A deploy that forgets NEXT_PUBLIC_PADDLE_PRICE_* must not silently
 * stop granting Pro to paying customers; the build already refuses to ship
 * without them (see the production build check), and this is the second lock.
 */
export type PriceOwnership = "ours" | "foreign" | "unknown";

export function priceOwnership(
  priceIds: readonly (string | null | undefined)[],
  ours: ReadonlySet<string> = ourPriceIds()
): PriceOwnership {
  if (ours.size === 0) return "unknown";
  const named = priceIds.map((id) => id?.trim()).filter((id): id is string => Boolean(id));
  if (named.length === 0) return "unknown";
  return named.some((id) => ours.has(id)) ? "ours" : "foreign";
}
