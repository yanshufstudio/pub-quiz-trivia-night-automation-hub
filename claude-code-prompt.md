Context: I redesigned the Pub Quiz Hub's visual identity in a separate
sandbox (new "stage vs. paper" theme — darker, higher-contrast dark stage
with a spotlight glow; brighter cream paper desk; a live flip-scoreboard
signature element on the homepage; a hand-chalk accent font used sparingly).
It's fully implemented and verified there (clean typecheck, clean lint,
58/58 unit tests, 57/57 integration tests, and I screenshotted every major
page to confirm it looks right) — it just never made it into this repo
because the sync connection dropped. The six files below are the complete,
final content — write them exactly as given.

Goal: Get this repo's working tree to match the six files below exactly,
verify nothing broke, and commit.

Scope:

1. Overwrite `src/app/globals.css` with:

```css
@import "tailwindcss";

/*
  "Chalk & Brass" — two linked surfaces that map to how a pub quiz actually
  runs: the prep desk (paper, ink, brass) and the live room (chalkboard,
  gold chalk). Same token names the rest of the app already reaches for
  (bg-amber, text-stage-fg, bg-gold, …) — only the values and a couple of
  textures changed here, so this file is the single place that carries the
  whole visual identity.

  This pass pushes both surfaces further apart instead of toward a shared
  middle: the desk stays warm and bright (a true worktable, not a muted
  beige), the stage goes properly dark (a lit chalkboard in a dim room, not
  a soft slate). --amber stays deliberately restrained (it still carries
  white button text at AA contrast) — the brightness budget instead goes to
  --gold, which only ever sits on the dark stage and pairs with dark text,
  so it can run as hot as the room's actual spotlight would.
*/
:root {
  --background: #f7ecd6;
  --foreground: #221609;
  --muted: #6b5842;
  --line: #ddc79c;
  --amber: #a35a12;
  --amber-hover: #7a4009;
  --stage: #121d16;
  --stage-deep: #0b120d;
  --stage-fg: #f5efe1;
  --stage-muted: #9fb6a4;
  --gold: #f0c04d;

  --radius-xl: 0.65rem;
  --radius-2xl: 0.9rem;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-muted: var(--muted);
  --color-line: var(--line);
  --color-amber: var(--amber);
  --color-amber-hover: var(--amber-hover);
  --color-stage: var(--stage);
  --color-stage-fg: var(--stage-fg);
  --color-stage-muted: var(--stage-muted);
  --color-gold: var(--gold);

  --font-sans: var(--font-body), Arial, Helvetica, sans-serif;
  --font-serif: var(--font-display), Georgia, serif;
  --font-mono: var(--font-mono-plex), ui-monospace, monospace;
  /* A genuine hand-chalk marker face — used only for short scrawled
     accents (an eyebrow label, a doodled aside) on the stage, never for
     body copy or anything that has to be read quickly. */
  --font-script: var(--font-chalk), cursive;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
}

.chalk-script {
  font-family: var(--font-script);
}

/* A short brass double-rule — the one signature mark repeated wherever a
   heading needs real weight: a thick stroke over a thin one, like the rule
   under a menu-board header. Deliberately small and quiet everywhere else. */
.rule-brass {
  position: relative;
  display: inline-block;
  padding-bottom: 0.5rem;
}
.rule-brass::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: 0;
  width: 3.25rem;
  height: 5px;
  background: var(--amber);
  border-bottom: 2px solid var(--foreground);
  opacity: 0.9;
}
.rule-brass--dark::after {
  background: var(--gold);
  border-bottom-color: var(--stage-fg);
  opacity: 0.85;
}

/* Paper card: warm white with a faint fiber grain, not a flat swatch. */
.paper-sheet {
  background:
    radial-gradient(circle at 1px 1px, rgba(34, 22, 9, 0.055) 1px, transparent 0) 0 0/14px 14px,
    #fffaf0;
  box-shadow:
    0 1px 0 rgba(34, 22, 9, 0.08),
    0 20px 45px rgba(34, 22, 9, 0.12);
}

/* Chalkboard surfaces: every existing `bg-stage` usage picks this up for
   free (same Tailwind class, extended here) — a felt-dark ground with a
   dust grain and a spotlight vignette (a warm glow overhead, fading to
   --stage-deep at the edges) instead of a flat panel color. This is the
   one class that carries the "live room" mood everywhere it's used: the
   homepage hero, the host desk, the team portal. */
.bg-stage {
  background-color: var(--stage);
  background-image:
    radial-gradient(circle at 1px 1px, rgba(245, 239, 225, 0.045) 1px, transparent 0),
    radial-gradient(ellipse 75% 50% at 50% -5%, rgba(240, 192, 77, 0.14), transparent 62%),
    linear-gradient(180deg, var(--stage) 0%, var(--stage-deep) 100%);
  background-size: 16px 16px, 100% 100%, 100% 100%;
  background-repeat: repeat, no-repeat, no-repeat;
}

/* Panels/badges/hairlines on the chalkboard were sized as translucent
   chalk-white overlays (bg-white/5, /10, /15, border-white/10, /15) — kept
   as the same classes so every dark-mode component still reaches for them,
   just tuned against the deeper stage above so a panel reads as a raised
   panel, not a smudge. */
.bg-white\/5 {
  background-color: rgba(245, 239, 225, 0.07);
  border: 1px solid rgba(245, 239, 225, 0.09);
}
.bg-white\/10 {
  background-color: rgba(245, 239, 225, 0.12);
}
.bg-white\/15 {
  background-color: rgba(245, 239, 225, 0.18);
}
.border-white\/10 {
  border-color: rgba(245, 239, 225, 0.16);
}
.border-white\/15 {
  border-color: rgba(245, 239, 225, 0.22);
}

/* Quiet reveal for the end-of-quiz moment — the one place a small
   page-load flourish earns its keep. */
@keyframes reveal-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.animate-reveal {
  animation: reveal-up 0.5s ease-out both;
}
@media (prefers-reduced-motion: reduce) {
  .animate-reveal {
    animation: none;
  }
}

/* Flip-scoreboard digit — the homepage hero's signature element, styled
   after an airport departure board / pub quiz tally board. Each digit is a
   two-sided tile; the flipper rotates a half-turn on a loop, staggered per
   tile via an inline animation-delay so the board reads as "live" rather
   than everything flipping in unison. Purely decorative (a marketing
   preview of the real live scoreboard), so it always rests on a legible
   digit even with the animation frozen. */
.flip-tile {
  position: relative;
  width: 1.6rem;
  height: 2.15rem;
  perspective: 220px;
}
.flip-tile .flipper {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  animation: flip-digit 7s cubic-bezier(0.6, 0, 0.4, 1) infinite;
  animation-delay: var(--flip-delay, 0s);
}
.flip-tile .face {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1a2820;
  border: 1px solid rgba(245, 239, 225, 0.12);
  border-radius: 0.2rem;
  backface-visibility: hidden;
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: 1.05rem;
  color: var(--gold);
}
.flip-tile .face.back {
  transform: rotateX(180deg);
}
@keyframes flip-digit {
  0%, 42% { transform: rotateX(0deg); }
  50%, 92% { transform: rotateX(180deg); }
  100% { transform: rotateX(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .flip-tile .flipper {
    animation: none;
  }
}

@media print {
  body {
    background: white;
  }

  .print-chrome {
    display: none !important;
  }

  .paper-sheet {
    background: white;
    box-shadow: none;
    width: 100%;
    max-width: none;
  }
}
```

