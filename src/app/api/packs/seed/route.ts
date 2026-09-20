import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createPackFromGenerated } from "@/lib/create-pack";
import { DEMO_PACK, DEMO_PACK_PROMPT } from "@/lib/demo-pack";
import { rateLimit } from "@/lib/rate-limit";
import { hostSessionForRequest, unauthorized } from "@/lib/auth-guard";

export async function POST(req: NextRequest) {
  // Cheap to call (no AI, no external cost) but it writes to the DB, so it
  // keeps its generous-but-real ceiling even behind an account.
  const limited = await rateLimit(req, "packs:seed", { limit: 20, windowMs: 10 * 60 * 1000 });
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many demo packs created recently. Please wait a bit and try again." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  // The demo pack is available once signed in — it is still ownerless, so
  // every host sees it and none of them can edit it in place (Export →
  // Import is how you take a copy).
  const host = await hostSessionForRequest(req);
  if (!host) return unauthorized();

  // Idempotent, matching the CLI seed script (prisma/seed.ts): reuse the
  // existing demo pack instead of piling up a fresh copy on every click.
  const existing = await db.quizPack.findFirst({
    where: { title: DEMO_PACK.title },
    include: { rounds: { include: { questions: true }, orderBy: { index: "asc" } } },
  });
  if (existing) {
    return NextResponse.json({ pack: existing }, { status: 200 });
  }

  const pack = await createPackFromGenerated(DEMO_PACK, DEMO_PACK_PROMPT);
  return NextResponse.json({ pack }, { status: 201 });
}
