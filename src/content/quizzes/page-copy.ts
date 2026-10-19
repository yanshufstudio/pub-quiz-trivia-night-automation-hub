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
 * The /quizzes page (src/app/quizzes/page.tsx). Draft wording: marketing reads
 * it on the preview before it is final.
 */
export const QUIZZES_HUB = {
  title: "Free quiz questions and answers: ready-made rounds for your quiz night",
  description:
    "Ready-made quiz rounds with answers for seasonal quiz nights. Free to use and to print. Or make your own quiz in minutes.",
  heading: "Free quiz questions and answers",
  intro: "Ready-made rounds for seasonal quiz nights, free to use and to print.",
  button: "Make your own quiz",
} as const;

/** public/quizzes/printed-sheets.webp, shown beside the call to action. */
export const PRINTED_SHEETS_IMAGE = {
  src: "/quizzes/printed-sheets.webp",
  width: 1920,
  height: 1080,
  alt: "Three printed sheets from a TriviaFoundry pack: the presenter script, the host answer key and a team question sheet.",
} as const;
