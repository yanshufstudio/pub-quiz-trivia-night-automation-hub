import { halloween } from "./halloween";
import type { Quiz } from "./types";

export type { Quiz, QuizImage, QuizQuestion, QuizRound } from "./types";

/**
 * Every public quiz page, in the order they are listed. The route
 * (src/app/quizzes/[slug]/page.tsx) builds its static pages from this list and
 * 404s any slug not in it; sitemap.ts lists the same slugs. Adding a page is
 * one module in this folder, one line here and the picture under
 * public/quizzes.
 */
export const QUIZZES: readonly Quiz[] = [halloween];

export function getQuiz(slug: string): Quiz | undefined {
  return QUIZZES.find((quiz) => quiz.slug === slug);
}

export function quizPath(quiz: Quiz): string {
  return `/quizzes/${quiz.slug}`;
}