2. Overwrite `src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Caveat, Fraunces, IBM_Plex_Mono, Work_Sans } from "next/font/google";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
  style: ["normal", "italic"],
});

const body = Work_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono-plex",
  subsets: ["latin"],
  weight: ["500", "600"],
});

// A hand-chalk marker face, used sparingly for short scrawled accents on
// the dark "stage" surfaces (see .chalk-script in globals.css) — never for
// body copy.
const chalk = Caveat({
  variable: "--font-chalk",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "Pub Quiz Automation Hub",
  description: "AI-generated pub quiz packs, presenter scripts, and a live team portal.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable} ${chalk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

3. Overwrite `src/app/page.tsx` with:

```tsx
import Link from "next/link";
import { LiveScoreboardPreview } from "@/components/LiveScoreboardPreview";
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
    title: "Generate",
    body: "Describe the rounds and topics you want, and let AI build a complete quiz pack.",
    cta: "Open the wizard",
  },
  {
    href: "/packs",
    icon: OpenBookIcon,
    title: "Edit & print",
    body: "Fine-tune rounds and questions, then export presenter scripts and PDF answer sheets.",
    cta: "View packs",
  },
  {
    href: "/play",
    icon: PhoneLiveIcon,
    title: "Run it live",
    body: "On your phone at the venue? Enter the session code the host gives you and start answering.",
    cta: "Join a session",
  },
];

