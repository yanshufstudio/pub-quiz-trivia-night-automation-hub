import { NextRequest, NextResponse } from "next/server";
import type { Session } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { hostSessionRequest } from "@/lib/host-route";
import { forgetDisplay } from "@/lib/display-cache";
import { SESSION_MODE, SESSION_STATUS } from "@/lib/session-state";

/**
 * Round score entry (RM3): the host types a team's total for a round.
 *
 * For a paper team, whose sheet the host (or another table) marked; for swap
 * marking, where tables mark each other's sheets and the host types what they
 * read out; and as an override of a phone team's auto total. A typed total
 * replaces the auto total for that team and round until it is cleared.
 *
 * Only for a round that has closed: while a round is open its answers are
 * still changing, and a total typed then would be a guess.
 */

const target = {
  hostToken: z.string().min(1),
  teamId: z.string().min(1),
  roundIndex: z.number().int().min(0),
};
const setSchema = z.object({ ...target, points: z.number().int().min(0).max(999) });
const clearSchema = z.object(target);

type Params = { params: Promise<{ code: string }> };

async function checkTarget(session: Session, teamId: string, roundIndex: number) {
  if (session.mode !== SESSION_MODE.ROUND) {
    return NextResponse.json({ error: "This game runs one question at a time" }, { status: 409 });
  }
  const closed =
    roundIndex < session.currentRoundIndex ||
    (roundIndex === session.currentRoundIndex &&
      (session.status === SESSION_STATUS.ROUND_MARKING ||
        session.status === SESSION_STATUS.ROUND_REVEAL ||
        session.status === SESSION_STATUS.ENDED));
  if (!closed) {
    return NextResponse.json({ error: "Close the round before entering its scores" }, { status: 409 });
  }
  const team = await db.team.findUnique({ where: { id: teamId }, select: { sessionId: true } });
  if (!team || team.sessionId !== session.id) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }
  return null;
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { code } = await params;
  const checked = await hostSessionRequest(req, code, setSchema);
  if (!checked.ok) return checked.response;
  const { session, body } = checked;
  const refused = await checkTarget(session, body.teamId, body.roundIndex);
  if (refused) return refused;

  const key = { sessionId: session.id, teamId: body.teamId, roundIndex: body.roundIndex };
  await db.roundScore.upsert({
    where: { sessionId_teamId_roundIndex: key },
    update: { points: body.points },
    create: { ...key, points: body.points },
  });
  forgetDisplay(session.code);
  return NextResponse.json({ roundScore: { teamId: body.teamId, roundIndex: body.roundIndex, points: body.points } });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { code } = await params;
  const checked = await hostSessionRequest(req, code, clearSchema);
  if (!checked.ok) return checked.response;
  const { session, body } = checked;
  const refused = await checkTarget(session, body.teamId, body.roundIndex);
  if (refused) return refused;

  // deleteMany, not delete: clearing a total that is already clear (a second
  // tap, a retry) is not an error.
  await db.roundScore.deleteMany({
    where: { sessionId: session.id, teamId: body.teamId, roundIndex: body.roundIndex },
  });
  forgetDisplay(session.code);
  return NextResponse.json({ roundScore: null });
}
