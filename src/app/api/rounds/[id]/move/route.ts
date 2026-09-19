import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hostSessionForRequest, unauthorized } from "@/lib/auth-guard";
import { requirePackOwner } from "@/lib/pack-access";

const moveSchema = z.object({ direction: z.enum(["up", "down"]) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const host = await hostSessionForRequest(req);
  if (!host) return unauthorized();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = moveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const round = await db.round.findUnique({ where: { id } });
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  const forbidden = await requirePackOwner(host.creator.id, { packId: round.packId });
  if (forbidden) return forbidden;

  const targetIndex = parsed.data.direction === "up" ? round.index - 1 : round.index + 1;
  const swapWith = await db.round.findUnique({
    where: { packId_index: { packId: round.packId, index: targetIndex } },
  });
  if (!swapWith) {
    // Already at the top/bottom of the pack — a no-op, not an error.
    return NextResponse.json({ ok: true, moved: false });
  }

  // A direct two-way swap of `index` values would collide with the
  // @@unique([packId, index]) constraint the instant the first update runs
  // (its target index is still held by the *other* row) — SQLite checks
  // uniqueness immediately, not at transaction end. Routing `round` through
  // a temporary, guaranteed-unused index first (-1; real indices are always
  // >= 0) frees its slot before `swapWith` moves into it, so every step in
  // this transaction lands on an already-vacant index.
  await db.$transaction([
    db.round.update({ where: { id: round.id }, data: { index: -1 } }),
    db.round.update({ where: { id: swapWith.id }, data: { index: round.index } }),
    db.round.update({ where: { id: round.id }, data: { index: targetIndex } }),
  ]);

  return NextResponse.json({ ok: true, moved: true });
}
