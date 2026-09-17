import type { Metadata } from "next";
import Link from "next/link";
import { ContactLink, LegalList, LegalPage, LegalSection, LegalText } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Refund Policy · TriviaFoundry",
  description: "How refunds and cancellations work for TriviaFoundry Pro subscriptions.",
};

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
            fully refundable for 14 days, on request, no reason needed.
          </li>
          <li>
            <span className="font-medium text-foreground">A renewal</span> is refundable within 14
            days of the charge, provided you have not generated any packs in that period. If a
            renewal caught you by surprise and you have not used the generator since, ask and you
            get it back.
          </li>
        </LegalList>
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
          Pro is $5 per month or $25 per year, and removes the free tier&apos;s limit of two packs
          per 30 days. The rest of the terms are on our{" "}
          <Link className="font-medium text-amber hover:underline" href="/terms">
            terms of service
          </Link>{" "}
          page.
        </LegalText>
      </LegalSection>
    </LegalPage>
  );
}
