/**
 * One public quiz page (/quizzes/<slug>). A page is one `Quiz` object in its
 * own module plus a picture; nothing else needs to change. The route, the
 * sitemap and the tests all read the list in `./index.ts`.
 */

export type QuizImage = {
  /** Path under /public. Also the page's og:image and twitter image. */
  url: string;
  width: number;
  height: number;
  alt: string;
};

export type QuizQuestion = {
  question: string;
  answer: string;
};

export type QuizRound = {
  /** Without the "Round n: " prefix; the page adds that. */
  title: string;
  questions: QuizQuestion[];
};

export type Quiz = {
  /** The URL segment: /quizzes/<slug>. Lower case, letters, digits and hyphens. */
  slug: string;
  /** The <title>, exactly. The root layout has no title template, so no suffix is added. */
  title: string;
  /** The meta description, exactly. */
  description: string;
  /** The page's H1. */
  heading: string;
  intro: string;
  /** The graphic at the top of the page. */
  image: QuizImage;
  rounds: QuizRound[];
  /** The call to action under the rounds. */
  cta: {
    heading: string;
    paragraphs: string[];
    button: string;
  };
};
