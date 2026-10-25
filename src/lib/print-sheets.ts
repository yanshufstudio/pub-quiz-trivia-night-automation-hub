/**
 * The three printed sheets, in Print preview's tab order. Each sheet has one
 * name, used wherever it is shown: its tab and heading in Print preview, the
 * print page's title, and the kicker on its PDF. The keys are the PDF
 * route's `?type=` values.
 */
export const PRINT_SHEETS = {
  script: "Presenter script",
  answers: "Host answer key",
  questions: "Team answer sheet",
} as const;

export type PrintSheet = keyof typeof PRINT_SHEETS;

/** The print page's title. A PDF saved from the print window is named after it. */
export function printPageTitle(packTitle: string, sheet: PrintSheet): string {
  return `${packTitle} · ${PRINT_SHEETS[sheet]}`;
}
