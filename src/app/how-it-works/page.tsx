import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SITE_URL } from "@/lib/site";
import { formatBytes, MAX_MEDIA_BYTES } from "@/lib/media-limits";

export const metadata: Metadata = pageMetadata({
  path: "/how-it-works",
  title: "How to run a quiz night · TriviaFoundry",
  description:
    "From a pack to a room full of teams: sign in, generate, add your pictures, print, "
    + "start the live session, share the join code, and run the night from one screen.",
});

/**
 * The page that was missing.
 *
 * Everything needed to run a night existed — the wizard, the print sheets,
 * the live session, the join code, the QR — and nothing on the site said in
 * what order to use them or that the host desk and the team phones are two
 * different surfaces. A host who had generated a pack had no way to find out
 * what to do next except by pressing things during a quiz night, which is the
 * worst possible moment to find out.
 *
 * Written as the order you do it in rather than as a feature list, because
 * the question it answers is "what do I do next", and the two places it is
 * linked from — the pack editor and the footer — are both places where that
 * is the question being asked.
 *
 * Public and static on purpose: it is the page to send someone who has not
 * signed up yet, so it must render for a stranger, and it is in the sitemap
 * for the same reason. It takes no session and says nothing a signed-out
 * visitor cannot see.
 */

const JOIN_URL = `${SITE_URL}/play`;
/** Without the scheme: what you say out loud to a room, and what a team types. */
const JOIN_URL_SPOKEN = JOIN_URL.replace(/^https:\/\//, "");

const BRIEF_TIPS = [
  "Say how many rounds, and how many questions in each.",
  "Give each round a topic.",
  "Say who is playing and how hard it should be: \u201cfriends in a pub, medium\u201d, \u201cfamilies with kids, easy\u201d.",
  "Say the language, if it isn\u2019t English.",
  "Say anything to avoid.",
];

const BRIEF_EXAMPLES = [
  "5 rounds of 10 questions for adults in a pub, medium difficulty: 80s music, world geography, famous film quotes, science, general knowledge.",
  "3 rounds of 8 questions in Hebrew: Israeli history, Israeli pop music, food.",
  "1 round of 10 easy questions about animals for a family quiz night with children aged 8\u201312.",
];

type Step = { title: string; body: React.ReactNode };

const STEPS: Step[] = [
  {
    title: "Sign in",
    body: (
      <>
        Your packs belong to your account, so they are still there on another device and
        after you clear your cookies. Use Google, or have a six-digit code emailed to you.
      </>
    ),
  },
  {
    title: "Generate a pack, or open one you already have",
    body: (
      <>
        Tell <Link className="font-medium text-amber hover:underline" href="/create">Create</Link>{" "}
        what the night should be about and it writes the rounds, questions, answers and points.
        Everything it writes is yours to edit afterwards — nothing is fixed.
      </>
    ),
  },
  {
    title: "Add your own pictures, if you want a picture round",
    body: (
      <>
        The wizard writes text — it does not make pictures, music or video. For a picture
        round, put your own image on any question with <em>Add image</em> in the pack editor —
        a JPEG or PNG of up to {formatBytes(MAX_MEDIA_BYTES)} —
        and it then shows on the printed sheets, your host screen and every team&apos;s phone.
        Your own photos work best: the pub, the regulars, the high street. Location and
        camera details are stripped from a phone photo when it is uploaded.
      </>
    ),
  },
  {
    title: "Print the sheets",
    body: (
      <>
        <em>Print preview</em> in the pack editor gives you three things to print: the
        presenter script to read from, answer sheets for the teams, and a question sheet.
        Print them before the night — this is the part that needs a printer, not a phone.
        The printed sheets can only print Western European letters for now: English, French,
        German, Spanish and the like. Other letters — a Polish ł or a Czech ř — and other
        alphabets, such as Greek or Cyrillic, do not print correctly yet, although they show
        properly on your screen and on the teams&apos; phones.
      </>
    ),
  },
  {
    title: "Start the live session — on the device you will run the quiz from",
    body: (
      <>
        <em>Start live session</em> opens your host screen and puts the key to it in{" "}
        <strong>that browser</strong>. Open the same session anywhere else and it will ask you
        to paste the host key, which is what stops a team opening the host screen and reading
        the answers. So start it on the laptop or tablet you will actually stand behind.
      </>
    ),
  },
  {
    title: "Get the teams in",
    body: (
      <>
        Your host screen shows a five-character code and a QR code. Read the code out, write it
        on a board, or let teams scan. The code never contains O, I, 1 or 0, so there is nothing
        to misread across a noisy room.
      </>
    ),
  },
  {
    title: "Teams join from their own phones",
    body: (
      <>
        They go to <strong>{JOIN_URL_SPOKEN}</strong> — the <em>Join</em> link in the menu —
        and type the code and a team name. <strong>No account, no app, no sign-up.</strong>{" "}
        One phone per team is enough; that is the phone they answer on all night. If a phone
        drops off during the night, see{" "}
        <Link className="font-medium text-amber hover:underline" href="/faq#phone-connection">
          what to do when a team&apos;s phone loses its connection
        </Link>
        .
      </>
    ),
  },
  {
    title: "Add paper teams, if some tables play on paper",
    body: (
      <>
        A table writing on the printed answer sheets can still be on the scoreboard. Before you
        press <em>Start quiz</em>, use <em>Add paper team</em> and type the table&apos;s name: the
        button is only there while teams are joining. You type its total for each round when you
        check the marks.
      </>
    ),
  },
  {
    title: "Put the game on a TV, if the room has one",
    body: (
      <>
        On your host screen, open <em>Menu</em> and press <em>Open TV display</em> under{" "}
        <em>TV display</em>. It opens a page for the room in a new tab: move it to the screen
        the room can see. On a laptop, use Extend, not Mirror, and cast a tab, not your screen,
        or the room will see the answers. While teams join, the TV shows the join address, the
        code and a QR code. During a round it shows the current question, or every question
        asked so far if you choose <em>All questions so far</em> under <em>TV shows</em>. It
        never shows an answer before you reveal it.
      </>
    ),
  },
  {
    title: "Start the quiz",
    body: (
      <>
        Once at least one team is in, <em>Start quiz</em> opens round 1 with its first question.
        Teams who turn up late can still join; a team that joins after a round has closed plays
        from the next round.
      </>
    ),
  },
  {
    title: "Ask the round's questions",
    body: (
      <>
        Read each question out. <em>Ask next question</em> puts the next one up on the TV and on
        every team&apos;s phone. A team&apos;s phone keeps every question asked so far in the
        round, and the team can change its answers, up to five times a question, until you close
        the round. Your screen shows
        how many phone teams have answered the current question. If you want a time limit,{" "}
        <em>Start countdown</em> offers 1, 2, 3 or 5 minutes. It is a reminder only: answers stay
        open until you close the round, and the countdown stops when you ask the next question.
      </>
    ),
  },
  {
    title: "Close the round",
    body: (
      <>
        Once every question in the round has been asked, <em>Close round…</em> asks you to
        confirm. After <em>Yes, close the round</em>, teams can no longer change their answers.
      </>
    ),
  },
  {
    title: "Check the marks",
    body: (
      <>
        Every phone team&apos;s answers are marked automatically against the answer key and
        listed on your screen, with a tick or a cross. A spelling that should have counted, a
        right answer typed the long way round: tap the mark to change it and the scores follow.
        Below the marks, type the round total for each paper team, or a total that replaces a
        phone team&apos;s. The room sees none of this. You are the quizmaster; the software is
        not.
      </>
    ),
  },
  {
    title: "Reveal the answers",
    body: (
      <>
        <em>Reveal next answer</em> shows one answer at a time on the TV and on the phones, where
        each team sees its own mark. <em>Reveal all</em> shows the rest of the round at once.
        Type every paper team&apos;s total before you move on: <em>Reveal all</em> and{" "}
        <em>Finish quiz…</em> remind you if one is missing, <em>Reveal next answer</em> does not,
        and a round&apos;s totals cannot be changed from your screen once you press{" "}
        <em>Next round</em>. A round counts on the scoreboard once every answer in it is revealed.
      </>
    ),
  },
  {
    title: "Show the scoreboard, then the next round",
    body: (
      <>
        <em>Show scoreboard</em> puts the standings on the TV and on the phones, and{" "}
        <em>Hide scoreboard</em> takes them down. <em>Next round</em> takes the scoreboard down
        too and opens the next round with its first question, and you ask, close, mark and reveal
        it the same way.
      </>
    ),
  },
  {
    title: "Finish on the scoreboard",
    body: (
      <>
        After the last round is revealed, <em>Finish quiz…</em> asks you to confirm. Then the
        final standings go up on every screen, ties and all. The pack stays in your list, ready
        to run again next week.
      </>
    ),
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">How to run a quiz night</h1>
        <p className="mt-2 text-muted">
          From an empty screen to a room full of teams. Sixteen steps, most of them one click.
        </p>

        {/* A numbered list, because the order is the content. The marker is
            drawn rather than left to list-decimal so it survives the flex row
            that keeps long step titles from wrapping under the number. */}
        <ol className="mt-8 space-y-6">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span
                aria-hidden
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-background font-serif text-sm font-semibold"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <h2 className="font-serif text-lg font-semibold tracking-tight">{step.title}</h2>
                <p className="mt-1 text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* ACC4. The brief is the one thing the host writes, and a vague one
            gets a vague pack. /create links here as "Tips for a good brief". */}
        <section id="brief-tips" className="mt-10 scroll-mt-6 rounded-2xl border border-line bg-background p-6">
          <h2 className="font-serif text-xl font-semibold tracking-tight">How to write a good brief</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            {BRIEF_TIPS.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
          <h3 className="mt-5 text-sm font-semibold">For example</h3>
          <ul className="mt-2 space-y-2">
            {BRIEF_EXAMPLES.map((example) => (
              <li key={example} className="rounded-xl border border-line bg-white px-4 py-3 text-sm">
                {example}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10 rounded-2xl border border-line bg-background p-6">
          <h2 className="font-serif text-xl font-semibold tracking-tight">What you need on the night</h2>
          <ul className="mt-3 space-y-2 text-muted">
            <li>One laptop or tablet for you, with the session already open.</li>
            <li>A phone per team. Nothing installed, nothing signed up for.</li>
            <li>Printed sheets, if you want teams writing rather than tapping.</li>
            <li>
              A screen for the room is optional — everything a team needs is already on the
              phone in their hand.
            </li>
          </ul>
        </section>

        <p className="mt-8 text-muted">
          <Link className="font-medium text-amber hover:underline" href="/create">
            Make your first pack
          </Link>{" "}
          — or{" "}
          <Link className="font-medium text-amber hover:underline" href="/pricing">
            see what it costs
          </Link>
          .
        </p>
      </main>
    </>
  );
}
