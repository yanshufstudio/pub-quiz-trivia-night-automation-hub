import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { ContactLink, LegalList, LegalPage, LegalSection, LegalText } from "@/components/LegalPage";
import {
  FREE_PACK_ALLOWANCE,
  PRICE_ANNUAL_USD,
  PRICE_MONTHLY_USD,
  TRIAL_DAYS,
  formatUsd,
} from "@/lib/pricing";
import { countOf } from "@/lib/plural";

export const metadata: Metadata = pageMetadata({
  path: "/refunds",
  title: "Refund Policy · TriviaFoundry",
  description: "How refunds and cancellations work for TriviaFoundry Pro subscriptions.",
});

export default function RefundsPage() {
  return (
    <LegalPage title="Refund Policy">
      <LegalSection id="merchant-of-record" title="Who you are buying from">
        <LegalText>
          Pro subscriptions are sold by Paddle.com, which acts as the merchant of record for every
          purchase. Paddle handles the payment, the invoice, any sales tax, and the refund itself.
          TriviaFoundry is operated by Yanshuf Studio, Israel.
        </LegalText>
        <LegalText>
          Payments are handled by Paddle, our reseller and merchant of record. Your card statement
          will show PADDLE.NET* YANSHUFST, and receipts come from Paddle on behalf of Yanshuf Studio.
        </LegalText>
        <LegalText>
          Paddle runs buyer support for orders and invoices at{" "}
          <a
            className="font-medium text-amber hover:underline"
            href="https://www.paddle.net"
            target="_blank"
            rel="noreferrer"
          >
            paddle.net
          </a>
          , where you can look up a payment and ask about it directly.
        </LegalText>
      </LegalSection>

      <LegalSection id="policy" title="The policy">
        <LegalList>
          <li>
            <span className="font-medium text-foreground">Your first subscription payment</span> is
            refundable within 14 days of the charge, on request, no reason needed, provided you have
            generated no more than {countOf(FREE_PACK_ALLOWANCE, "pack")} in the current billing
            period — the same number the free plan allows. In other words, if Pro was not for you and
            you used it no more than you could have used the free plan, you get your money back.
          </li>
          <li>
            <span className="font-medium text-foreground">The free trial.</span> New subscribers
            get a {TRIAL_DAYS}-day free trial, card required. Nothing is charged during it:
            you&apos;re charged when the trial ends, unless you cancel before then, and that charge
            is your first subscription payment above. For its refund, the packs you generate during
            the trial count as generated in the current billing period.
          </li>
          <li>
            <span className="font-medium text-foreground">A renewal</span> is refundable within 14
            days of the charge, provided you have generated no packs in the current billing period.
            If a renewal caught you by surprise and you have not used the generator since, ask and
            you get it back.
          </li>
          <li>
            <span className="font-medium text-foreground">Refund abuse.</span> We do not refund,
            and may refuse further subscriptions from, an account that subscribes, uses Pro and
            asks for a refund repeatedly, or where there is evidence of fraud. Paddle&apos;s own{" "}
            <a
              className="font-medium text-amber hover:underline"
              href="https://www.paddle.com/legal/refund-policy"
              target="_blank"
              rel="noreferrer"
            >
              refund policy
            </a>{" "}
            says the same.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="your-rights" title="Your legal rights come first">
        <LegalText>
          Paddle sells the subscription to you under the{" "}
          <a
            className="font-medium text-amber hover:underline"
            href="https://www.paddle.com/legal/invoiced-consumer-terms"
            target="_blank"
            rel="noreferrer"
          >
            Paddle Buyer Terms
          </a>
          . Where those terms, Paddle&apos;s refund policy or the consumer law of your country give
          you a right to cancel or to a refund, that right applies in full, whatever this page says.
          That includes the 14-day cancellation rights some countries give consumers for digital
          services, among them the EU, the UK and Israel. Nothing on this page takes away a right
          the law gives you.
        </LegalText>
      </LegalSection>

      <LegalSection id="cancelling" title="Cancelling">
        <LegalText>
          You can cancel at any time from <span className="font-medium text-foreground">Manage
          subscription</span>, which opens the Paddle customer portal. Cancelling stops the next
          renewal; it is not a refund of the payment already made. Your Pro access continues until
          the end of the period you have already paid for, and your packs remain yours afterwards.
        </LegalText>
      </LegalSection>

      <LegalSection id="how-to-ask" title="How to ask for a refund">
        <LegalText>
          Either contact Paddle at{" "}
          <a
            className="font-medium text-amber hover:underline"
            href="https://www.paddle.net"
            target="_blank"
            rel="noreferrer"
          >
            paddle.net
          </a>{" "}
          or email us at{" "}
          <ContactLink />{" "}
          and we will arrange it with them. Either route works.
        </LegalText>
      </LegalSection>

      <LegalSection id="pricing" title="What a subscription costs">
        <LegalText>
          Pro is {formatUsd(PRICE_MONTHLY_USD)} per month or {formatUsd(PRICE_ANNUAL_USD)} per
          year, and removes the free tier&apos;s limit of {countOf(FREE_PACK_ALLOWANCE, "pack")} per 30
          days.
          The full breakdown is on our{" "}
          <Link className="font-medium text-amber hover:underline" href="/pricing">
            pricing
          </Link>{" "}
          page, and the rest of the terms are on our{" "}
          <Link className="font-medium text-amber hover:underline" href="/terms">
            terms of service
          </Link>{" "}
          page.
        </LegalText>
      </LegalSection>
    </LegalPage>
  );
}
