import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { ContactLink } from "@/components/LegalPage";
import { ProCheckout } from "./ProCheckout";
import {
  ANNUAL_MONTHS_FREE,
  FREE_PACK_ALLOWANCE,
  PRICE_ANNUAL_USD,
  PRICE_MONTHLY_USD,
  TRIAL_DAYS,
  formatUsd,
} from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Pricing · TriviaFoundry",
  description:
    `What TriviaFoundry costs: a free tier, and Pro at ${formatUsd(PRICE_MONTHLY_USD)} a month `
    + `or ${formatUsd(PRICE_ANNUAL_USD)} a year.`,
};

/**
 * Static on purpose, with one client island. Everything here but the Pro
 * card's buttons is the same for every visitor, and it is what Paddle's
 * reviewer and search crawlers read, so it stays prerendered rather than
 * reading a session on the server. `ProCheckout` decides in the browser
 * whether to offer Sign in, Subscribe, or Manage subscription.
 *
 * Paddle approved triviafoundry.com on 2026-09-18, so this page can now sell.
 * It never shows a button that does nothing: a production build fails
 * without the NEXT_PUBLIC_PADDLE_* values (next.config.ts), and anywhere
 * else without them the card says checkout is not switched on.
 *
 * Figures come from `src/lib/pricing.ts`, which /terms and /refunds also read.
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
            <p className="mt-3 text-sm text-muted">
              New subscribers get a {TRIAL_DAYS}-day free trial, card required. You&apos;re
              charged when the trial ends, unless you cancel before then.
            </p>
            <ul className="mt-5 list-disc space-y-2 pl-5 text-muted">
              <li>
                <span className="font-medium text-foreground">
                  Pro lifts the {FREE_PACK_ALLOWANCE}-pack limit
                </span>{" "}
                — to a fair-use allowance, with room for several quizzes a week
              </li>
              <li>Everything in Free</li>
              <li>Cancel whenever you like; your packs stay yours</li>
            </ul>
            <ProCheckout />
          </section>
        </div>

        <p className="mt-5 text-muted">
          Running quizzes for a venue, or several nights a week? <ContactLink>Get in touch</ContactLink> —
          we&apos;re shaping a plan for you.
        </p>

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

        {/* M11: what the card statement will actually say. A descriptor nobody
            recognises is the most common reason a legitimate charge is disputed,
            and a dispute costs more than the subscription. */}
        <p className="mt-4 text-muted">
          Payments are handled by Paddle, our reseller and merchant of record. Your card statement
          will show PADDLE.NET* YANSHUFST, and receipts come from Paddle on behalf of Yanshuf Studio.
        </p>

        {/* M12, in three goes. The original promised "no cap" and called the
            shared limit "well above normal use", which described neither the
            per-subscriber cap (H2) nor anything anyone could plan around. The
            second version printed the figure, which made a daily number a
            published promise — so raising or lowering the cap became a pricing
            change, and a deploy that moved the cap's environment variable
            without editing this page would make the page false. This version
            names the limits and where to read them, and no number at all. The
            enforcement is unchanged: the wizard shows the real figure and its
            reset at the moment somebody meets it (proDailyLimitMessage in
            src/lib/pro-limits.ts).

            The test that keeps this true walks page sources for a number next to
            a daily allowance and for the cap's own identifiers, so naming the
            variable here — even in a comment — would fail it. That is the right
            trade: a test that could tell a comment from code would be a test
            with an exemption in it.

            This note no longer opens by repeating the Pro card's headline. It did
            for one commit, which left the card's only benefit bullet pointing at
            this paragraph ("see the fair-use note below") and the same sentence
            printed twice on one page — a visitor reading the Pro card was sent
            somewhere else for the substance. The bullet says what Pro is for; this
            says what bounds it.

            PRC6: the 30-day fair-use limit is described the same way, with no
            number; its refusal names only the reset date. */}
        <p className="mt-4 text-sm text-muted">
          To keep the service fair and running for everyone, Pro is subject to fair use: there is a
          daily fair-use limit on each account, a fair-use limit on each account over rolling 30 days
          (lower during the free trial), and a daily safety limit across the whole service. If you reach one,{" "}
          the wizard tells you when it resets (the daily ones at 00:00 UTC).
        </p>
      </main>
    </>
  );
}
