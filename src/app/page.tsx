import Link from "next/link";
import { AccountNav } from "@/components/AccountNav";
import { LiveScoreboardPreview } from "@/components/LiveScoreboardPreview";
import { NAV_LINKS } from "@/components/SiteHeader";
import { Wordmark } from "@/components/Wordmark";
import { ArrowRightIcon } from "@/components/icons";
import type { SVGProps } from "react";

function QuillIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 4c-4.2 0-9.3 2-12.4 7.2-1.7 2.9-2.5 5.6-3.1 8.3 2.6-.5 5.4-1.3 8.3-3C17.9 13.4 20 8.3 20 4z" />
      <path d="M9 15 4 20" />
    </svg>
  );
}

function OpenBookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 5.5c2.2-.9 4.6-.9 7 0v13c-2.4-.9-4.8-.9-7 0z" />
      <path d="M20 5.5c-2.2-.9-4.6-.9-7 0v13c2.4-.9 4.8-.9 7 0z" />
    </svg>
  );
}

function PhoneLiveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="6.5" y="2.5" width="10" height="19" rx="2.2" />
      <path d="M10.5 18.2h2" />
      <path d="M19 8.5c1 1 1 3.5 0 4.5" />
    </svg>
  );
}

const steps = [
  {
    href: "/create",
    icon: QuillIcon,
    title: "Write it",
    body: "Describe the rounds and topics you want — 90s pop, local history, a picture round — and the pack is drafted for you.",
    cta: "Open the wizard",
  },
  {
    href: "/packs",
    icon: OpenBookIcon,
    title: "Edit & print",
    body: "Fix a question, swap an answer, reorder a round. Then print the presenter script and the team answer sheets.",
    cta: "View packs",
  },
  {
    href: "/play",
    icon: PhoneLiveIcon,
    title: "Run it live",
    body: "Put the host screen on the TV. Teams join from their phones with a code, answer in real time, and watch the scores climb.",
    cta: "Join a session",
  },
];

export default function Home() {
  return (
    <div className="bg-stage text-stage-fg">
      <div className="mx-auto w-full max-w-5xl px-5 pt-7">
        {/* The homepage carries its own copy of the site chrome (see
            SiteHeader) rather than rendering that component, so the sign
            can sit straight on the stage with no rule under it. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Wordmark href="/" className="text-[1.5rem]" />
          {/* The account corner rides along with the links here as well —
              the two rows import both from one place so they cannot drift
              apart again the way the labels and Pricing did. */}
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm font-semibold text-stage-muted">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="py-2 transition-colors hover:text-gold">
                {link.label}
              </Link>
            ))}
            <AccountNav />
          </nav>
        </div>

        <main className="pt-16 pb-16 sm:pt-20 sm:pb-20">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-mint">
            Pub quiz · Trivia night · Written, printed, run live
          </p>
          <h1 className="mt-4 max-w-2xl font-serif text-[2.6rem] leading-[1.05] text-balance sm:text-6xl">
            Tonight&apos;s quiz, <span className="sign-glow text-gold">forged</span> while you pour.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-stage-muted">
            Describe the rounds you want. TriviaFoundry writes the whole pub quiz or trivia night
            — a full pack, a presenter script and printed answer sheets — then runs it live while
            every team&apos;s phone lights up with the question.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/create"
              className="sign-glow-box inline-flex h-12 items-center rounded-lg bg-gold px-5 text-sm font-bold text-stage transition-transform hover:-translate-y-px"
            >
              Write my quiz
            </Link>
            <Link
              href="/play"
              className="group inline-flex h-12 items-center gap-1.5 rounded-lg border-2 border-mint/80 px-5 text-sm font-bold text-mint transition-colors hover:border-mint hover:bg-mint/10"
            >
              Join as a team
              <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <LiveScoreboardPreview />
        </main>
      </div>

      {/* The three steps stay on the stage — one room, not a hand-off to a
          lighter page — as brass-edged panels, the way a chalked menu board
          hangs behind the bar. */}
      <div className="border-t border-brass/30">
        <section aria-labelledby="how-a-night-runs" className="mx-auto w-full max-w-5xl px-5 py-16 sm:py-20">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-mint">How a night runs</p>
          <h2 id="how-a-night-runs" className="mt-3 max-w-lg font-serif text-3xl tracking-tight sm:text-4xl">
            Three steps before the room fills up
          </h2>

          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {steps.map((step, i) => (
              <Link
                key={step.href}
                href={step.href}
                className="group relative block rounded-lg border border-brass/40 border-l-4 border-l-gold bg-stage-panel p-6 pt-7 transition-transform hover:-translate-y-1 hover:border-brass/70"
              >
                <span className="absolute -top-3 left-5 inline-flex items-center rounded bg-gold px-2 py-1 font-mono text-[0.68rem] font-semibold tracking-wide text-stage">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <step.icon className="h-6 w-6 text-gold" />
                <h3 className="mt-4 font-serif text-xl">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stage-muted">{step.body}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-mint">
                  {step.cta}
                  <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
