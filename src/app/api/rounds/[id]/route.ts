import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hostSessionForRequest, unauthorized } from "@/lib/auth-guard";
import { requirePackOwner } from "@/lib/pack-access";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const host = await hostSessionForRequest(req);
  if (!host) return unauthorized();
  const { id } = await params;
  const existing = await db.round.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  const forbidden = await requirePackOwner(host.creator.id, { packId: existing.packId });
  if (forbidden) return forbidden;

  const siblingCount = await db.round.count({ where: { packId: existing.packId } });
  if (siblingCount <= 1) {
    return NextResponse.json({ error: "A pack needs at least one round" }, { status: 400 });
  }

  // Same contiguous-index-shift transaction as deleting a question (see the
  // comment in src/app/api/questions/[id]/route.ts) — Round.index backs
  // getCurrentRound/computeNextPosition the same way Question.index does,
  // and this round's questions cascade-delete with it via the schema's
  // onDelete: Cascade.
  await db.$transaction(async (tx) => {
    await tx.round.delete({ where: { id } });
    const remaining = await tx.round.findMany({
      where: { packId: existing.packId },
      orderBy: { index: "asc" },
    });
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].index !== i) {
        await tx.round.update({ where: { id: remaining[i].id }, data: { index: i } });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
