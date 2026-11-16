import type { Translator } from "@/i18n";

/**
 * The three printed sheets, in Print preview's tab order. Each sheet has one
 * name (print.sheets in the message files), used wherever it is shown: its tab
 * and heading in Print preview, and the print page's title.
 */
export const PRINT_SHEETS = ["script", "answers", "questions"] as const;

export type PrintSheet = (typeof PRINT_SHEETS)[number];

/** The print page's title. A PDF saved from the print window is named after it. */
export function printPageTitle(t: Translator, packTitle: string, sheet: PrintSheet): string {
  return t("print.pageTitle", { pack: packTitle, sheet: t(`print.sheets.${sheet}`) });
}
