import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ANSWER_SUBMISSIONS_PER_QUESTION,
  ANSWER_SUBMISSION_WINDOW_MS,
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

  const answer = await db.answer.upsert({
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

  return NextResponse.json({ answer: { id: answer.id, text: answer.text } }, { status: 201 });
}
