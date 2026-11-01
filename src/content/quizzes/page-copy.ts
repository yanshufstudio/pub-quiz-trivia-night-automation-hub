/**
 * The words on a quiz page that are the same for every quiz. Kept apart from
 * the route so the unit test can check them for the same things it checks the
 * quiz data for.
 */

export const PRINT_BUTTON_LABEL = "Print these rounds";

export const ANSWERS_HEADING = "Answers";

export function roundHeading(roundNumber: number, title: string): string {
  return `Round ${roundNumber}: ${title}`;
}

/** Accessible names for the two numbered lists in a round. */
export function questionsLabel(roundNumber: number): string {
  return `Round ${roundNumber} questions`;
}

export function answersLabel(roundNumber: number): string {
  return `Round ${roundNumber} answers`;
}

/**
 * The /quizzes page (src/app/quizzes/page.tsx). Marketing's "trivia" wording,
 * 31 Oct 2026.
 */
export const QUIZZES_HUB = {
  title: "Free trivia questions and answers: ready-made rounds for your trivia night",
  description:
    "Ready-made trivia rounds with answers for seasonal trivia nights. Free to use and to print. Or make your own trivia night in minutes.",
  heading: "Free trivia questions and answers",
  intro: "Ready-made rounds for seasonal trivia nights, free to use and to print.",
  button: "Make your own trivia night",
} as const;

/** public/quizzes/printed-sheets.webp, shown beside the call to action. */
export const PRINTED_SHEETS_IMAGE = {
  src: "/quizzes/printed-sheets.webp",
  width: 1920,
  height: 1080,
  alt: "Three printed sheets from a TriviaFoundry pack: the presenter script, the host answer key and a team answer sheet.",
} as const;
