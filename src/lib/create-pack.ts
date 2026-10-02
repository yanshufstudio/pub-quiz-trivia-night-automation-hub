import { db } from "@/lib/db";
import type { GeneratedPack } from "@/lib/quiz-schema";
import { isValidOptionSet, QUESTION_TYPE, serializeOptions } from "@/lib/question-types";

// Questions may carry host-approved alternates (a re-imported pack file
// does; freshly generated packs don't), so accept them optionally here.
type QuestionInput = GeneratedPack["rounds"][number]["questions"][number] & {
  acceptableAnswers?: string[];
};
type PackInput = Omit<GeneratedPack, "rounds"> & {
  rounds: (Omit<GeneratedPack["rounds"][number], "questions"> & { questions: QuestionInput[] })[];
};

/** What the accuracy review (ACC2) recorded about a generated pack. Import
 * and the demo pass none, which leaves every field NULL. */
export type PackReviewRecord = {
  status: "checked" | "not_checked";
  fixed: number;
  dropped: number;
  /** JSON, for support: which questions changed and why, or why no review. */
  notes: string;
};

/** `creatorId` null makes an ownerless pack: listed for everyone, editable by
 * no one (see src/lib/pack-access.ts). The seeded demo pack is the one
 * intended case; generate and import always pass a real creator. */
export async function createPackFromGenerated(
  generated: PackInput,
  prompt: string,
  creatorId: string | null = null,
  review?: PackReviewRecord
) {
  return db.quizPack.create({
    data: {
      title: generated.title,
      prompt,
      creatorId,
      ...(review
        ? {
            reviewStatus: review.status,
            reviewFixed: review.fixed,
            reviewDropped: review.dropped,
            reviewNotes: review.notes,
          }
        : {}),
      rounds: {
        create: generated.rounds.map((round, roundIndex) => ({
          index: roundIndex,
          title: round.title,
          category: round.category,
          questions: {
            create: round.questions.map((question, questionIndex) => ({
              index: questionIndex,
              text: question.text,
              answer: question.answer,
              points: question.points,
              // GH3: a usable option set is a multiple-choice question whatever
              // it was typed; without one it is free text, as before.
              ...(isValidOptionSet(question.options ?? [], question.answer)
                ? { type: QUESTION_TYPE.MULTIPLE_CHOICE, options: serializeOptions(question.options ?? []) }
                : { type: QUESTION_TYPE.TEXT, options: null }),
              acceptableAnswers:
                question.acceptableAnswers && question.acceptableAnswers.length > 0
                  ? serializeOptions(question.acceptableAnswers)
                  : null,
            })),
          },
        })),
      },
    },
    include: { rounds: { include: { questions: true }, orderBy: { index: "asc" } } },
  });
}
