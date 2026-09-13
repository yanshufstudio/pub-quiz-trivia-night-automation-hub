"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import type { Pack, Question } from "@/lib/api-types";

function OptionsLine({ question }: { question: Question }) {
  if (question.type !== "MULTIPLE_CHOICE" || question.options.length === 0) return null;
  return (
    <p className="mt-1 ml-6 text-sm text-muted">
      {question.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join("   ")}
    </p>
  );
}

/** Same-origin `<img>` at the question's own media route, matching the PDF
 * documents (src/lib/pdf/documents.tsx) — this is a browser print preview,
 * not the PDF renderer, so there's no SSRF surface here, but it's still the
 * one bytes-in-the-DB route every surface shares. Renders nothing for a
 * question with no attached image. */
function PrintQuestionImage({ question }: { question: Question }) {
  if (!question.hasMedia) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- our own API route, not a next/image-optimizable asset
    <img
      src={`/api/questions/${question.id}/media`}
      alt=""
      className="mt-2 ml-6 max-h-40 max-w-xs rounded-md border border-line object-contain print:max-h-32"
    />
  );
}

const TABS = [
  { id: "script", label: "Presenter script", type: "script" },
  { id: "answers", label: "Answer sheet", type: "answers" },
  { id: "questions", label: "Question sheet", type: "questions" },
] as const;

export function PrintPreview({ pack }: { pack: Pack }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("script");

  return (
    <div className="min-h-full bg-[#ecdfbc] pb-16">
      <div className="print-chrome mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-5">
        <div>
          <Link
            href={`/packs/${pack.id}`}
            className="group inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            Back to editor
          </Link>
          <h1 className="mt-1 font-serif text-2xl font-semibold tracking-tight">Print layout</h1>
        </div>
        <a
          href={`/api/packs/${pack.id}/pdf?type=${TABS.find((item) => item.id === tab)?.type}`}
          className="inline-flex h-11 items-center rounded-xl bg-amber px-4 text-sm font-semibold text-white hover:bg-amber-hover"
        >
          Download PDF
        </a>
      </div>

      <div className="print-chrome mx-auto mb-6 flex w-full max-w-3xl gap-2 px-5">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`h-11 rounded-xl px-4 text-sm font-semibold ${
              tab === item.id ? "bg-foreground text-background" : "bg-white/70 text-muted"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <article className="paper-sheet mx-auto min-h-[1100px] w-[min(100%-1.5rem,794px)] px-10 py-12 sm:px-14">
        <header className="border-b-2 border-foreground pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber">
            {tab === "script" ? "Presenter script" : tab === "answers" ? "Host answer key" : "Team question sheet"}
          </p>
          <h2 className="mt-2 font-serif text-3xl font-bold tracking-tight">{pack.title}</h2>
          <p className="mt-1 text-sm text-muted">
            {pack.rounds.length} rounds · keep this copy at the lectern
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

function ScriptLayout({ pack }: { pack: Pack }) {
  return (
    <div className="mt-6">
      <Cue>Welcome everyone, introduce tonight’s quiz, and remind teams how scoring works.</Cue>
      {pack.rounds.map((round) => (
        <section key={round.id} className="mt-8 break-inside-avoid">
          <h3 className="font-serif text-2xl font-bold">
            Round {round.index + 1}: {round.title}
          </h3>
          <p className="text-sm italic text-muted">{round.category}</p>
          <Cue>Announce the round title and category. Give teams a moment to ready their sheets.</Cue>
          <ol className="mt-4 space-y-5">
            {round.questions.map((question) => (
              <li key={question.id}>
                <div className="flex items-start justify-between gap-4">
                  <p>
                    <span className="mr-2 font-bold">{question.index + 1}.</span>
                    {question.text}
                  </p>
                  <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
                    {question.points} pt
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
        <section key={round.id} className="break-inside-avoid">
          <h3 className="font-serif text-xl font-bold">
            Round {round.index + 1}: {round.title}
          </h3>
          <p className="mb-3 text-sm italic text-muted">{round.category}</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-foreground text-left text-xs uppercase tracking-wide text-muted">
                <th className="w-10 py-2">#</th>
                <th className="py-2">Question</th>
                <th className="py-2">Answer</th>
                <th className="w-14 py-2 text-right">Pts</th>
              </tr>
            </thead>
            <tbody>
              {round.questions.map((question) => (
                <tr key={question.id} className="border-b border-line align-top">
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
      <p className="text-sm text-muted">Team name: _______________________________</p>
      {pack.rounds.map((round) => (
        <section key={round.id} className="break-inside-avoid">
          <h3 className="font-serif text-xl font-bold">
            Round {round.index + 1}: {round.title}
          </h3>
          <p className="mb-3 text-sm italic text-muted">{round.category}</p>
          <ol className="space-y-5">
            {round.questions.map((question) => (
              <li key={question.id}>
                <div className="flex items-start justify-between gap-4">
                  <p>
                    <span className="mr-2 font-bold">{question.index + 1}.</span>
                    {question.text}
                  </p>
                  <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
                    {question.points} pt
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
