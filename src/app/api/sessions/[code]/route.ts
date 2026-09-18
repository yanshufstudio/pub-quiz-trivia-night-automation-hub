import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  SESSION_STATUS,
  getCurrentQuestion,
  getCurrentRound,
  packWithRoundsArgs,
  type PackWithRounds,
} from "@/lib/session-state";
import { computeScoreboard } from "@/lib/scoreboard";
import { isValidHostToken } from "@/lib/host-auth";
import { autoRevealIfExpired } from "@/lib/session-timer";
import { parseOptions, type QuestionType } from "@/lib/question-types";

async function loadSession(code: string) {
  const session = await db.session.findUnique({
    where: { code: code.toUpperCase() },
    include: { teams: true, answers: true },
  });
  if (!session) return null;

  // Lazily flip an expired question to REVEAL on whoever polls next — host
  // or team, no separate cron/timer process needed.
  const timerResult = await autoRevealIfExpired(session);
  const effectiveSession = timerResult.status === session.status ? session : { ...session, status: timerResult.status };

  const pack = (await db.quizPack.findUnique({
    where: { id: effectiveSession.packId },
    ...packWithRoundsArgs,
  })) as PackWithRounds | null;
  if (!pack) return null;
  return { session: effectiveSession, pack };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const loaded = await loadSession(code);
  if (!loaded) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const { session, pack } = loaded;

  const url = new URL(req.url);
  const asHost = url.searchParams.get("as") === "host";
  const token = url.searchParams.get("token");

  let team = null;
  if (asHost) {
    const hostToken = url.searchParams.get("hostToken");
    if (!isValidHostToken(session.hostToken, hostToken)) {
      return NextResponse.json({ error: "Invalid host key" }, { status: 401 });
    }
  } else {
    if (!token) {
      return NextResponse.json({ error: "Missing team token" }, { status: 401 });
    }
    team = session.teams.find((t) => t.token === token) ?? null;
    if (!team) {
      return NextResponse.json({ error: "Invalid team token" }, { status: 401 });
    }
  }

  const round = getCurrentRound(pack, session.currentRoundIndex);
  const question = getCurrentQuestion(pack, session.currentRoundIndex, session.currentQuestionIndex);
  const revealAnswer = session.status === SESSION_STATUS.REVEAL || session.status === SESSION_STATUS.ENDED;

  const currentQuestionAnswers = session.answers.filter(
    (a) => a.roundIndex === session.currentRoundIndex && a.questionIndex === session.currentQuestionIndex
  );

  const base = {
    code: session.code,
    status: session.status,
    packTitle: pack.title,
    roundNumber: session.currentRoundIndex + 1,
    totalRounds: pack.rounds.length,
    questionNumber: session.currentQuestionIndex + 1,
    totalQuestionsInRound: round?.questions.length ?? 0,
    round: round ? { title: round.title, category: round.category } : null,
    question: question
      ? {
          id: question.id,
          text: question.text,
          points: question.points,
          answer: revealAnswer ? question.answer : null,
          type: question.type as QuestionType,
          options: parseOptions(question.options),
          hasMedia: question.media != null,
        }
      : null,
    scoreboard: computeScoreboard(session.teams, session.answers),
    timer:
      session.questionDurationSeconds != null && session.questionStartedAt != null
        ? { startedAt: session.questionStartedAt.toISOString(), durationSeconds: session.questionDurationSeconds }
        : null,
  };

  if (asHost) {
    return NextResponse.json({
      ...base,
      teams: session.teams.map((t) => {
        const answer = currentQuestionAnswers.find((a) => a.teamId === t.id) ?? null;
        return {
          id: t.id,
          name: t.name,
          // Withheld until the reveal, exactly as myAnswer is on the team
          // payload below. The host screen is not a private admin view — it
          // goes on the pub's TV or projector and is laid out to be read from
          // about four metres — so what it receives, the room receives. A
          // non-null currentAnswer still says *that* the team answered, which
          // is what the host needs in order to know when to reveal; what it
          // was, and whether it scored, waits.
          //
          // Gated here and not only in the component: a screen cannot show
          // what it was never sent, so a future layout change cannot put the
          // answers back on the wall by accident.
          currentAnswer: answer
            ? {
                id: revealAnswer ? answer.id : null,
                text: revealAnswer ? answer.text : null,
                isCorrect: revealAnswer ? answer.isCorrect : null,
                pointsAwarded: revealAnswer ? answer.pointsAwarded : null,
              }
            : null,
        };
      }),
    });
  }

  const mine = currentQuestionAnswers.find((a) => a.teamId === team!.id) ?? null;
  return NextResponse.json({
    ...base,
    teamName: team!.name,
    myAnswer: mine
      ? {
          text: mine.text,
          isCorrect: revealAnswer ? mine.isCorrect : null,
          pointsAwarded: revealAnswer ? mine.pointsAwarded : null,
        }
      : null,
  });
}
