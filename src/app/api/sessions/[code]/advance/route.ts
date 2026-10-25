import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Session } from "@prisma/client";
import { db } from "@/lib/db";
import {
  SESSION_MODE,
  SESSION_STATUS,
  computeNextPosition,
  packWithRoundsArgs,
  type PackWithRounds,
} from "@/lib/session-state";
import {
  COUNTDOWN_CHOICES_SECONDS,
  ROUND_ACTIONS,
  planRoundAction,
  type RoundAction,
} from "@/lib/round-state";
import { isValidHostToken } from "@/lib/host-auth";
import { rescoreCurrentQuestion, rescoreRound } from "@/lib/rescore";
import { forgetDisplay } from "@/lib/display-cache";
import { hostSessionForRequest, unauthorized } from "@/lib/auth-guard";

const QUESTION_ACTIONS = ["start", "reveal", "next", "end"] as const;

const advanceSchema = z
  .object({
    action: z.enum([...new Set<string>([...QUESTION_ACTIONS, ...ROUND_ACTIONS])] as [string, ...string[]]),
    hostToken: z.string().min(1),
    seconds: z.number().int().optional(),
    showAll: z.boolean().optional(),
    // Round mode: the state the host's screen showed when the button was
    // pressed. See advanceRound.
    at: z
      .object({
        roundIndex: z.number().int(),
        askedCount: z.number().int(),
        revealedCount: z.number().int(),
      })
      .optional(),
  })
  .refine(
    (b) => b.action !== "start_countdown" || COUNTDOWN_CHOICES_SECONDS.some((s) => s === b.seconds),
    "Invalid countdown length"
  )
  .refine((b) => b.action !== "set_tv_mode" || typeof b.showAll === "boolean", "Invalid TV mode");

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
  mode: true,
  askedCount: true,
  revealedCount: true,
  scoreboardShown: true,
  tvShowsAll: true,
  countdownStartedAt: true,
  countdownSeconds: true,
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

  if (session.mode === SESSION_MODE.ROUND) {
    return advanceRound(session, pack, parsed.data);
  }

  if (!(QUESTION_ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: "This game runs one question at a time" }, { status: 409 });
  }

  if (action === "end") {
    // The host's deliberate way to close a game, from any state: the lobby
    // nobody joined, a question the room walked out on, or a finished quiz the
    // host wants off the pack. It exists because the edit guard
    // (src/lib/live-game-guard.ts) treats a live session as a reason to refuse
    // structural edits, and a host who closed the tab mid-question would
    // otherwise have to wait out the 12-hour staleness window (L9).
    //
    // Idempotent on purpose — a second tap, a retry on venue wifi, or a second
    // device is not an error — so unlike the transitions below it does not
    // report a lost race.
    await db.session.updateMany({
      where: { id: session.id, status: { not: SESSION_STATUS.ENDED } },
      data: { status: SESSION_STATUS.ENDED },
    });
    return NextResponse.json({
      session: await db.session.findUniqueOrThrow({ where: { id: session.id }, select: publicSessionSelect }),
    });
  }

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
    // The answer key may have been edited while the question was open — that is
    // allowed, it moves no index — so the marks are recomputed here, at the moment
    // they become visible. A mark the host set by hand is left alone (M7).
    await rescoreCurrentQuestion(session, pack);
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

/**
 * A round-mode game (src/lib/round-state.ts). The plan's `pin` goes into the
 * `where` of the update — the same race-safety as the transitions above: of two
 * requests that read the same state, only the first to commit changes anything,
 * and the other gets a 409 rather than asking a second question.
 *
 * That alone does not cover a second request that reads the state *after* the
 * first has committed — a double tap the server happens to serialise, or a
 * retry after the venue wifi lost the first response. Read fresh, it would ask
 * the next question too. So the desk sends `at`, the position its screen was
 * showing, and a press made against a position the game has left is refused.
 */
async function advanceRound(
  session: Session,
  pack: PackWithRounds,
  body: {
    action: string;
    seconds?: number;
    showAll?: boolean;
    at?: { roundIndex: number; askedCount: number; revealedCount: number };
  }
) {
  if (!(ROUND_ACTIONS as readonly string[]).includes(body.action)) {
    return NextResponse.json({ error: "This game runs round by round" }, { status: 409 });
  }
  // Only the presses that move the game forward; a flag set twice, or "end"
  // pressed on a screen a poll behind, is harmless.
  const movesTheGame = ["start", "ask_next", "close_round", "reveal_next", "next_round", "finish"];
  if (
    body.at &&
    movesTheGame.includes(body.action) &&
    (body.at.roundIndex !== session.currentRoundIndex ||
      body.at.askedCount !== session.askedCount ||
      body.at.revealedCount !== session.revealedCount)
  ) {
    return NextResponse.json({ error: "The game moved on. Refresh and try again." }, { status: 409 });
  }
  const plan = planRoundAction(
    session,
    { action: body.action as RoundAction, seconds: body.seconds, showAll: body.showAll },
    pack.rounds.map((r) => r.questions.length),
    new Date()
  );
  if (!plan.ok) {
    return NextResponse.json({ error: plan.error }, { status: 409 });
  }

  const { count } = await db.session.updateMany({ where: { id: session.id, ...plan.pin }, data: plan.data });
  // "end" is idempotent (see the QUESTION-mode branch): ending an ended game is
  // not a lost race. Every other action that matched nothing lost one.
  if (count === 0 && body.action !== "end") {
    return NextResponse.json({ error: "The game moved on. Refresh and try again." }, { status: 409 });
  }
  forgetDisplay(session.code);
  if (body.action === "close_round") {
    // The key may have been fixed while the round was open, and every answer
    // in so far was marked against the old one. Nothing can be submitted from
    // here on (the answers route re-checks ROUND_OPEN inside its write), so
    // this is the last moment the marks can be corrected quietly (M7).
    await rescoreRound(session, pack);
  }

  return NextResponse.json({
    session: await db.session.findUniqueOrThrow({ where: { id: session.id }, select: publicSessionSelect }),
  });
}
