import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { ANNUAL_MONTHS_FREE, formatUsd, PRICE_ANNUAL_USD, PRICE_MONTHLY_USD } from "@/lib/pricing";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Questions and answers · TriviaFoundry",
  description:
    "What TriviaFoundry does and does not do: what the wizard writes, how long it takes, "
    + "what teams need, what it costs, and what is coming next.",
};

/**
 * The questions a host asks before the guide makes sense to them.
 *
 * /how-it-works is the order you do things in. This is the page for the
 * question that comes before that — "does it do X" — and in particular for
 * the one that had no answer anywhere on the site until 22 Sep: whether the
 * wizard makes pictures. It does not. The homepage promised "a picture
 * round" without saying that the pictures are yours to add, and a host who
 * asked for one got a text round and no explanation. Every answer here is
 * written from what the product does today, and the things it does not do
 * yet are said plainly rather than left to be discovered.
 *
 * Numbers come from the same constants the pricing page reads, so a price
 * change cannot leave a stale figure here. The generation time is the one
 * measured on production on 22 Sep 2026 (the default four-round brief, 40
 * questions, under 40 seconds); "normally" is the owner's word, and it is
 * doing real work — one measurement is not a guarantee.
 *
 * Public and static, like the guide: the page to send someone who has not
 * signed up, so it takes no session, renders for a stranger and is in the
 * sitemap.
 */

const JOIN_URL_SPOKEN = `${SITE_URL}/play`.replace(/^https:\/\//, "");

const link = "font-medium text-amber hover:underline";

type Entry = { id: string; question: string; answer: React.ReactNode };

const ENTRIES: Entry[] = [
  {
    id: "what-it-writes",
    question: "What does the wizard actually write?",
    answer: (
      <>
        Text. Tell it what the night should be about and it writes the rounds, the
        questions, the answers and the points, as text you can read out or print. It does
        not make pictures, play music or show video clips. If you ask for a picture round,
        it writes a round that works in words — a question that describes the thing rather
        than shows it.
      </>
    ),
  },
  {
    id: "pictures",
    question: "Can I run a picture round?",
    answer: (
      <>
        Yes, with your own pictures. Any question in the pack editor takes an image —{" "}
        <em>Add image</em> under the question — and that picture then shows on the printed
        sheets, on your host screen and on every team&apos;s phone. Your own photos work
        best: the pub, the regulars, the high street. Phone photos have their location and
        camera details stripped when they are uploaded.
      </>
    ),
  },
  {
    id: "whats-next",
    question: "What is coming next?",
    answer: (
      <>
        Pictures, audio and video the wizard supplies itself, so a picture round or a
        &ldquo;name that tune&rdquo; round can be written for you the way the text rounds are
        today. That is the next version&apos;s headline, and it is not in the product yet — nothing
        on this site sells it before it exists.
      </>
    ),
  },
  {
    id: "how-long",
    question: "How long does a pack take?",
    answer: (
      <>
        Normally less than a minute. A four-round, forty-question pack is the usual size, and
        the page tells you when it is done. Bigger briefs take longer.
      </>
    ),
  },
  {
    id: "editing",
    question: "Can I change what it wrote?",
    answer: (
      <>
        Everything. Every question, answer and points value is editable in the pack editor.
        You can add or delete a question, delete a round, move a round up or down, and give a
        question a list of alternative answers that also count as right. Nothing the wizard
        writes is fixed.
      </>
    ),
  },
  {
    id: "teams",
    question: "Do teams need an account or an app?",
    answer: (
      <>
        No. A team goes to <strong>{JOIN_URL_SPOKEN}</strong> on any phone, types the
        five-character code from your screen and a team name, and they are in. One phone per
        team is enough. No account, no app, no sign-up.
      </>
    ),
  },
  {
    id: "screen",
    question: "Do I need a screen for the room?",
    answer: (
      <>
        No. Each question goes up on every team&apos;s phone as well as on your own screen, and
        the scores update there as you reveal answers. A screen for the room is a nice extra,
        not a requirement.
      </>
    ),
  },
  {
    id: "printing",
    question: "Can I print it?",
    answer: (
      <>
        Yes. <em>Print preview</em> in the pack editor gives you a presenter script to read
        from, a question sheet, and answer sheets for teams who would rather write than tap.
        Pictures you have added print with their questions.
      </>
    ),
  },
  {
    id: "marking",
    question: "What if a team's answer is right but spelt wrong?",
    answer: (
      <>
        You decide. After each reveal, every team&apos;s answer is listed with <em>Correct</em>{" "}
        and <em>Wrong</em> next to it. Mark it yourself and the scores follow. You are the
        quizmaster; the software is not.
      </>
    ),
  },
  {
    id: "cost",
    question: "What does it cost?",
    answer: (
      <>
        A free account gets two quiz packs every thirty days, with everything: the wizard,
        the editor, the printed sheets and the live game. Pro lifts the two-pack limit, at{" "}
        {formatUsd(PRICE_MONTHLY_USD)} a month or {formatUsd(PRICE_ANNUAL_USD)} a year (
        {ANNUAL_MONTHS_FREE} months free). Pro is on sale now; a daily
        safety limit on generation applies across the whole service. Details on the{" "}
        <Link className={link} href="/pricing">
          pricing page
        </Link>
        .
      </>
    ),
  },
  {
    id: "ownership",
    question: "Who owns the packs, and what happens to my data?",
    answer: (
      <>
        The packs are yours, on your account, on any device you sign in from. We run no
        analytics and no advertising, and what we store and for how long is set out in the{" "}
        <Link className={link} href="/privacy">
          privacy policy
        </Link>
        .
      </>
    ),
  },
  {
    id: "again",
    question: "Can I run the same pack twice?",
    answer: (
      <>
        Yes. A pack stays in your list, and every live session is a fresh start: a new code,
        new teams, a clean scoreboard. Edit it between nights or run it as it is.
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Questions and answers</h1>
        <p className="mt-2 text-muted">
          What TriviaFoundry does, what it does not do yet, and what a night needs. For the
          order you do things in, see{" "}
          <Link className={link} href="/how-it-works">
            how to run a quiz night
          </Link>
          .
        </p>

        {/* Plain headings and paragraphs rather than a disclosure widget: the
            page is short enough to read top to bottom, every answer stays
            findable with the browser's own search, and each question has an
            id so a link can land on it. */}
        <div className="mt-8 space-y-8">
          {ENTRIES.map((entry) => (
            <section key={entry.id} id={entry.id} className="scroll-mt-6">
              <h2 className="font-serif text-lg font-semibold tracking-tight">{entry.question}</h2>
              <p className="mt-1 text-muted">{entry.answer}</p>
            </section>
          ))}
        </div>

        <p className="mt-10 text-muted">
          <Link className={link} href="/create">
            Make your first pack
          </Link>{" "}
          — or{" "}
          <Link className={link} href="/how-it-works">
            read how a night runs
          </Link>
          .
        </p>
      </main>
    </>
  );
}