export default function Home() {
  return (
    <>
      {/* The homepage opens on its own dark "stage" — the same surface the
          live host desk and team portal use — with the nav folded into it,
          rather than the paper-toned SiteHeader every other page shares.
          That header is the app's admin chrome; this is the one moment
          meant to feel like the room itself. */}
      <div className="bg-stage text-stage-fg">
        <div className="mx-auto w-full max-w-5xl px-5 pt-7">
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-stage-muted">
              <QuillIcon className="h-4 w-4 shrink-0" />
              Pub Quiz Hub
            </span>
            <nav className="flex items-center gap-6 text-sm font-medium text-stage-muted">
              <Link href="/create" className="transition-colors hover:text-gold">Generate</Link>
              <Link href="/packs" className="transition-colors hover:text-gold">Manage</Link>
              <Link href="/play" className="transition-colors hover:text-gold">Play</Link>
            </nav>
          </div>

          <main className="pt-16 pb-20 sm:pt-20 sm:pb-24">
            <p className="chalk-script inline-block -rotate-2 text-2xl leading-none text-gold">
              Trivia night, wired up
            </p>
            <h1 className="mt-3 max-w-xl font-serif text-5xl font-semibold leading-[1.03] tracking-tight text-balance sm:text-6xl">
              Pub Quiz <em className="font-medium italic text-gold">Automation</em> Hub
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-stage-muted">
              Describe the rounds you want and AI builds the pack. Print the presenter script and
              answer sheets, then run the night live while every team&apos;s phone lights up with
              the question.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/create"
                className="inline-flex h-12 items-center rounded-lg bg-gold px-5 text-sm font-semibold text-stage transition-transform hover:-translate-y-px"
              >
                Generate a quiz pack
              </Link>
              <Link
                href="/play"
                className="group inline-flex h-12 items-center gap-1.5 rounded-lg border border-white/15 px-5 text-sm font-semibold transition-colors hover:border-gold hover:text-gold"
              >
                Join as a team
                <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            <LiveScoreboardPreview />
          </main>
        </div>
      </div>

      {/* Handoff seam: the stage fades to the bright prep-desk below it. */}
      <div className="h-8 bg-gradient-to-b from-[var(--stage-deep)] to-background sm:h-10" />

      <div className="bg-background text-foreground">
        <main className="mx-auto w-full max-w-5xl px-5 pb-20 sm:pb-24">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber">The prep desk</p>
          <h2 className="mt-2 max-w-lg font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
            Three steps <em className="font-medium italic text-amber">before</em> the room fills up
          </h2>

          <div className="mt-11 grid gap-5 sm:grid-cols-3">
            {steps.map((step, i) => (
              <Link
                key={step.href}
                href={step.href}
                className="paper-sheet group relative block rounded-xl border border-line p-6 pt-8 transition-transform hover:-translate-y-1"
              >
                <span className="absolute -top-3 left-6 inline-flex items-center rounded bg-amber px-2 py-1 font-mono text-[0.68rem] font-semibold tracking-wide text-white shadow-sm">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <step.icon className="h-6 w-6 text-amber" />
                <h3 className="mt-4 font-serif text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted">{step.body}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-amber">
                  {step.cta}
                  <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </main>
      </div>
    </>
  );
}
```

4. Create `src/components/LiveScoreboardPreview.tsx` with:

```tsx
// A decorative preview of the real live scoreboard (see Scoreboard.tsx),
// used only in the homepage hero to show what "run the night live" actually
// looks like. Each score's second digit flips on a loop (pure CSS, see
// .flip-tile in globals.css) — staggered per row so the board reads as
// continuously live rather than a single synchronized blink.
const ROWS = [
  { rank: 1, team: "The Alan Titchmarshians", tens: "4", ones: "8", delay: "-0.4s" },
  { rank: 2, team: "Quizteama Aguilera", tens: "4", ones: "3", delay: "-2.6s" },
  { rank: 3, team: "Sherlock Ohms", tens: "3", ones: "7", delay: "-4.9s" },
];

export function LiveScoreboardPreview() {
  return (
    <div
      className="mt-12 max-w-md rounded-xl border border-white/10 bg-white/5 px-5 py-4 shadow-[0_30px_70px_rgba(0,0,0,0.45)] sm:mt-14"
      role="img"
      aria-label="Live scoreboard showing three teams and their scores updating in real time"
    >
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-stage-muted">
          Round 3 · Live scoreboard
        </p>
        <span className="inline-flex items-center gap-1.5 font-mono text-[0.68rem] tracking-[0.1em] text-gold">
          <span className="h-1.5 w-1.5 rounded-full bg-gold motion-safe:animate-pulse" />
          LIVE
        </span>
      </div>

      <ol className="mt-3">
        {ROWS.map((row) => (
          <li
            key={row.rank}
            className="flex items-center gap-3 border-t border-white/10 py-2 first:border-t-0"
          >
            <span className="w-4 shrink-0 font-mono text-sm text-stage-muted">{row.rank}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.team}</span>
            <span className="flex shrink-0 gap-[3px]">
              <span className="flip-tile" style={{ "--flip-delay": row.delay } as React.CSSProperties}>
                <span className="flipper">
                  <span className="face front">{row.tens}</span>
                  <span className="face back">{row.tens}</span>
                </span>
              </span>
              <span className="flip-tile" style={{ "--flip-delay": `calc(${row.delay} - 0.7s)` } as React.CSSProperties}>
                <span className="flipper">
                  <span className="face front">{row.ones}</span>
                  <span className="face back">{String(Number(row.ones) + 1)}</span>
                </span>
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

5. Overwrite `src/components/SiteHeader.tsx` with:

```tsx
import Link from "next/link";

const links = [
  { href: "/create", label: "Create" },
  { href: "/packs", label: "Packs" },
  { href: "/play", label: "Join" },
];

export function SiteHeader() {
  return (
    <header className="border-b-2 border-foreground/90 bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-3.5">
        <Link href="/" className="flex items-center gap-2 font-serif text-base font-semibold tracking-tight">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-amber" aria-hidden>
            <path d="M20 4c-4.2 0-9.3 2-12.4 7.2-1.7 2.9-2.5 5.6-3.1 8.3 2.6-.5 5.4-1.3 8.3-3C17.9 13.4 20 8.3 20 4z" />
            <path d="M9 15 4 20" />
          </svg>
          Pub Quiz Hub
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-amber"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
```

6. In `src/app/packs/[id]/print/PrintPreview.tsx`, make two small string
   replacements (leave everything else in that file untouched):
   - `bg-[#e8dfcf]` → `bg-[#ecdfbc]`
   - `bg-[#f7f1e6]` → `bg-[#fbf3dc]`

Definition of done:
- `npx next typegen && npx tsc --noEmit` — clean, no errors.
- `npx eslint .` — clean, no errors.
- `npm run test` — all unit tests pass.
- `npm run test:integration` — all integration tests pass.
- `git status --porcelain` shows only the 6 files above as changed (this
  repo has pre-existing CRLF/LF line-ending drift in a few unrelated files
  — `src/app/host/[code]/page.tsx`, `src/app/play/page.tsx`,
  `src/components/Scoreboard.tsx`, `src/components/StatusBadge.tsx`,
  `src/lib/team-session.ts` — confirm with `git diff --stat -w` that those
  show zero real changes, and do NOT stage or commit them).

Constraints: Don't touch any other files. Don't change application logic —
this is a pure visual/CSS pass, so behavior (routes, API calls, state
machines) must be unchanged.

Once verified, stage exactly the 6 files and commit with a message
describing the redesign (dark "stage" hero with a live flip-scoreboard,
richer paper-desk tones, new chalk-script accent font), ending with:

```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RZhLtu4FGm7ZE8Vdp8u4K9
```

Report back with: confirmation that git status is clean (only the known
drift files left unstaged) and the commit hash.
