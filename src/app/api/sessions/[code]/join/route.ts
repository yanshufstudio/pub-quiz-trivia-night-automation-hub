import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { generateTeamToken } from "@/lib/codes";
import { rateLimit } from "@/lib/rate-limit";
import { SESSION_STATUS } from "@/lib/session-state";

const joinSchema = z.object({
  name: z.string().trim().min(1).max(40),
});

/**
 * The join code is printed on the table QR and read out to the room, so it
 * is not a secret and this route cannot be authenticated — anyone who can
 * see the code can join, by design. What it can be is bounded: without a
 * ceiling, one person with the code could spawn teams until the host's
 * scoreboard was unreadable and the quiz unrunnable. A pub quiz is 5-25
 * teams; 60 leaves room for a big charity night and still bounds the damage.
 */
const MAX_TEAMS_PER_SESSION = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  // Generous, because a whole venue shares one wifi IP: every team in the
  // room joins from the same address, so this must not fire on a real night.
  // It exists to stop a scripted loop, which the per-session cap below then
  // bounds even from an attacker changing IPs.
  const limited = await rateLimit(req, "sessions:join", { limit: 60, windowMs: 10 * 60 * 1000 });
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many teams joined from here recently. Please wait a bit and try again." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = joinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Team name is required" }, { status: 400 });
  }

  const session = await db.session.findUnique({ where: { code: code.toUpperCase() } });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.status === SESSION_STATUS.ENDED) {
    return NextResponse.json({ error: "This quiz has already ended" }, { status: 409 });
  }

  const teamCount = await db.team.count({ where: { sessionId: session.id } });
  if (teamCount >= MAX_TEAMS_PER_SESSION) {
    return NextResponse.json(
      { error: "This quiz is full — it has reached the maximum number of teams." },
      { status: 409 }
    );
  }

  const name = parsed.data.name;
  const existing = await db.team.findUnique({
    where: { sessionId_name: { sessionId: session.id, name } },
  });
  if (existing) {
    return NextResponse.json(
      { error: "That team name is already taken in this session" },
      { status: 409 }
    );
  }

  const team = await db.team.create({
    data: { sessionId: session.id, name, token: generateTeamToken() },
  });

  return NextResponse.json({ token: team.token, teamId: team.id, teamName: team.name }, { status: 201 });
}
