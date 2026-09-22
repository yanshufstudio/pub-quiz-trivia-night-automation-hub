import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "How to run a quiz night · TriviaFoundry",
  description:
    "From a pack to a room full of teams: sign in, generate, add your pictures, print, "
    + "start the live session, share the join code, and run the night from one screen.",
};

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
        round, put your own image on any question with <em>Add image</em> in the pack editor;
        it then shows on the printed sheets, your host screen and every team&apos;s phone.
        Your own photos work best: the pub, the regulars, the high street. Location and
        camera details are stripped from a phone photo when it is uploaded.
      </>
    ),
  },
  {
    title: "Set a per-question timer, if you want one",
    body: (
      <>
        In the pack editor, next to <em>Start live session</em>. Twenty to sixty seconds a
        question, or no timer at all, which leaves you to reveal each answer when the room is
        ready. You can decide this at the last minute; it is set when the session starts.
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
        One phone per team is enough; that is the phone they answer on all night.
      </>
    ),
  },
  {
    title: "Start the quiz",
    body: (
      <>
        Once at least one team is in, <em>Start quiz</em> puts the first question up. Teams who
        turn up late can still join while you are in the lobby.
      </>
    ),
  },
  {
    title: "Run it: reveal, then next",
    body: (
      <>
        Each question goes up on your screen and on every team&apos;s phone.{" "}
        <em>Reveal answer</em> shows the answer and scores what came in; then you move on to the
        next question. That rhythm is the whole night.
      </>
    ),
  },
  {
    title: "Overrule the marking when you need to",
    body: (
      <>
        After a reveal, every team&apos;s answer is listed with <em>Correct</em> and{" "}
        <em>Wrong</em> next to it. A spelling that should have counted, a right answer typed
        the long way round — mark it yourself and the scores follow. You are the quizmaster;
        the software is not.
      </>
    ),
  },
  {
    title: "Finish on the scoreboard",
    body: (
      <>
        At the end the final standings go up, ties and all. Then you are back at your packs,
        ready to do it again next week.
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
          From an empty screen to a room full of teams. Twelve steps, most of them one click.
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
