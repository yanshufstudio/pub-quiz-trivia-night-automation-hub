import type { Metadata } from "next";
import Link from "next/link";
import { LegalList, LegalPage, LegalSection, LegalText } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy · TriviaFoundry",
  description: "What TriviaFoundry stores, who processes it, and how to have it deleted.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <LegalSection id="who-we-are" title="Who we are">
        <LegalText>
          TriviaFoundry is operated by Yanshuf Studio, Israel. For anything about your data, write to{" "}
          <a className="font-medium text-amber hover:underline" href="mailto:privlin@gmail.com">
            privlin@gmail.com
          </a>
          .
        </LegalText>
      </LegalSection>

      <LegalSection id="what-we-store" title="What we store">
        <LegalList>
          <li>
            <span className="font-medium text-foreground">A device cookie</span> (<code>pq_creator</code>)
            — how we recognise the packs you created and count your free allowance. It identifies a
            browser, not a person, and it is set whether or not you ever buy anything.
          </li>
          <li>
            <span className="font-medium text-foreground">An email address, only if you buy Pro</span> —
            we receive it from Paddle when a subscription starts, and use it to restore your access
            if you lose your cookie or move to another device. Free accounts never give us one.
          </li>
          <li>
            <span className="font-medium text-foreground">The quiz content you generate</span> — your
            briefs and the rounds, questions and answers produced from them.
          </li>
          <li>
            <span className="font-medium text-foreground">Live session entries</span> — the team names
            and answers people type during a quiz you are running.
          </li>
          <li>
            <span className="font-medium text-foreground">Images you upload</span> to a question.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="processors" title="Who else processes it">
        <LegalList>
          <li>
            <span className="font-medium text-foreground">Paddle</span> — sells the subscriptions and
            handles payment and invoicing. Card details go to Paddle, never to us.
          </li>
          <li>
            <span className="font-medium text-foreground">Vercel</span> — hosts the site.
          </li>
          <li>
            <span className="font-medium text-foreground">Turso</span> — runs the database the above
            is stored in.
          </li>
          <li>
            <span className="font-medium text-foreground">Anthropic</span> — generates the questions.
            Your brief is sent to the Anthropic API to be answered; nothing personal goes with it
            beyond whatever the brief itself contains.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="no-tracking" title="No analytics, no advertising">
        <LegalText>
          We run no analytics and no advertising, and we do not sell or share your data for either.
          Nothing here is used to profile you.
        </LegalText>
      </LegalSection>

      <LegalSection id="cookies" title="Cookies">
        <LegalText>
          There is one cookie, <code>pq_creator</code>, and the service cannot tell your packs from
          anyone else&apos;s without it. It is strictly necessary in that sense, which is why you are
          not asked to consent to it — there is nothing optional to consent to. We set no tracking
          or advertising cookies.
        </LegalText>
      </LegalSection>

      <LegalSection id="deletion" title="Deleting your data">
        <LegalText>
          Email{" "}
          <a className="font-medium text-amber hover:underline" href="mailto:privlin@gmail.com">
            privlin@gmail.com
          </a>{" "}
          and we will delete what we hold for you — your packs, any uploaded images, and the email
          address attached to a subscription. Billing records held by Paddle as merchant of record
          are theirs to keep or remove; see the{" "}
          <Link className="font-medium text-amber hover:underline" href="/refunds">
            refund policy
          </Link>{" "}
          for how to reach them.
        </LegalText>
      </LegalSection>

      <LegalSection id="changes" title="Changes to this policy">
        <LegalText>
          Changes are reflected in the date at the top of this page.
        </LegalText>
      </LegalSection>
    </LegalPage>
  );
}
