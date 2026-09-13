export const QUESTION_TYPE = {
  TEXT: "TEXT",
  MULTIPLE_CHOICE: "MULTIPLE_CHOICE",
} as const;

export type QuestionType = (typeof QUESTION_TYPE)[keyof typeof QUESTION_TYPE];

/**
 * Question.options is stored as a JSON-encoded string (plain TEXT column —
 * SQLite has no native array/JSON type, and nothing here ever needs to query
 * inside the list, only read or write it whole). This parses it back,
 * defensively: a TEXT question's null, or any malformed/pre-migration data,
 * just yields no options rather than throwing.
 */
export function parseOptions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((o): o is string => typeof o === "string") : [];
  } catch {
    return [];
  }
}

export function serializeOptions(options: string[]): string {
  return JSON.stringify(options);
}

/** True when `options` is a valid choice set for a multiple-choice question:
 * at least 2 distinct, non-blank options, one of which is the answer.
 * Both sides are trimmed: the model occasionally emits stray whitespace on
 * the answer, and that must not disqualify an otherwise-correct option set. */
export function isValidOptionSet(options: string[], answer: string): boolean {
  const cleaned = Array.from(new Set(options.map((o) => o.trim()).filter(Boolean)));
  return cleaned.length >= 2 && cleaned.includes(answer.trim());
}

/** Maps a raw Question row (Prisma's `type`/`options`/`acceptableAnswers`
 * are plain `string` / `string | null`, not the narrower client-facing
 * shape) to the api-types.ts view: `type` narrowed, both list columns
 * parsed. `acceptableAnswers` is optional on the input so callers that
 * don't carry the column (older fixtures, tests) still type-check; it's
 * always present, parsed, on the output.
 *
 * The `media` relation is *consumed* here rather than passed through: image
 * bytes must never ride along in a pack payload, so this drops the relation
 * and leaves a `hasMedia` flag in its place. A caller that doesn't
 * `include` the relation gets `hasMedia: false` — include
 * `media: { select: { id: true } }` on any query whose result is meant to
 * answer that question. */
export function toQuestionView<
  T extends { type: string; options: string | null; acceptableAnswers?: string | null; media?: { id: string } | null },
>(
  question: T
): Omit<T, "options" | "acceptableAnswers" | "media"> & {
  type: QuestionType;
  options: string[];
  acceptableAnswers: string[];
  hasMedia: boolean;
} {
  const { media, ...rest } = question;
  return {
    // The cast only drops the two keys the object literal below replaces —
    // TS narrows `rest` to Omit<T, "media"> and won't infer that overwriting
    // `options`/`acceptableAnswers` removes their original types.
    ...(rest as Omit<T, "options" | "acceptableAnswers" | "media">),
    type: question.type as QuestionType,
    options: parseOptions(question.options),
    acceptableAnswers: parseOptions(question.acceptableAnswers ?? null),
    hasMedia: media != null,
  };
}
