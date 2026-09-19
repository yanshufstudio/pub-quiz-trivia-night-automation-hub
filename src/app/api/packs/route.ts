import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hostSessionForRequest, unauthorized } from "@/lib/auth-guard";
import { visiblePacksWhere } from "@/lib/pack-access";

export async function GET(req: NextRequest) {
  // A host's own packs plus the ownerless ones (the demo pack). Signed out
  // there is no "own", and the list would be nothing but the demo — so this
  // asks for an account rather than pretending to serve a visitor.
  const host = await hostSessionForRequest(req);
  if (!host) return unauthorized();

  const packs = await db.quizPack.findMany({
    where: visiblePacksWhere(host.creator.id),
    orderBy: { createdAt: "desc" },
    take: 100, // bound worst-case query/response cost as packs accumulate
    include: { rounds: { include: { questions: true } } },
  });

  return NextResponse.json({
    packs: packs.map((pack) => ({
      id: pack.id,
      title: pack.title,
      createdAt: pack.createdAt,
      roundCount: pack.rounds.length,
      questionCount: pack.rounds.reduce((sum, r) => sum + r.questions.length, 0),
    })),
  });
}
