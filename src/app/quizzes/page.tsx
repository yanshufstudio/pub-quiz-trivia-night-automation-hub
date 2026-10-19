import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { QUIZZES, quizPath } from "@/content/quizzes";
import { QUIZZES_HUB } from "@/content/quizzes/page-copy";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = pageMetadata({
  path: "/quizzes",
  title: QUIZZES_HUB.title,
  description: QUIZZES_HUB.description,
});

/**
 * The page that lists the public quiz pages (/quizzes/<slug>). It reads
 * QUIZZES, so a new quiz page appears here with no change to this file.
 *
 * Static and public, like the quiz pages: it takes no session and says nothing
 * a signed-out visitor cannot see. No pictures; it shares the site card.
 */
export default function QuizzesPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{QUIZZES_HUB.heading}</h1>
        <p className="mt-3 text-muted">{QUIZZES_HUB.intro}</p>

        <ul className="mt-10 space-y-8">
          {QUIZZES.map((quiz) => (
            <li key={quiz.slug}>
              <h2 className="font-serif text-xl font-semibold tracking-tight">
                <Link href={quizPath(quiz)} className="-my-2 inline-block py-2 hover:text-amber hover:underline">
                  {quiz.heading}
                </Link>
              </h2>
              <p className="mt-1 text-muted">{quiz.intro}</p>
            </li>
          ))}
        </ul>

        <Link
          href="/create"
          className="mt-12 inline-flex h-12 items-center rounded-xl bg-amber px-6 text-sm font-semibold text-white hover:bg-amber-hover"
        >
          {QUIZZES_HUB.button}
        </Link>
      </main>
    </>
  );
}
