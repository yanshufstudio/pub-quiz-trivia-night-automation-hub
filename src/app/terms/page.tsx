import type { Metadata } from "next";
import Link from "next/link";
import { ContactLink, LegalList, LegalPage, LegalSection, LegalText } from "@/components/LegalPage";
import { FREE_PACK_ALLOWANCE, PRICE_ANNUAL_USD, PRICE_MONTHLY_USD, formatUsd } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Terms of Service · TriviaFoundry",
  description: "The terms you agree to when you use TriviaFoundry.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <LegalSection id="who-we-are" title="Who we are">
        <LegalText>
          TriviaFoundry is operated by Yanshuf Studio, Israel. You can reach us at{" "}
          <ContactLink />
          . Using the service means you accept these terms.
        </LegalText>
      </LegalSection>

      <LegalSection id="the-service" title="What the service does">
        <LegalText>
          TriviaFoundry generates pub quiz and trivia night packs with AI, turns them into printable PDFs, and runs a
          live portal where teams submit their answers from their own phones.
        </LegalText>
        <LegalList>
          <li>Free accounts can generate {FREE_PACK_ALLOWANCE} packs every 30 days.</li>
          <li>
            Pro costs {formatUsd(PRICE_MONTHLY_USD)} per month or {formatUsd(PRICE_ANNUAL_USD)} per
            year and removes that cap.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="your-account" title="Your account">
        <LegalText>
          Running a quiz needs an account. You sign in with Google or with a code we email you —
          there is no password, so there is none for you to lose and none for us to store. The free
          allowance and any Pro subscription belong to the account, not to the browser you are using,
          so signing in on a new device brings both with you.
        </LegalText>
        <LegalText>
          Keep your email account secure: anyone who can read your email can request a sign-in code
          and get into your account. Tell us at <ContactLink /> if you think someone else has.
        </LegalText>
        <LegalText>
          <span className="font-medium text-foreground">Teams do not need an account.</span> People
          playing a quiz you are running join with the code you give them and are never asked to sign
          up.
        </LegalText>
        <LegalText>
          You must give an email address you actually control, and one account is for one person. We
          may suspend or close an account used to get around the free allowance, or used in the ways
          set out under Acceptable use. We may also refuse a new subscription from, or suspend, an
          account that repeatedly subscribes, uses Pro and asks for a refund.
        </LegalText>
      </LegalSection>

      <LegalSection id="eligibility" title="Eligibility">
        <LegalText>
          You must be 18 or over to buy a Pro subscription. There is no age requirement for running
          a quiz with a free account.
        </LegalText>
      </LegalSection>

      <LegalSection id="your-content" title="Your prompts and your packs">
        <LegalText>
          The briefs you write and the packs generated from them are yours. We claim no ownership of
          them and do not sell them. You are free to print them, edit them, export them and use them
          at your events, commercially or otherwise.
        </LegalText>
      </LegalSection>

      <LegalSection id="ai-output" title="Accuracy of generated questions">
        <LegalText>
          Questions and answers are produced by an AI model and are provided as they come. We do not
          warrant that any of it is accurate, current or suitable for your night, and a generated
          answer can simply be wrong. Read a pack before you run it — checking the questions is part
          of hosting, not an optional extra.
        </LegalText>
      </LegalSection>

      <LegalSection id="acceptable-use" title="Acceptable use">
        <LegalText>
          Do not use the service to generate or publish abusive or unlawful content, and do not use
          it to attack the service itself or the people using it. We may suspend access that is
          being used this way.
        </LegalText>
      </LegalSection>

      <LegalSection id="payments" title="Payments">
        <LegalText>
          Subscriptions are sold by Paddle.com, which acts as the merchant of record and handles
          payment, invoicing and sales tax, and your purchase is also governed by the{" "}
          <a
            className="font-medium text-amber hover:underline"
            href="https://www.paddle.com/legal/invoiced-consumer-terms"
            target="_blank"
            rel="noreferrer"
          >
            Paddle Buyer Terms
          </a>
          . Cancellation and refunds, including when a first payment is refundable and your
          statutory rights, are covered on our{" "}
          <Link className="font-medium text-amber hover:underline" href="/refunds">
            refund policy
          </Link>{" "}
          page.
        </LegalText>
      </LegalSection>

      <LegalSection id="privacy" title="Privacy">
        <LegalText>
          What we store and who processes it is set out in the{" "}
          <Link className="font-medium text-amber hover:underline" href="/privacy">
            privacy policy
          </Link>
          .
        </LegalText>
      </LegalSection>

      <LegalSection id="governing-law" title="Governing law">
        <LegalText>These terms are governed by the laws of Israel.</LegalText>
      </LegalSection>

      <LegalSection id="changes" title="Changes to these terms">
        <LegalText>
          If we change these terms, the date at the top of this page changes with them. Continuing
          to use the service after that means the new version applies. Questions go to{" "}
          <ContactLink />
          .
        </LegalText>
      </LegalSection>
    </LegalPage>
  );
}
