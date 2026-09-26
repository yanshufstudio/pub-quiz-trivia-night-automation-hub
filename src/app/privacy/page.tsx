import type { Metadata } from "next";
import Link from "next/link";
import { ContactLink, LegalList, LegalPage, LegalSection, LegalText } from "@/components/LegalPage";

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
          <ContactLink />
          .
        </LegalText>
      </LegalSection>

      <LegalSection id="what-we-store" title="What we store">
        <LegalList>
          <li>
            <span className="font-medium text-foreground">Your email address</span> — how you sign in,
            and how we reach you about your account. If you sign in with Google we also receive your
            name and your Google account id from them; if you sign in with an emailed code, that
            address is all we get.
          </li>
          <li>
            <span className="font-medium text-foreground">Your sign-in code</span> — the six digits we
            email you, and the link in the same email that carries them. We keep the code hashed, not
            in the clear, and it stops working once you use it or 15 minutes after we send it,
            whichever comes first.
          </li>
          <li>
            <span className="font-medium text-foreground">Sign-in session records</span> — a row per
            signed-in browser, holding an expiry, and the IP address and browser user-agent the
            sign-in came from. They are how we can end a session, and how you stay signed in without
            a password.
          </li>
          <li>
            <span className="font-medium text-foreground">A sign-in cookie</span> — set when you sign
            in, and how your browser is recognised on the next page. It lasts 7 days.
          </li>
          <li>
            <span className="font-medium text-foreground">A device cookie</span> (<code>pq_creator</code>)
            — only if you used TriviaFoundry before accounts existed. It is no longer set for anyone,
            and it is now used for exactly one thing: the first time you sign in, it lets us move the
            packs you made before onto your account. After that it does nothing.
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
          <li>
            <span className="font-medium text-foreground">Your subscription, if you buy Pro</span> — the
            customer id and subscription id Paddle gives us for you, the subscription&apos;s status
            (active, cancelled and so on) and when that status last changed. It is how we know whether
            your account is on Pro. We never see or store your card.
          </li>
          <li>
            <span className="font-medium text-foreground">A log of Paddle&apos;s notifications</span> —
            the id, type and time of each message Paddle sends us about a subscription, so that none is
            ever applied twice. It holds nothing about you.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="processors" title="Who else processes it">
        <LegalList>
          <li>
            <span className="font-medium text-foreground">Google</span> — only if you choose to sign in
            with Google. They tell us your email address, your name and your Google account id; we
            tell them nothing about you. Signing in with an emailed code instead involves Google not
            at all.
          </li>
          <li>
            <span className="font-medium text-foreground">Resend</span> — sends the sign-in email to
            your inbox. They handle your email address, the six-digit code and the link that carries
            it, and nothing else about you.
          </li>
          <li>
            <span className="font-medium text-foreground">Paddle</span> — sells the subscriptions and
            handles payment and invoicing. Card details go to Paddle, never to us. When you subscribe we
            pass Paddle&apos;s checkout your account&apos;s email address, so you do not have to type
            it, and an id that ties the purchase to your account; Paddle sends us back the ids and the
            status listed above.
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
        <LegalText>There are three, and not one of them is for tracking.</LegalText>
        <LegalList>
          <li>
            <span className="font-medium text-foreground">Your sign-in cookie</span> — set when you
            sign in and needed to keep you signed in. It lasts 7 days, and using the site keeps it
            current.
          </li>
          <li>
            <span className="font-medium text-foreground">A five-minute cookie during a Google
            sign-in</span> — set only if you choose Google, and only while you are being sent to
            Google and back. It is what ties that round trip to your browser so nobody else can
            finish it, and it expires five minutes later whether the sign-in worked or not.
          </li>
          <li>
            <span className="font-medium text-foreground"><code>pq_creator</code></span> — only present
            if you used TriviaFoundry before accounts existed, and no longer set for anyone. It
            exists so that signing in can bring your old packs with you.
          </li>
        </LegalList>
        <LegalText>
          All three are strictly necessary in the sense the law means: the service cannot tell your
          packs from anyone else&apos;s, or finish a Google sign-in, without them — so there is
          nothing optional to consent to. We set no tracking or advertising cookies. Teams playing a
          quiz are not asked to sign in and get none of them.
        </LegalText>
      </LegalSection>

      <LegalSection id="retention" title="How long we keep it">
        <LegalText>
          Your account, your packs and your subscription record stay until you ask us to delete
          them. A sign-in session stops working 7 days after it was last used, and a sign-in code 15
          minutes after we send it; a code is deleted the moment it is used. Live session entries —
          team names and answers — stay with the quiz they belong to.
        </LegalText>
      </LegalSection>

      <LegalSection id="deletion" title="Deleting your data">
        <LegalText>
          Email{" "}
          <ContactLink />{" "}
          and we will delete your account and everything held under it — your packs, any uploaded
          images, your sign-in sessions, the subscription ids and status we hold, and the email
          address and name on the account. We do this within 30 days and we do not keep a copy.
          Billing records held by Paddle as merchant of record are theirs to keep or remove; see
          the{" "}
          <Link className="font-medium text-amber hover:underline" href="/refunds">
            refund policy
          </Link>{" "}
          for how to reach them.
        </LegalText>
        <LegalText>
          Signing out on its own does not delete anything — it ends that browser&apos;s session and
          leaves your account as it was.
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
