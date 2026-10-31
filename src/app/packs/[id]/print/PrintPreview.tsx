"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import type { Pack, Question } from "@/lib/api-types";
import { countOf } from "@/lib/plural";
import { PRINT_SHEETS, printPageTitle, type PrintSheet } from "@/lib/print-sheets";

function OptionsLine({ question }: { question: Question }) {
  if (question.type !== "MULTIPLE_CHOICE" || question.options.length === 0) return null;
  return (
    <p className="mt-1 ml-6 text-sm text-muted">
      {question.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join("   ")}
    </p>
  );
}

/** Same-origin `<img>` at the question's own media route, the one
 * bytes-in-the-DB route every surface shares. Renders nothing for a question
 * with no attached image. */
function PrintQuestionImage({ question }: { question: Question }) {
  if (!question.hasMedia) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- our own API route, not a next/image-optimizable asset
    <img
      src={`/api/questions/${question.id}/media`}
      alt=""
      className="mt-2 ml-6 max-h-40 max-w-[min(20rem,calc(100%-1.5rem))] rounded-md border border-line object-contain print:max-h-32"
    />
  );
}

const TABS = Object.keys(PRINT_SHEETS) as PrintSheet[];

export function PrintPreview({ pack }: { pack: Pack }) {
  const [tab, setTab] = useState<PrintSheet>("script");

  // The server renders the first sheet's title; this keeps it on the sheet on
  // screen, so a PDF saved from the print window is named after it.
  useEffect(() => {
    document.title = printPageTitle(pack.title, tab);
  }, [pack.title, tab]);

  return (
    <div className="min-h-full bg-[#ecdfbc] pb-16 print:pb-0">
      <div className="print-chrome mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-5">
        <div>
          <Link
            href={`/packs/${pack.id}`}
            className="group inline-flex min-h-11 items-center gap-1.5 text-sm text-foreground/75 hover:text-foreground"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            Back to editor
          </Link>
          <h1 className="mt-1 font-serif text-2xl font-semibold tracking-tight">Print layout</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-11 items-center rounded-xl bg-amber px-4 text-sm font-semibold text-white hover:bg-amber-hover"
          >
            Print this sheet
          </button>
        </div>
      </div>

      <div className="print-chrome mx-auto mb-6 flex w-full max-w-3xl flex-wrap gap-2 px-5">
        {TABS.map((sheet) => (
          <button
            key={sheet}
            type="button"
            onClick={() => setTab(sheet)}
            className={`h-11 rounded-xl px-4 text-sm font-semibold ${
              tab === sheet ? "bg-foreground text-background" : "bg-white/70 text-muted"
            }`}
          >
            {PRINT_SHEETS[sheet]}
          </button>
        ))}
      </div>

      <article className="paper-sheet mx-auto min-h-[1100px] w-[min(100%-1.5rem,794px)] px-10 py-12 sm:px-14 print:min-h-0 print:py-0">
        <header className="border-b-2 border-foreground pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber">{PRINT_SHEETS[tab]}</p>
          <h2 className="mt-2 font-serif text-3xl font-bold tracking-tight">{pack.title}</h2>
          <p className="mt-1 text-sm text-muted">
            {tab === "questions" ? (
              "Team name: _______________________________"
            ) : (
              <>{countOf(pack.rounds.length, "round")} · keep this copy at the lectern</>
            )}
          </p>
        </header>

        {tab === "script" ? <ScriptLayout pack={pack} /> : null}
        {tab === "answers" ? <AnswerLayout pack={pack} /> : null}
        {tab === "questions" ? <QuestionLayout pack={pack} /> : null}
      </article>
    </div>
  );
}

function Cue({ children }: { children: React.ReactNode }) {
  return (
    <p className="my-3 rounded-md border border-dashed border-line bg-[#fbf3dc] px-3 py-2 text-sm italic text-muted">
      {children}
    </p>
  );
}

