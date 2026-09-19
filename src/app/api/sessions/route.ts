import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateHostToken, generateSessionCode } from "@/lib/codes";
import { rateLimit } from "@/lib/rate-limit";
import { hostSessionForRequest, unauthorized } from "@/lib/auth-guard";
import { z } from "zod";

const createSessionSchema = z.object({
  packId: z.string().min(1),
  // A session-level knob, not per-question: every question in the session
  // gets the same countdown. Omitted or null means no timer (manual reveal).
  questionDurationSeconds: z.number().int().positive().max(600).nullish(),
});

export async function POST(req: NextRequest) {
  // Starting a session is a host action and now needs an account. The
  // ceiling stays anyway: this writes a row and burns one of a finite pool
  // of 5-character join codes, and a real quizmaster runs a handful of
  // sessions in an evening, not thirty.
  const limited = await rateLimit(req, "sessions:create", { limit: 30, windowMs: 10 * 60 * 1000 });
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many sessions created recently. Please wait a bit and try again." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  const host = await hostSessionForRequest(req);
  if (!host) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = createSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const pack = await db.quizPack.findUnique({ where: { id: parsed.data.packId } });
  if (!pack) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }

  let code = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateSessionCode();
    const existing = await db.session.findUnique({ where: { code: candidate } });
    if (!existing) {
      code = candidate;
      break;
    }
  }
  if (!code) {
    return NextResponse.json({ error: "Could not allocate a session code" }, { status: 500 });
  }

  const hostToken = generateHostToken();
  const session = await db.session.create({
    data: {
      packId: pack.id,
      code,
      hostToken,
      questionDurationSeconds: parsed.data.questionDurationSeconds ?? null,
    },
  });

  // hostToken is returned once, here, and never included in any other
  // session payload (see getSessionState) — it's the host's only proof of
  // authority over this session, so it must not leak to team-facing views.
  return NextResponse.json(
    {
      session: {
        id: session.id,
        packId: session.packId,
        code: session.code,
        status: session.status,
        createdAt: session.createdAt,
      },
      hostToken,
    },
    { status: 201 }
  );
}
