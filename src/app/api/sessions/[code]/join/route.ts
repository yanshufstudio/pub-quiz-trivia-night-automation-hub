import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createTeamUnderCap } from "@/lib/create-team";
import { rateLimit } from "@/lib/rate-limit";
import { SESSION_STATUS } from "@/lib/session-state";
import { forgetDisplay } from "@/lib/display-cache";
import { MAX_TEAMS_PER_SESSION, TEAM_NAME_MAX, normalizeTeamName, teamNameKey } from "@/lib/team-name";
import { apiError } from "@/lib/api-error";

const joinSchema = z.object({
  // Normalised before the length check so a name made of control
  // characters cannot pass min(1) and then store as empty; see team-name.ts.
  name: z.string().max(200).transform(normalizeTeamName).pipe(z.string().min(1).max(TEAM_NAME_MAX)),
});


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
      apiError("tooManyJoins"),
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = joinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(apiError("teamNameRequired"), { status: 400 });
  }

  const session = await db.session.findUnique({ where: { code: code.toUpperCase() } });
  if (!session) {
    return NextResponse.json(apiError("sessionNotFound"), { status: 404 });
  }
  if (session.status === SESSION_STATUS.ENDED) {
    return NextResponse.json(apiError("quizEnded"), { status: 409 });
  }

  const teamCount = await db.team.count({ where: { sessionId: session.id } });
  if (teamCount >= MAX_TEAMS_PER_SESSION) {
    return NextResponse.json(
      apiError("quizFull"),
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
      apiError("teamNameTaken"),
      { status: 409 }
    );
  }

  // The checks above are the ordinary answers. Two joins at the same moment
  // both pass them, so the cap and the name are settled again after the
  // insert (M3); see create-team.ts.
  const created = await createTeamUnderCap({ sessionId: session.id, name });
  if (!created.ok) {
    if (created.reason === "full") {
      return NextResponse.json(apiError("quizFull"), { status: 409 });
    }
    // A same-name row may have stood for a moment, and a TV poll cached it.
    forgetDisplay(session.code);
    return NextResponse.json(apiError("teamNameTaken"), { status: 409 });
  }
  const team = created.team;

  // The TV's lobby lists teams as they join.
  forgetDisplay(session.code);
  return NextResponse.json({ token: team.token, teamId: team.id, teamName: team.name }, { status: 201 });
}
