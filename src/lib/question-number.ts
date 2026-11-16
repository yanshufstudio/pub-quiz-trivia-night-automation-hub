import type { Translator } from "@/i18n";

/**
 * How every screen names a question: "Round 2 · Q5", or "Round 2 · Q5 of 10".
 * One helper, so the host desk, the phones and the TV can never disagree about
 * which question is which (RM6).
 */
export function questionLabel(t: Translator, roundNumber: number, questionNumber: number, ofTotal?: number): string {
  const params = { round: roundNumber, question: questionNumber };
  return ofTotal === undefined
    ? t("common.questionLabel", params)
    : t("common.questionLabelOf", { ...params, total: ofTotal });
}
