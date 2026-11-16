import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createTeamUnderCap } from "@/lib/create-team";
import { hostSessionRequest } from "@/lib/host-route";
import { forgetDisplay } from "@/lib/display-cache";
import { SESSION_STATUS } from "@/lib/session-state";
import { MAX_TEAMS_PER_SESSION, TEAM_NAME_MAX, normalizeTeamName, teamNameKey } from "@/lib/team-name";
import { apiError } from "@/lib/api-error";

const addPaperTeamSchema = z.object({
  hostToken: z.string().min(1),
  name: z.string().max(200).transform(normalizeTeamName).pipe(z.string().min(1).max(TEAM_NAME_MAX)),
});

/**
 * The host adds a team that plays on paper (RM3).
 *
 * The first venues run on answer sheets, and a table without a phone — or one
 * that would rather write — plays alongside the phone teams. It has a name on
 * the scoreboard and nothing else: its score is the round total the host types
 * (PUT /round-scores). It still gets a token, because Team.token is unique and
 * required, but the token is random and never leaves the server, so no phone
 * can act as a paper team.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const checked = await hostSessionRequest(req, code, addPaperTeamSchema);
  if (!checked.ok) return checked.response;
  const { session, body } = checked;

  if (session.status === SESSION_STATUS.ENDED) {
    return NextResponse.json(apiError("quizEnded"), { status: 409 });
  }

  const names = await db.team.findMany({ where: { sessionId: session.id }, select: { name: true } });
  if (names.length >= MAX_TEAMS_PER_SESSION) {
    return NextResponse.json(apiError("tooManyTeams"), { status: 409 });
  }
  if (names.some((t) => teamNameKey(t.name) === teamNameKey(body.name))) {
    return NextResponse.json(apiError("teamNameTaken"), { status: 409 });
  }

  // The checks above are the ordinary answers. A phone joining at the same
  // moment passes them too, so the cap and the name are settled again after the
  // insert (M3, the same as the join route); see create-team.ts.
  const created = await createTeamUnderCap({ sessionId: session.id, name: body.name, isPaper: true });
  if (!created.ok) {
    if (created.reason === "full") {
      return NextResponse.json(apiError("tooManyTeams"), { status: 409 });
    }
    forgetDisplay(session.code);
    return NextResponse.json(apiError("teamNameTaken"), { status: 409 });
  }
  const team = created.team;
  forgetDisplay(session.code);
  return NextResponse.json({ team: { id: team.id, name: team.name, isPaper: true } }, { status: 201 });
}
