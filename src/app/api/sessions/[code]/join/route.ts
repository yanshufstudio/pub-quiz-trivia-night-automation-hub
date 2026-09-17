import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { generateTeamToken } from "@/lib/codes";
import { rateLimit } from "@/lib/rate-limit";
import { SESSION_STATUS } from "@/lib/session-state";
import { TEAM_NAME_MAX, normalizeTeamName, teamNameKey } from "@/lib/team-name";

const joinSchema = z.object({
  // Normalised before the length check so a name made of control
  // characters cannot pass min(1) and then store as empty; see team-name.ts.
  name: z.string().max(200).transform(normalizeTeamName).pipe(z.string().min(1).max(TEAM_NAME_MAX)),
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
  // 150, not 60: the per-session cap is 60 teams and every one of them
  // arrives from the venue's single IP, and each mistyped code, "Leave" or
  // phone-died rejoin is another hit. 60 left no headroom at all on a full
  // night (the 2026-09-17 stress run tripped it on the 61st join).
  const limited = await rateLimit(req, "sessions:join", { limit: 150, windowMs: 10 * 60 * 1000 });
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
  // Case- and width-insensitive: the unique index is exact, so without this
  // "quiz pigs" joins alongside "Quiz Pigs" and the host sees both.
  const key = teamNameKey(name);
  const names = await db.team.findMany({ where: { sessionId: session.id }, select: { name: true } });
  const existing = names.find((t) => teamNameKey(t.name) === key);
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
