import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import {
  ANNUAL_MONTHS_FREE,
  FREE_PACK_ALLOWANCE,
  PRICE_ANNUAL_USD,
  PRICE_MONTHLY_USD,
  formatUsd,
} from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Pricing · TriviaFoundry",
  description:
    `What TriviaFoundry costs: a free tier, and Pro at ${formatUsd(PRICE_MONTHLY_USD)} a month `
    + `or ${formatUsd(PRICE_ANNUAL_USD)} a year.`,
};

/**
 * Content only, on purpose. There is no Paddle SDK here, no price ids and no
 * checkout button.
 *
 * Paddle's domain review requires pricing to be visible on the live site, and
 * Paddle does not let a domain open a checkout until that review has passed.
 * So the page that sells cannot exist before approval, and the page that
 * states what is sold has to. This is the second one. PR #4 replaces this
 * file with the real thing, wired to `NEXT_PUBLIC_PADDLE_PRICE_*`, once the
 * domain is approved and the live catalogue exists.
 *
 * Deliberately no disabled "Subscribe" button while we wait. A control that
 * looks like it takes money and does nothing is worse than no control, and
 * the build guard on PR #4's `next.config.ts` exists precisely to stop a
 * dead-button pricing page reaching production.
 *
 * Figures come from `src/lib/pricing.ts`, which /refunds also reads.
 */

const FREE_FEATURES = [
  `${FREE_PACK_ALLOWANCE} quiz packs every 30 days`,
  "Rounds, questions, answers and points, written for you",
  "A presenter script to read from",
  "Printable question and answer sheets",
  "The live game: teams join from their phones, scores update as you go",
];

export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Pricing</h1>
        <p className="mt-2 text-muted">
          Run a whole quiz night for nothing. Pay only if you run them often.
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <section className="rounded-2xl border border-line bg-background p-6" aria-labelledby="plan-free">
            <h2 id="plan-free" className="font-serif text-xl font-semibold tracking-tight">
              Free
            </h2>
            <p className="mt-3 text-3xl font-semibold">{formatUsd(0)}</p>
            <p className="mt-1 text-sm text-muted">A free account, no card</p>
            <ul className="mt-5 list-disc space-y-2 pl-5 text-muted">
              {FREE_FEATURES.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <Link
              href="/create"
              className="mt-6 inline-flex h-11 items-center rounded-xl bg-amber px-4 text-sm font-semibold text-white hover:bg-amber-hover"
            >
              Write a quiz
            </Link>
          </section>

          <section className="rounded-2xl border border-line bg-background p-6" aria-labelledby="plan-pro">
            <h2 id="plan-pro" className="font-serif text-xl font-semibold tracking-tight">
              Pro
            </h2>
            <p className="mt-3 text-3xl font-semibold">
              {formatUsd(PRICE_MONTHLY_USD)}
              <span className="text-base font-normal text-muted"> per month</span>
            </p>
            <p className="mt-1 text-sm text-muted">
              or {formatUsd(PRICE_ANNUAL_USD)} per year, {ANNUAL_MONTHS_FREE} months free
            </p>
            <ul className="mt-5 list-disc space-y-2 pl-5 text-muted">
              <li>
                <span className="font-medium text-foreground">
                  As many quiz packs as you want
                </span>{" "}
                — the {FREE_PACK_ALLOWANCE}-pack limit is lifted
              </li>
              <li>Everything in Free</li>
              <li>Cancel whenever you like; your packs stay yours</li>
            </ul>
          </section>
        </div>

        <p className="mt-8 text-muted">
          Pro subscriptions are sold by Paddle.com, which acts as the merchant of record and
          handles the payment, the invoice and any sales tax. TriviaFoundry is operated by Yanshuf
          Studio, Israel. How billing, cancellation and refunds work is set out in the{" "}
          <Link className="font-medium text-amber hover:underline" href="/refunds">
            refund policy
          </Link>
          , and the rest of the terms are on the{" "}
          <Link className="font-medium text-amber hover:underline" href="/terms">
            terms of service
          </Link>{" "}
          page.
        </p>
      </main>
    </>
  );
}
