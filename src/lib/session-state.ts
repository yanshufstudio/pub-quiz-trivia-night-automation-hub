import type { Prisma } from "@prisma/client";

export const SESSION_STATUS = {
  LOBBY: "LOBBY",
  QUESTION_ACTIVE: "QUESTION_ACTIVE",
  REVEAL: "REVEAL",
  ENDED: "ENDED",
} as const;

export type SessionStatus = (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];

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
