import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Pack ownership, keyed by the signed-in host's Creator.
 *
 * A pack is editable only by the Creator whose id matches
 * `QuizPack.creatorId`, and that Creator now belongs to an account rather
 * than to a browser cookie (src/lib/auth-guard.ts). Ownerless packs
 * (`creatorId` null — the seeded demo pack, anything created before the
 * Creator model) are visible to every signed-in host and editable by no one;
 * Export → Import is how a host takes an editable copy.
 *
 * `GET /api/packs/[id]` and `GET /api/questions/[id]/media` stay open,
 * because a team's phone renders the current question and its image and
 * holds nothing that could authenticate it. The surfaces that carry the
 * *answers* — PDF, print, export — no longer are.
 */

export const NOT_OWNER_MESSAGE = "You can only edit packs you created";

/** Prisma filter for the packs a visitor may see in a list. */
export function visiblePacksWhere(creatorId: string | null): Prisma.QuizPackWhereInput {
  return creatorId === null ? { creatorId: null } : { OR: [{ creatorId: null }, { creatorId }] };
}

export function canEditPack(pack: { creatorId: string | null }, creatorId: string | null): boolean {
  return pack.creatorId !== null && creatorId !== null && pack.creatorId === creatorId;
}

type OwnerTarget = { packId: string } | { roundId: string } | { questionId: string };

/** Walks question → round → pack as needed. Null when the target row is gone. */
export async function packOwnership(target: OwnerTarget): Promise<{ packId: string; creatorId: string | null } | null> {
  if ("packId" in target) {
    const pack = await db.quizPack.findUnique({ where: { id: target.packId }, select: { id: true, creatorId: true } });
    return pack ? { packId: pack.id, creatorId: pack.creatorId } : null;
  }
  if ("roundId" in target) {
    const round = await db.round.findUnique({
      where: { id: target.roundId },
      select: { pack: { select: { id: true, creatorId: true } } },
    });
    return round ? { packId: round.pack.id, creatorId: round.pack.creatorId } : null;
  }
  const question = await db.question.findUnique({
    where: { id: target.questionId },
    select: { round: { select: { pack: { select: { id: true, creatorId: true } } } } },
  });
  return question ? { packId: question.round.pack.id, creatorId: question.round.pack.creatorId } : null;
}

/**
 * For write routes. Returns a 403 response to send back, or null when this
 * creator owns the pack. Callers 404 on a missing row *before* this, so a
 * non-existent id never turns into a misleading "not yours".
 *
 * The creator id is passed in rather than dug out of the request: the caller
 * has already had to establish a session to get this far (otherwise it
 * answered 401), and that same step is what produced the creator. Taking it
 * as an argument means there is no path through this function that could
 * fall back to reading an unauthenticated cookie.
 */
export async function requirePackOwner(creatorId: string, target: OwnerTarget): Promise<NextResponse | null> {
  const ownership = await packOwnership(target);
  if (ownership && canEditPack(ownership, creatorId)) return null;
  return NextResponse.json({ error: NOT_OWNER_MESSAGE }, { status: 403 });
}
