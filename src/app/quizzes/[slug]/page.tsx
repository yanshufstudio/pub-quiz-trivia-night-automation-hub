import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { QUIZZES, getQuiz, quizPath } from "@/content/quizzes";
import {
  ANSWERS_HEADING,
  PRINT_BUTTON_LABEL,
  PRINTED_SHEETS_IMAGE,
  answersLabel,
  questionsLabel,
  roundHeading,
} from "@/content/quizzes/page-copy";
import { pageMetadata } from "@/lib/page-metadata";
import { PrintButton } from "./PrintButton";

/**
 * One public quiz page per entry in src/content/quizzes (/quizzes/halloween,
 * and the pages after it). The content is a typed module per quiz; this route
 * only lays it out, so the next page is a data file and a picture.
 *
 * Static and public: it takes no session, and says nothing a signed-out
 * visitor cannot see. `dynamicParams = false` makes any slug that is not in
 * the list a 404 rather than a render attempt.
 *
 * Printing gives the heading, the round headings, the questions and the
 * answers and nothing else. Everything else on the page is `print-chrome`
 * (display: none when printing); the root layout's footer is hidden by the
 * `quiz-sheet` rule in globals.css, because it sits outside this page's markup.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return QUIZZES.map((quiz) => ({ slug: quiz.slug }));
}

export async function generateMetadata({ params }: PageProps<"/quizzes/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const quiz = getQuiz(slug);
  if (!quiz) notFound();
  return pageMetadata({
    path: quizPath(quiz),
    title: quiz.title,
    description: quiz.description,
    image: quiz.image,
  });
}

export default async function QuizPage({ params }: PageProps<"/quizzes/[slug]">) {
  const { slug } = await params;
  const quiz = getQuiz(slug);
  if (!quiz) notFound();

  return (
    <>
      <div className="print-chrome">
        <SiteHeader />
      </div>
      <main className="quiz-sheet mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <div className="print-chrome">
          <Image
            src={quiz.image.url}
            width={quiz.image.width}
            height={quiz.image.height}
            alt={quiz.image.alt}
            priority
            sizes="(min-width: 768px) 728px, 100vw"
            className="h-auto w-full rounded-2xl border border-line"
          />
        </div>

        <h1 className="mt-8 font-serif text-3xl font-semibold tracking-tight">{quiz.heading}</h1>
        <p className="print-chrome mt-3 text-muted">{quiz.intro}</p>

        <PrintButton label={PRINT_BUTTON_LABEL} />

        {quiz.rounds.map((round, index) => {
          const number = index + 1;
          return (
            <section key={round.title} aria-labelledby={`round-${number}`} className="mt-10">
              <h2 id={`round-${number}`} className="font-serif text-xl font-semibold tracking-tight">
                {roundHeading(number, round.title)}
              </h2>
              <ol aria-label={questionsLabel(number)} className="mt-4 list-decimal space-y-3 pl-6">
                {round.questions.map((item) => (
                  <li key={item.question} className="pl-1">
                    {item.question}
                  </li>
                ))}
              </ol>
              <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">
                {ANSWERS_HEADING}
              </h3>
              <ol aria-label={answersLabel(number)} className="mt-2 list-decimal space-y-1 pl-6">
                {round.questions.map((item) => (
                  <li key={item.question} className="pl-1">
                    {item.answer}
                  </li>
                ))}
              </ol>
            </section>
          );
        })}

        <section
          aria-labelledby="quiz-cta"
          className="print-chrome mt-12 rounded-2xl border border-line bg-background p-6 md:grid md:grid-cols-2 md:items-center md:gap-8"
        >
          <div>
            <h2 id="quiz-cta" className="font-serif text-xl font-semibold tracking-tight">
              {quiz.cta.heading}
            </h2>
            {quiz.cta.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-muted">
                {paragraph}
              </p>
            ))}
            <Link
              href="/create"
              className="mt-5 inline-flex h-12 items-center rounded-xl bg-amber px-6 text-sm font-semibold text-white hover:bg-amber-hover"
            >
              {quiz.cta.button}
            </Link>
          </div>
          <Image
            src={PRINTED_SHEETS_IMAGE.src}
            width={PRINTED_SHEETS_IMAGE.width}
            height={PRINTED_SHEETS_IMAGE.height}
            alt={PRINTED_SHEETS_IMAGE.alt}
            sizes="(min-width: 768px) 340px, 100vw"
            className="mt-6 h-auto w-full rounded-xl border border-line md:mt-0"
          />
        </section>
      </main>
    </>
  );
}
