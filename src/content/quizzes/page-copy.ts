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

/** public/quizzes/printed-sheets.webp, shown beside the call to action. */
export const PRINTED_SHEETS_IMAGE = {
  src: "/quizzes/printed-sheets.webp",
  width: 1920,
  height: 1080,
  alt: "Three printed sheets from a TriviaFoundry pack: the presenter script, the host answer key and a team question sheet.",
} as const;
