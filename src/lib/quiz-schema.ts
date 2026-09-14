import { z } from "zod";
import { isValidOptionSet, QUESTION_TYPE } from "@/lib/question-types";

// The field set on its own, so the portable pack file (src/lib/pack-file.ts)
// can extend it before applying the same degrade-to-TEXT rule below.
export const generatedQuestionFields = z.object({
  text: z.string().min(1),
  answer: z.string().min(1),
  points: z.number().int().min(1).max(10).default(1),
  type: z.enum([QUESTION_TYPE.TEXT, QUESTION_TYPE.MULTIPLE_CHOICE]).default(QUESTION_TYPE.TEXT),
  options: z.array(z.string().min(1)).max(6).optional(),
});

// A multiple-choice question whose option set is unusable (too few
// distinct options, or none of them is the answer) is still a perfectly
// good free-text question: the answer is known. Degrade it to TEXT rather
// than reject it — rejecting threw away the *entire* generated pack for one
// malformed question, and did so deterministically for some prompts.
export function degradeInvalidMultipleChoice<
  T extends { type: string; answer: string; options?: string[] | undefined },
>(q: T): T {
  return q.type === QUESTION_TYPE.MULTIPLE_CHOICE && !isValidOptionSet(q.options ?? [], q.answer)
    ? { ...q, type: QUESTION_TYPE.TEXT, options: undefined }
    : q;
}

export const generatedQuestionSchema = generatedQuestionFields.transform(degradeInvalidMultipleChoice);

export const generatedRoundSchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  questions: z.array(generatedQuestionSchema).min(1),
});

// The pack title is cosmetic, and the model omits it (or sends whitespace)
// in roughly two of five generations even though the tool schema marks it
// required. Rejecting the whole pack over it turned a 20-second, 40-question
// generation into a 502. Fall back to the round titles instead.
export const generatedPackSchema = z
  .object({
    title: z.string().trim().optional(),
    rounds: z.array(generatedRoundSchema).min(1),
  })
  .transform((pack) => ({
    ...pack,
    title: pack.title || pack.rounds.map((round) => round.title).join(" · "),
  }));

export type GeneratedPack = z.infer<typeof generatedPackSchema>;
export type GeneratedRound = z.infer<typeof generatedRoundSchema>;
export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

export const wizardRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
});

/**
 * Lenient counterpart to `generatedPackSchema`, for a model response that
 * strict parsing rejects outright.
 *
 * `generatedPackSchema` is all-or-nothing: one unusable question anywhere in
 * the response discards the whole pack, which is how a 40-question, 25-second
 * generation turns into a 502 the user can do nothing about. The dominant
 * cause is truncation — the model hits `max_tokens` part-way through the tool
 * call, so the final question (and sometimes the final round) arrives half
 * written while everything before it is perfectly good.
 *
 * So: validate question by question and keep what survives, applying the same
 * degrade-don't-reject rules as the strict path (`generatedQuestionSchema`
 * already downgrades a broken multiple-choice question to free text). A round
 * left with no usable questions is dropped; a missing round title or category
 * is filled in rather than fatal, for the same reason the pack title is.
 *
 * Returns null only when nothing at all is recoverable — no rounds array, or
 * every round empty — which is the one case the caller must still fail on.
 */
export type SalvagedPack = {
  pack: GeneratedPack;
  droppedQuestions: number;
  droppedRounds: number;
};

const salvageRoundShape = z.object({
  title: z.string().trim().optional(),
  category: z.string().trim().optional(),
  questions: z.array(z.unknown()).optional(),
});

export function salvageGeneratedPack(input: unknown): SalvagedPack | null {
  const outer = z
    .object({ title: z.string().trim().optional(), rounds: z.array(z.unknown()) })
    .safeParse(input);
  if (!outer.success) return null;

  let droppedQuestions = 0;
  let droppedRounds = 0;
  const rounds: GeneratedRound[] = [];

  outer.data.rounds.forEach((rawRound, index) => {
    const round = salvageRoundShape.safeParse(rawRound);
    if (!round.success) {
      droppedRounds += 1;
      return;
    }

    const questions: GeneratedQuestion[] = [];
    for (const rawQuestion of round.data.questions ?? []) {
      const question = generatedQuestionSchema.safeParse(rawQuestion);
      if (question.success) questions.push(question.data);
      else droppedQuestions += 1;
    }

    // A round with no questions left can't be presented or scored, so it goes
    // — but its questions are already counted above, not double-counted here.
    if (questions.length === 0) {
      droppedRounds += 1;
      return;
    }

    const title = round.data.title || `Round ${index + 1}`;
    rounds.push({ title, category: round.data.category || title, questions });
  });

  if (rounds.length === 0) return null;

  return {
    pack: { title: outer.data.title || rounds.map((round) => round.title).join(" · "), rounds },
    droppedQuestions,
    droppedRounds,
  };
}
