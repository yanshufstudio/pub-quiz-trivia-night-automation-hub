import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hostSessionForRequest, unauthorized } from "@/lib/auth-guard";

/**
 * Hand a creator back the host key for a game they started (H4).
 *
 * The key is generated once, returned once by POST /api/sessions, and saved
 * into one browser's local storage. A host who closed that browser, cleared it,
 * or picked up a different device mid-night had no way back into their own
 * desk — the desk asked them to paste a key they had never been shown.
 *
 * This is that way back, and it is not a weakening of the token: the token
 * still decides who may drive a session. What this adds is that the *account
 * that started the game* can ask for its own copy. A stranger holding the join
 * code cannot, and neither can another signed-in host.
 *
 * A session this account did not start answers exactly as one that does not
 * exist, so the route cannot be used to discover which codes are real.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const host = await hostSessionForRequest(req);
  if (!host) return unauthorized();

  const { code } = await params;
  const session = await db.session.findUnique({
    where: { code: code.toUpperCase() },
    select: { creatorId: true, hostToken: true },
  });

  // One answer for "no such session", "started before this column existed"
  // and "someone else's game".
  if (!session || session.creatorId === null || session.creatorId !== host.creator.id) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ hostToken: session.hostToken });
}
