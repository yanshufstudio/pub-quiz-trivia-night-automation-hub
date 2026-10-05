/**
 * How every screen names a question: "Round 2 · Q5", or "Round 2 · Q5 of 10".
 * One helper, so the host desk, the phones and the TV can never disagree about
 * which question is which (RM6).
 */
export function questionLabel(roundNumber: number, questionNumber: number, ofTotal?: number): string {
  const base = `Round ${roundNumber} · Q${questionNumber}`;
  return ofTotal === undefined ? base : `${base} of ${ofTotal}`;
}
