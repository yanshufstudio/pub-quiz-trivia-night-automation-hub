import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { SESSION_STATUS, computeNextPosition, packWithRoundsArgs, type PackWithRounds } from "@/lib/session-state";
import { isValidHostToken } from "@/lib/host-auth";
import { hostSessionForRequest, unauthorized } from "@/lib/auth-guard";

const advanceSchema = z.object({
  action: z.enum(["start", "reveal", "next"]),
  hostToken: z.string().min(1),
});

// Never include hostToken in a response body — this is the public shape of
// "the session" that goes back to the client after every transition.
const publicSessionSelect = {
  id: true,
  packId: true,
  code: true,
  status: true,
  currentRoundIndex: true,
  currentQuestionIndex: true,
  questionDurationSeconds: true,
  questionStartedAt: true,
  createdAt: true,
} as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  // Two independent checks, and both must pass. This one says a host is
  // signed in; `isValidHostToken` below says this browser is the host OF
  // THIS session. Neither implies the other — the token is what a team who
  // knows the join code does not have, and an account is what a stranger
  // holding a leaked token does not have.
  const host = await hostSessionForRequest(req);
  if (!host) return unauthorized();

  const { code } = await params;
  const body = await req.json().catch(() => null);
  const parsed = advanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const session = await db.session.findUnique({ where: { code: code.toUpperCase() } });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (!isValidHostToken(session.hostToken, parsed.data.hostToken)) {
    return NextResponse.json({ error: "Invalid host key" }, { status: 401 });
  }

  const pack = (await db.quizPack.findUnique({
    where: { id: session.packId },
    ...packWithRoundsArgs,
  })) as PackWithRounds | null;
  if (!pack) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }

  const { action } = parsed.data;

  // Every transition below is a conditional update: the `where` clause pins
  // the exact state this request read, so if two requests race (a
  // double-click, a retried request on flaky venue wifi) only the first to
  // commit actually changes anything — the loser's `count` comes back 0
  // instead of silently double-advancing the quiz.

  if (action === "start") {
    if (session.status !== SESSION_STATUS.LOBBY) {
      return NextResponse.json({ error: "Quiz already started" }, { status: 409 });
    }
    const { count } = await db.session.updateMany({
      where: { id: session.id, status: SESSION_STATUS.LOBBY },
      data: {
        status: SESSION_STATUS.QUESTION_ACTIVE,
        currentRoundIndex: 0,
        currentQuestionIndex: 0,
        questionStartedAt: new Date(),
      },
    });
    if (count === 0) {
      return NextResponse.json({ error: "Quiz already started" }, { status: 409 });
    }
    return NextResponse.json({ session: await db.session.findUniqueOrThrow({ where: { id: session.id }, select: publicSessionSelect }) });
  }

  if (action === "reveal") {
    if (session.status !== SESSION_STATUS.QUESTION_ACTIVE) {
      return NextResponse.json({ error: "No active question to reveal" }, { status: 409 });
    }
    const { count } = await db.session.updateMany({
      where: {
        id: session.id,
        status: SESSION_STATUS.QUESTION_ACTIVE,
        currentRoundIndex: session.currentRoundIndex,
        currentQuestionIndex: session.currentQuestionIndex,
      },
      data: { status: SESSION_STATUS.REVEAL },
    });
    if (count === 0) {
      return NextResponse.json({ error: "No active question to reveal" }, { status: 409 });
    }
    return NextResponse.json({ session: await db.session.findUniqueOrThrow({ where: { id: session.id }, select: publicSessionSelect }) });
  }

  // action === "next"
  if (session.status !== SESSION_STATUS.REVEAL) {
    return NextResponse.json({ error: "Reveal the current answer before advancing" }, { status: 409 });
  }
  const next = computeNextPosition(pack, session.currentRoundIndex, session.currentQuestionIndex);
  const { count } = await db.session.updateMany({
    where: {
      id: session.id,
      status: SESSION_STATUS.REVEAL,
      currentRoundIndex: session.currentRoundIndex,
      currentQuestionIndex: session.currentQuestionIndex,
    },
    data: next
      ? {
          status: SESSION_STATUS.QUESTION_ACTIVE,
          currentRoundIndex: next.roundIndex,
          currentQuestionIndex: next.questionIndex,
          questionStartedAt: new Date(),
        }
      : { status: SESSION_STATUS.ENDED },
  });
  if (count === 0) {
    return NextResponse.json({ error: "Reveal the current answer before advancing" }, { status: 409 });
  }
  return NextResponse.json({ session: await db.session.findUniqueOrThrow({ where: { id: session.id }, select: publicSessionSelect }) });
}
