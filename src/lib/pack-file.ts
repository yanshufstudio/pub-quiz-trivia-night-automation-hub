import { z } from "zod";
import { degradeInvalidMultipleChoice, generatedQuestionFields, generatedRoundSchema } from "@/lib/quiz-schema";
import type { Pack, Question, Round } from "@/lib/api-types";
import { MEDIA_MIME } from "@/lib/media";
import { QUESTION_TYPE } from "@/lib/question-types";

/**
 * The portable pack file: what `GET /api/packs/[id]/export` writes and
 * `POST /api/packs/import` reads. Same shape the generator produces
 * (`generatedPackSchema`), plus a format/version envelope and the host's
 * `acceptableAnswers`, and minus anything database-specific (ids, indexes,
 * timestamps) so a file can be re-imported anywhere, any number of times.
 *
 * Version 2 (2026-09-13) adds an optional per-question `image`: the same
 * base64 a browser's FileReader would produce, decoded and put through
 * `prepareImageForStorage` — the exact function an upload goes through — on
 * import (see `POST /api/packs/import`). `POST /api/packs/import` is
 * unauthenticated, so a pack file's `image` field is exactly as hostile as an
 * upload's body and gets exactly the same check, never a lighter one. A v1
 * file (no `image` anywhere) still reads: the field is optional, and a v1
 * file's literal `version: 1` still matches the schema below.
 */
export const PACK_FILE_FORMAT = "pub-quiz-pack";
export const PACK_FILE_VERSION = 2;

const fileImageSchema = z.object({
  mime: z.enum([MEDIA_MIME.JPEG, MEDIA_MIME.PNG]),
  // Base64, no data: prefix — validated for real (magic bytes, dimensions,
  // decodability) only after decoding, in the import route. A string that
  // merely fails to base64-decode is treated the same as an image that fails
  // that later validation: dropped, not a reason to fail the whole import.
  data: z.string().min(1),
});

const fileQuestionSchema = generatedQuestionFields
  .extend({
    acceptableAnswers: z.array(z.string().min(1)).max(20).optional(),
    image: fileImageSchema.optional(),
  })
  .transform(degradeInvalidMultipleChoice);

export const packFileSchema = z.object({
  format: z.literal(PACK_FILE_FORMAT),
  // Only versions this build actually understands. A newer, unlisted version
  // may carry fields this build would silently drop, so refuse it rather
  // than import a lossy copy.
  version: z.union([z.literal(1), z.literal(2)]),
  title: z.string().min(1),
  prompt: z.string().optional(),
  rounds: z
    .array(
      generatedRoundSchema.extend({
        questions: z.array(fileQuestionSchema).min(1),
      })
    )
    .min(1),
});

export type PackFile = z.infer<typeof packFileSchema>;

type ExportableQuestion = Question & {
  /** Only present when the caller's query actually fetched the bytes (the
   * lightweight `hasMedia`-only shape most reads use never has this) — see
   * packWithRoundsAndMediaArgs in session-state.ts, which the export route
   * uses for exactly this reason. */
  media?: { mime: string; bytes: Uint8Array } | null;
};

export function toPackFile(pack: Omit<Pack, "rounds"> & { rounds: (Omit<Round, "questions"> & { questions: ExportableQuestion[] })[] }): PackFile {
  return {
    format: PACK_FILE_FORMAT,
    version: PACK_FILE_VERSION,
    title: pack.title,
    prompt: pack.prompt || undefined,
    rounds: pack.rounds.map((round) => ({
      title: round.title,
      category: round.category,
      questions: round.questions.map((q) => ({
        text: q.text,
        answer: q.answer,
        points: q.points,
        type: q.type,
        ...(q.type === QUESTION_TYPE.MULTIPLE_CHOICE ? { options: q.options } : {}),
        ...(q.acceptableAnswers.length > 0 ? { acceptableAnswers: q.acceptableAnswers } : {}),
        // The cast is safe: every QuestionMedia row's mime was itself set
        // from MEDIA_MIME by prepareImageForStorage (upload or a prior
        // import) — there is no path that stores anything else.
        ...(q.media
          ? {
              image: {
                mime: q.media.mime as typeof MEDIA_MIME.JPEG | typeof MEDIA_MIME.PNG,
                data: Buffer.from(q.media.bytes).toString("base64"),
              },
            }
          : {}),
      })),
    })),
  };
}
