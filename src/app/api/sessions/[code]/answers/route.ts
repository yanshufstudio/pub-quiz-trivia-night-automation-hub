import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Session } from "@prisma/client";
import { db } from "@/lib/db";
import {
  ANSWER_SUBMISSIONS_PER_QUESTION,
  ANSWER_SUBMISSION_WINDOW_MS,
  SESSION_MODE,
  SESSION_STATUS,
  getCurrentQuestion,
  packWithRoundsArgs,
  type PackWithRounds,
} from "@/lib/session-state";
import { rateLimit } from "@/lib/rate-limit";
import { autoRevealIfExpired } from "@/lib/session-timer";
import { isLikelyCorrect } from "@/lib/scoring";
import { parseOptions, QUESTION_TYPE } from "@/lib/question-types";

const submitSchema = z.object({
  token: z.string().min(1),
  // Trimmed first: a run of spaces is not an answer, and storing one gave
  // the host a blank submission row to puzzle over.
  text: z.string().max(500).transform((t) => t.trim()).pipe(z.string().min(1).max(500)),
  // Round mode: which of the round's asked questions this answers. A
  // one-question-at-a-time session ignores it — there is only ever one.
  questionIndex: z.number().int().min(0).max(1000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = await req.json().catch(() => null);
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid answer" }, { status: 400 });
  }

  let session = await db.session.findUnique({ where: { code: code.toUpperCase() } });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  // A submission racing the timer's expiry should lose: check (and, if
  // needed, apply) the auto-reveal first so a request that arrives just past
  // the deadline is rejected instead of quietly scoring after time's up.
  session = await autoRevealIfExpired(session);
  if (session.mode === SESSION_MODE.ROUND) {
    return submitRoundAnswer(req, session, parsed.data);
  }
  if (session.status !== SESSION_STATUS.QUESTION_ACTIVE) {
    return NextResponse.json({ error: "This question is no longer accepting answers" }, { status: 409 });
  }

  const team = await db.team.findUnique({ where: { token: parsed.data.token } });
  if (!team || team.sessionId !== session.id) {
    return NextResponse.json({ error: "Invalid team token" }, { status: 401 });
  }

  const pack = (await db.quizPack.findUnique({
    where: { id: session.packId },
    ...packWithRoundsArgs,
  })) as PackWithRounds | null;
  const question = pack
    ? getCurrentQuestion(pack, session.currentRoundIndex, session.currentQuestionIndex)
    : null;
  if (!question) {
    return NextResponse.json({ error: "No active question" }, { status: 409 });
  }

  // Counted against the team, not the caller's IP: every team in the room is
  // behind the pub's one address, so an IP bucket would let the first team to
  // answer lock out the rest. The key carries the round and question index, so
  // the allowance is per question and a new question starts a fresh one.
  const submissions = await rateLimit(
    req,
    `answers:${session.currentRoundIndex}:${session.currentQuestionIndex}`,
    {
      limit: ANSWER_SUBMISSIONS_PER_QUESTION,
      windowMs: ANSWER_SUBMISSION_WINDOW_MS,
      identity: team.id,
    }
  );
  if (!submissions.allowed) {
    return NextResponse.json(
      { error: `You can change your answer up to ${ANSWER_SUBMISSIONS_PER_QUESTION} times for a question.` },
      { status: 429, headers: { "Retry-After": String(submissions.retryAfterSeconds) } }
    );
  }

  const text = parsed.data.text.trim();

  // A multiple-choice submission must be one of the actual options — this
  // isn't about trusting the client's UI (it can't be bypassed to submit
  // arbitrary text through this route), it's the same closed-choice contract
  // the question itself defines.
  if (question.type === QUESTION_TYPE.MULTIPLE_CHOICE) {
    const options = parseOptions(question.options);
    if (!options.includes(text)) {
      return NextResponse.json({ error: "Answer must be one of the question's options" }, { status: 400 });
    }
  }

  const isCorrect = isLikelyCorrect(text, question.answer, parseOptions(question.acceptableAnswers));
  const pointsAwarded = isCorrect ? question.points : 0;

  /**
   * The write, conditional on the question still being open (L3).
   *
   * The status check at the top of this route is several awaits away from here —
   * a team lookup, a pack read and a rate-limit round trip in between — and the
   * host can reveal inside that gap. Two things went wrong as a result: an answer
   * could be scored after time was up, and a resubmission could overwrite a mark
   * the host had just set by hand at the reveal.
   *
   * So the session is re-read inside a transaction and the write only happens if
   * it is still QUESTION_ACTIVE *at the same position*. The position matters as
   * well as the status: a host who reveals and advances lands back on
   * QUESTION_ACTIVE, and without it a submission for the previous question would
   * be accepted against the new one.
   *
   * The `hostOverride` check is belt and braces. A host can only override from the
   * reveal onwards, which the status check already excludes — but "the UI does not
   * send that yet" is not a guarantee, and a human's mark should not be
   * overwritable by a race.
   */
  const written = await db.$transaction(async (tx) => {
    const fresh = await tx.session.findUnique({
      where: { id: session.id },
      select: { status: true, currentRoundIndex: true, currentQuestionIndex: true },
    });
    if (
      !fresh ||
      fresh.status !== SESSION_STATUS.QUESTION_ACTIVE ||
      fresh.currentRoundIndex !== session.currentRoundIndex ||
      fresh.currentQuestionIndex !== session.currentQuestionIndex
    ) {
      return null;
    }

    const existing = await tx.answer.findUnique({
      where: {
        teamId_roundIndex_questionIndex: {
          teamId: team.id,
          roundIndex: session.currentRoundIndex,
          questionIndex: session.currentQuestionIndex,
        },
      },
      select: { hostOverride: true },
    });
    if (existing?.hostOverride) return null;

    return tx.answer.upsert({
      where: {
        teamId_roundIndex_questionIndex: {
          teamId: team.id,
          roundIndex: session.currentRoundIndex,
          questionIndex: session.currentQuestionIndex,
        },
      },
      update: { text, isCorrect, pointsAwarded },
      create: {
        sessionId: session.id,
        teamId: team.id,
        roundIndex: session.currentRoundIndex,
        questionIndex: session.currentQuestionIndex,
        text,
        isCorrect,
        pointsAwarded,
      },
    });
  });

  if (!written) {
    // The same answer the top of the route gives, because it is the same fact:
    // this question stopped accepting answers. It just stopped a moment later.
    return NextResponse.json({ error: "This question is no longer accepting answers" }, { status: 409 });
  }

  return NextResponse.json({ answer: { id: written.id, text: written.text } }, { status: 201 });
}

const ROUND_CLOSED = "This round is no longer accepting answers";

/**
 * An answer in a round-mode game (RM2).
 *
 * Every question the host has asked in the current round stays open until the
 * host closes the round, so a team can answer them in any order and change any
 * of them — the latest submission for a question is the one that stands. A
 * question not yet asked cannot be answered: nothing about it has been sent to
 * the team, and accepting a guess would let a team "answer" ahead by index.
 *
 * The same guards as the one-question flow, moved from "this question" to "this
 * round": the allowance is still per question (the bucket key carries the
 * question index), and the write is still conditional on a fresh read — the
 * round still open, the same round, the question still among those asked — so a
 * submission racing the close cannot land after it.
 */
async function submitRoundAnswer(
  req: NextRequest,
  session: Session,
  body: { token: string; text: string; questionIndex?: number }
) {
  const questionIndex = body.questionIndex;
  if (questionIndex === undefined) {
    return NextResponse.json({ error: "Which question is this answer for?" }, { status: 400 });
  }
  if (session.status !== SESSION_STATUS.ROUND_OPEN) {
    return NextResponse.json({ error: ROUND_CLOSED }, { status: 409 });
  }

  const team = await db.team.findUnique({ where: { token: body.token } });
  if (!team || team.sessionId !== session.id) {
    return NextResponse.json({ error: "Invalid team token" }, { status: 401 });
  }
  if (team.isPaper) {
    // A paper team's token is never handed out, so this is not a path a real
    // phone takes — but a paper team's score is the host's typed total, and a
    // stray write must not start counting beside it.
    return NextResponse.json({ error: "This team plays on paper" }, { status: 403 });
  }
  if (questionIndex >= session.askedCount) {
    return NextResponse.json({ error: "That question hasn't been asked yet" }, { status: 409 });
  }

  const roundIndex = session.currentRoundIndex;
  const pack = (await db.quizPack.findUnique({
    where: { id: session.packId },
    ...packWithRoundsArgs,
  })) as PackWithRounds | null;
  const question = pack ? getCurrentQuestion(pack, roundIndex, questionIndex) : null;
  if (!question) {
    return NextResponse.json({ error: "No such question" }, { status: 409 });
  }

  const submissions = await rateLimit(req, `answers:${roundIndex}:${questionIndex}`, {
    limit: ANSWER_SUBMISSIONS_PER_QUESTION,
    windowMs: ANSWER_SUBMISSION_WINDOW_MS,
    identity: team.id,
  });
  if (!submissions.allowed) {
    return NextResponse.json(
      { error: `You can change your answer up to ${ANSWER_SUBMISSIONS_PER_QUESTION} times for a question.` },
      { status: 429, headers: { "Retry-After": String(submissions.retryAfterSeconds) } }
    );
  }

  const text = body.text;
  if (question.type === QUESTION_TYPE.MULTIPLE_CHOICE && !parseOptions(question.options).includes(text)) {
    return NextResponse.json({ error: "Answer must be one of the question's options" }, { status: 400 });
  }

  // Marked now against the key as it stands, and marked again when the round
  // closes (rescoreRound) in case the host fixes the key in between.
  const isCorrect = isLikelyCorrect(text, question.answer, parseOptions(question.acceptableAnswers));
  const pointsAwarded = isCorrect ? question.points : 0;
  const key = { teamId_roundIndex_questionIndex: { teamId: team.id, roundIndex, questionIndex } };

  const written = await db.$transaction(async (tx) => {
    const fresh = await tx.session.findUnique({
      where: { id: session.id },
      select: { status: true, currentRoundIndex: true, askedCount: true },
    });
    if (
      !fresh ||
      fresh.status !== SESSION_STATUS.ROUND_OPEN ||
      fresh.currentRoundIndex !== roundIndex ||
      questionIndex >= fresh.askedCount
    ) {
      return null;
    }
    const existing = await tx.answer.findUnique({ where: key, select: { hostOverride: true } });
    if (existing?.hostOverride) return null;

    return tx.answer.upsert({
      where: key,
      update: { text, isCorrect, pointsAwarded },
      create: { sessionId: session.id, teamId: team.id, roundIndex, questionIndex, text, isCorrect, pointsAwarded },
    });
  });

  if (!written) {
    return NextResponse.json({ error: ROUND_CLOSED }, { status: 409 });
  }
  return NextResponse.json({ answer: { id: written.id, text: written.text } }, { status: 201 });
}