/**
 * Page-break policy for the three layouts below: a round flows across pages
 * when it has to, no single question or answer row is ever split down the
 * middle, and a round heading is never left stranded at the foot of a page
 * with nothing under it.
 *
 * Every round used to carry `break-inside-avoid` itself. That holds for the
 * five-question demo pack and cannot hold for the ten-question rounds the
 * wizard's default brief produces — such a round is taller than a sheet, and
 * a block that cannot fit on any page is one the browser breaks wherever it
 * happens to land, mid-question included. Declaring the *question* unbreakable
 * and letting the round flow is what actually keeps a question whole.
 */
function ScriptLayout({ pack }: { pack: Pack }) {
  return (
    <div className="mt-6">
      <Cue>Welcome everyone, introduce tonight’s quiz, and remind teams how scoring works.</Cue>
      {pack.rounds.map((round) => (
        <section key={round.id} className="mt-8">
          <h3 className="break-after-avoid font-serif text-2xl font-bold">
            Round {round.index + 1}: {round.title}
          </h3>
          <p className="break-after-avoid text-sm italic text-muted">{round.category}</p>
          <Cue>Announce the round title and category. Give teams a moment to ready their sheets.</Cue>
          <ol className="mt-4 space-y-5">
            {round.questions.map((question) => (
              <li key={question.id} className="break-inside-avoid">
                <div className="flex items-start justify-between gap-4">
                  <p>
                    <span className="mr-2 font-bold">{question.index + 1}.</span>
                    {question.text}
                  </p>
                  <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
                    {countOf(question.points, "pt")}
                  </span>
                </div>
                <OptionsLine question={question} />
                <PrintQuestionImage question={question} />
                <p className="mt-2 ml-6 rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-900">
                  Answer: {question.answer}
                </p>
              </li>
            ))}
          </ol>
          <Cue>Read the answers, then confirm scores on the host dashboard before moving on.</Cue>
        </section>
      ))}
      <Cue>Announce final scores and thank everyone for playing.</Cue>
    </div>
  );
}

function AnswerLayout({ pack }: { pack: Pack }) {
  return (
    <div className="mt-6 space-y-8">
      {pack.rounds.map((round) => (
        <section key={round.id}>
          <h3 className="break-after-avoid font-serif text-xl font-bold">
            Round {round.index + 1}: {round.title}
          </h3>
          <p className="break-after-avoid mb-3 text-sm italic text-muted">{round.category}</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-foreground text-left text-xs uppercase tracking-wide whitespace-nowrap text-muted">
                <th className="w-10 py-2">#</th>
                <th className="py-2">Question</th>
                <th className="py-2">Answer</th>
                <th className="w-14 py-2 text-right">Pts</th>
              </tr>
            </thead>
            <tbody>
              {round.questions.map((question) => (
                <tr key={question.id} className="break-inside-avoid border-b border-line align-top">
                  <td className="py-2.5 font-semibold">{question.index + 1}</td>
                  <td className="py-2.5 pr-4 text-muted">
                    {question.text}
                    {question.hasMedia ? (
                      // eslint-disable-next-line @next/next/no-img-element -- our own API route, not a next/image-optimizable asset
                      <img
                        src={`/api/questions/${question.id}/media`}
                        alt=""
                        className="mt-2 max-h-28 max-w-[10rem] rounded-md border border-line object-contain"
                      />
                    ) : null}
                  </td>
                  <td className="py-2.5 font-semibold text-emerald-800">{question.answer}</td>
                  <td className="py-2.5 text-right tabular-nums">{question.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function QuestionLayout({ pack }: { pack: Pack }) {
  return (
    <div className="mt-6 space-y-8">
      {pack.rounds.map((round) => (
        <section key={round.id}>
          <h3 className="break-after-avoid font-serif text-xl font-bold">
            Round {round.index + 1}: {round.title}
          </h3>
          <p className="break-after-avoid mb-3 text-sm italic text-muted">{round.category}</p>
          <ol className="space-y-5">
            {round.questions.map((question) => (
              <li key={question.id} className="break-inside-avoid">
                <div className="flex items-start justify-between gap-4">
                  <p>
                    <span className="mr-2 font-bold">{question.index + 1}.</span>
                    {question.text}
                  </p>
                  <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
                    {countOf(question.points, "pt")}
                  </span>
                </div>
                <OptionsLine question={question} />
                <PrintQuestionImage question={question} />
                <div className="mt-2 ml-6 h-8 border-b border-line" />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
