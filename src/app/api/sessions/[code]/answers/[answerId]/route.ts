import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isValidHostToken } from "@/lib/host-auth";
import { hostSessionForRequest, unauthorized } from "@/lib/auth-guard";

const overrideSchema = z.object({
  isCorrect: z.boolean(),
  points: z.number().int().min(0).max(10),
  hostToken: z.string().min(1),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ code: string; answerId: string }> }
) {
  // A score override is the host's, and the host has an account. The
  // per-session host token check below is unchanged and still decides which
  // session this browser may score.
  const host = await hostSessionForRequest(req);
  if (!host) return unauthorized();

  const { code, answerId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = overrideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid override" }, { status: 400 });
  }

  const session = await db.session.findUnique({ where: { code: code.toUpperCase() } });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (!isValidHostToken(session.hostToken, parsed.data.hostToken)) {
    return NextResponse.json({ error: "Invalid host key" }, { status: 401 });
  }

  const answer = await db.answer.findUnique({ where: { id: answerId } });
  if (!answer || answer.sessionId !== session.id) {
    return NextResponse.json({ error: "Answer not found" }, { status: 404 });
  }

  const updated = await db.answer.update({
    where: { id: answerId },
    data: {
      isCorrect: parsed.data.isCorrect,
      pointsAwarded: parsed.data.isCorrect ? parsed.data.points : 0,
    },
  });

  return NextResponse.json({
    answer: {
      id: updated.id,
      text: updated.text,
      isCorrect: updated.isCorrect,
      pointsAwarded: updated.pointsAwarded,
    },
  });
}
