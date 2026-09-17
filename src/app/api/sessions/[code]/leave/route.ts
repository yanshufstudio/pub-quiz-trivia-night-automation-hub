import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const leaveSchema = z.object({ token: z.string().min(1) });

/**
 * "Leave" on the team portal used to be purely local — it forgot the token
 * on the phone and nothing else. The team row stayed on the host desk as a
 * permanent "Waiting…" ghost, counted against the submissions total, and
 * its name was locked, so a phone that left by accident in the lobby could
 * not come back as itself (2026-09-17 multi-device test).
 *
 * This removes the team, but only while it has no answers: once a team has
 * scored, leaving must not erase it from the board (the other teams' ranks
 * depend on it), so the row stays and the name stays taken. Authenticated
 * by the team's own token, so nobody can remove another team.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = await req.json().catch(() => null);
  const parsed = leaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const session = await db.session.findUnique({ where: { code: code.toUpperCase() } });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const team = await db.team.findUnique({ where: { token: parsed.data.token } });
  if (!team || team.sessionId !== session.id) {
    return NextResponse.json({ error: "Invalid team token" }, { status: 401 });
  }

  // Conditional delete: `answers: { none: {} }` in the where clause means a
  // team that scores between our read and this write is left alone.
  const { count } = await db.team.deleteMany({ where: { id: team.id, answers: { none: {} } } });
  return NextResponse.json({ removed: count === 1 });
}
