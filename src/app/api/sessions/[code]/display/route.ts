import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { cachedDisplay, rememberDisplay } from "@/lib/display-cache";
import { roundDisplayView } from "@/lib/round-views";
import { SESSION_MODE, packWithRoundsArgs, type PackWithRounds } from "@/lib/session-state";

/**
 * Ten screens polling every three seconds for ten minutes. Keyed on the IP, and
 * every phone in a pub shares the pub's one address — and the TV link is the
 * join code, so players can open it on their phones too. The limit is set so
 * that a room of curious phones cannot lock the real TV out; a screen that does
 * hit it shows "Reconnecting…" and retries after Retry-After.
 */
const DISPLAY_REQUESTS_PER_WINDOW = 2000;
const DISPLAY_WINDOW_MS = 10 * 60 * 1000;

/**
 * GET /api/sessions/[code]/display — what the pub's TV shows (RM5).
 *
 * No credential: /tv/ + the join code is the whole link. What it returns is
 * built by roundDisplayView (src/lib/round-views.ts) and is only what the room
 * is meant to see — see the leak tests in round-display.integration.test.ts.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const limited = await rateLimit(req, "sessions:display", {
    limit: DISPLAY_REQUESTS_PER_WINDOW,
    windowMs: DISPLAY_WINDOW_MS,
  });
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  const code = (await params).code.toUpperCase();
  const now = new Date();
  const cached = cachedDisplay(code, now.getTime());
  if (cached) return NextResponse.json({ ...cached, serverNow: now.toISOString() });

  const session = await db.session.findUnique({
    where: { code },
    include: { teams: true, answers: true, roundScores: true },
  });
  // A one-question-at-a-time game has no TV view; its host screen is the TV.
  if (!session || session.mode !== SESSION_MODE.ROUND) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const pack = (await db.quizPack.findUnique({
    where: { id: session.packId },
    ...packWithRoundsArgs,
  })) as PackWithRounds | null;
  if (!pack) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const body = roundDisplayView(session, pack, now);
  rememberDisplay(code, body, now.getTime());
  return NextResponse.json(body);
}
