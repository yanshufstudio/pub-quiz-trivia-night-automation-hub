import type { Prisma } from "@prisma/client";

export const SESSION_STATUS = {
  LOBBY: "LOBBY",
  QUESTION_ACTIVE: "QUESTION_ACTIVE",
  REVEAL: "REVEAL",
  ENDED: "ENDED",
} as const;

export type SessionStatus = (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];

/**
 * How many times one team may submit an answer to one question.
 *
 * Submissions upsert a single row, so a resubmission is a correction, not an
 * extra answer — a team fixing a typo or changing its mind is normal and must
 * keep working. What is not normal is the loop that used to read the scoreboard
 * back after each try; that is closed at the source (see computeScoreboard),
 * and this is the second lock on the same door, plus a bound on how many
 * writes one team can aim at the database during a single question.
 *
 * Five is enough for a phone keyboard and an autocorrect fight, and useless
 * for anything else: a multiple-choice question has at most six options, and
 * submitting them all now tells the team nothing, because only the last one
 * stands and no score moves until the reveal.
 *
 * The window only has to outlast a question. Keying the bucket on the round
 * and question index is what makes the allowance per question; the window is
 * the backstop for a question left open unusually long.
 */
export const ANSWER_SUBMISSIONS_PER_QUESTION = 5;
export const ANSWER_SUBMISSION_WINDOW_MS = 60 * 60 * 1000;

const packWithRounds = {
  include: {
    rounds: {
      orderBy: { index: "asc" },
      // Just the id, never the bytes: this is the shape a live session polls
      // on every host/team refresh, so it stays cheap however many images the
      // pack carries. It's enough for a `hasMedia` flag — see toQuestionView
      // in question-types.ts, which is what turns this into that flag.
      include: { questions: { orderBy: { index: "asc" }, include: { media: { select: { id: true } } } } },
    },
  },
} satisfies Prisma.QuizPackDefaultArgs;

export type PackWithRounds = Prisma.QuizPackGetPayload<typeof packWithRounds>;
export const packWithRoundsArgs = packWithRounds;

// The PDF and pack-export routes are the two places that legitimately need
// the actual bytes (to inline as a data: URI — see src/lib/media.ts and the
// SSRF note there for why it's never a URL). This is intentionally a
// *separate* query shape from packWithRoundsArgs above, rather than the
// default everywhere: a live session poll has no reason to pull image bytes
// on every request.
const packWithRoundsAndMedia = {
  include: {
    rounds: {
      orderBy: { index: "asc" },
      include: { questions: { orderBy: { index: "asc" }, include: { media: true } } },
    },
  },
} satisfies Prisma.QuizPackDefaultArgs;

export type PackWithRoundsAndMedia = Prisma.QuizPackGetPayload<typeof packWithRoundsAndMedia>;
export const packWithRoundsAndMediaArgs = packWithRoundsAndMedia;

export function getCurrentRound(pack: PackWithRounds, roundIndex: number) {
  return pack.rounds[roundIndex] ?? null;
}

export function getCurrentQuestion(pack: PackWithRounds, roundIndex: number, questionIndex: number) {
  const round = getCurrentRound(pack, roundIndex);
  if (!round) return null;
  return round.questions[questionIndex] ?? null;
}

/** Returns the next {roundIndex, questionIndex}, or null if the quiz is over. */
export function computeNextPosition(
  pack: PackWithRounds,
  roundIndex: number,
  questionIndex: number
): { roundIndex: number; questionIndex: number } | null {
  const round = getCurrentRound(pack, roundIndex);
  if (!round) return null;

  if (questionIndex + 1 < round.questions.length) {
    return { roundIndex, questionIndex: questionIndex + 1 };
  }
  if (roundIndex + 1 < pack.rounds.length) {
    return { roundIndex: roundIndex + 1, questionIndex: 0 };
  }
  return null;
}
