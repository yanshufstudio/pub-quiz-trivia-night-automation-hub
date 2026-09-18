/**
 * Fold an answer down to the form two answers are compared in.
 *
 * The old implementation ended with `.replace(/[^a-z0-9\s]/g, "")`, an
 * ASCII-only class that deleted every other character outright rather than
 * just punctuation. A Hebrew quiz was the worst case: "ירושלים", "!!!" and ""
 * all came out as "", so every team matched every other team *and* a blank
 * answer box scored correct; "תל אביב" and "באר שבע" both came out as a
 * single space. Latin script was quietly damaged too — "café" lost its é and
 * became "caf", so a team typing "cafe" was marked wrong.
 *
 * So: decompose (NFKD), drop the combining marks that decomposition leaves
 * behind, and keep letters and digits in *any* script rather than in one.
 */
export function normalizeAnswer(raw: string): string {
  return (
    raw
      .normalize("NFKD")
      .toLowerCase()
      // The marks NFKD just split off: the acute in "café", and Hebrew
      // niqqud, which a host may type and a team almost never does.
      .replace(/\p{M}/gu, "")
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      // After the punctuation strip, not before it. Running first, this saw
      // the opening quote of a quoted `"The Beatles"` rather than the "the",
      // left the article in place, and stopped it matching a bare "Beatles".
      .replace(/^(a|an|the)\s+/, "")
  );
}

/** True when `submitted` normalizes to match `correct`, or any of the
 * question's host-approved `acceptableAnswers` — alternate spellings,
 * nicknames, or partial names ("7" for "Seven", "Leo" for "Leonardo
 * DiCaprio") that would otherwise score wrong until manually overridden. */
export function isLikelyCorrect(submitted: string, correct: string, acceptableAnswers: string[] = []): boolean {
  const normalizedSubmitted = normalizeAnswer(submitted);
  // Nothing matches nothing. An answer that normalizes away to nothing —
  // all punctuation, or (before the fix above) anything not written in the
  // Latin alphabet — used to match every other such answer, which is how a
  // Hebrew quiz scored an empty answer box correct.
  if (normalizedSubmitted === "") return false;
  if (normalizedSubmitted === normalizeAnswer(correct)) return true;
  return acceptableAnswers.some((answer) => normalizeAnswer(answer) === normalizedSubmitted);
}
