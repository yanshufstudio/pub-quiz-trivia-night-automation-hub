import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Pack ownership, keyed by the signed-in host's Creator.
 *
 * A pack belongs to the Creator whose id matches `QuizPack.creatorId`, and
 * that Creator now belongs to an account rather than to a browser cookie
 * (src/lib/auth-guard.ts). Ownerless packs (`creatorId` null — the seeded
 * demo pack, anything created before the Creator model) are readable by
 * every signed-in host and editable by no one; Export → Import is how a host
 * takes an editable copy.
 *
 * **Reading a pack is now owner-only too.** It was not: every read by id was
 * open on the theory that a cuid is unlisted, which made `GET
 * /api/packs/[id]` hand the whole pack — every question, every answer — to
 * anyone holding an id and no account at all, and left the editor, the print
 * sheets, the PDFs and the export readable by any *other* signed-in host who
 * had one. A quizmaster's unrun pack is the one thing in this product that
 * is worth stealing.
 *
 * Someone else's pack answers exactly as a pack that does not exist does —
 * 404 from an API, `notFound()` from a page — so an id cannot be probed for
 * existence. `GET /api/questions/[id]/media` is the one read that stays
 * open, because a team's phone renders the current question's image and
 * holds nothing that could authenticate it.
 */

export const NOT_OWNER_MESSAGE = "You can only edit packs you created";

/** The one 404 every unreadable pack answers with: missing and not-yours are
 * the same answer, deliberately. */
export const PACK_NOT_FOUND_MESSAGE = "Pack not found";

export function packNotFound(): NextResponse {
  return NextResponse.json({ error: PACK_NOT_FOUND_MESSAGE }, { status: 404 });
}

/**
 * Prisma filter for the packs a signed-in host may see in a list: their own,
 * plus the ownerless demo.
 *
 * It takes a `string`, not `string | null`, because both callers (`GET
 * /api/packs` and `/packs`) are gated and cannot reach it without one. It
 * used to have a null branch returning just the ownerless packs — a
 * signed-out listing, which has not existed since host accounts landed. A
 * branch describing a state that cannot occur is a branch that quietly
 * disagrees with `canReadPack` below, and `pack-access.test.ts` asserts the
 * two now agree for every case.
 */
export function visiblePacksWhere(creatorId: string): Prisma.QuizPackWhereInput {
  return { OR: [{ creatorId: null }, { creatorId }] };
}

export function canEditPack(pack: { creatorId: string | null }, creatorId: string | null): boolean {
  return pack.creatorId !== null && creatorId !== null && pack.creatorId === creatorId;
}

/**
 * May this host read the pack at all — the editor, the print sheets, the
 * PDFs, the export, `GET /api/packs/[id]`, and starting a session on it.
 *
 * The same rule `visiblePacksWhere` applies to the list, said for one row,
 * and the two are asserted to agree in src/lib/pack-access.test.ts: a pack
 * that survives the list filter is exactly a pack this returns true for. A
 * pack with no owner is the demo — readable by anyone signed in, editable by
 * nobody. Anything else is readable only by the Creator it belongs to.
 *
 * There is no "signed out" case here on purpose. Every caller has already
 * answered 401 or redirected by this point, so passing an absent identity is
 * a mistake the type system should catch rather than a question this should
 * answer.
 */
export function canReadPack(pack: { creatorId: string | null }, creatorId: string): boolean {
  return pack.creatorId === null || pack.creatorId === creatorId;
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
