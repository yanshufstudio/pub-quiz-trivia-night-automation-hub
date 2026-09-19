import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdminTokenConfigured, isAuthorizedAdmin } from "@/lib/admin-auth";
import { hostSessionForRequest } from "@/lib/auth-guard";
import { canEditPack, packOwnership } from "@/lib/pack-access";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pack = await db.quizPack.findUnique({
    where: { id },
    include: {
      rounds: {
        orderBy: { index: "asc" },
        include: {
          questions: { orderBy: { index: "asc" }, include: { media: { select: { id: true } } } },
        },
      },
    },
  });
  if (!pack) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }
  // An attached image is reported as a flag; the bytes are served separately
  // by /api/questions/[id]/media so that a pack read stays a small JSON
  // payload however many images the pack carries. The rest of the row is
  // passed through unchanged — `options` and `acceptableAnswers` stay in
  // their stored JSON-string form here, as they always have.
  return NextResponse.json({
    pack: {
      ...pack,
      rounds: pack.rounds.map((round) => ({
        ...round,
        questions: round.questions.map(({ media, ...question }) => ({ ...question, hasMedia: media !== null })),
      })),
    },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The operator's admin token deletes anything; otherwise only the pack's
  // own creator may delete it. Both fail with the same 401 so a probe can't
  // tell an unowned id from a wrong token.
  //
  // isAuthorizedAdmin fails closed when ADMIN_TOKEN is unset (see its
  // comment), so there is no configuration of this deployment in which the
  // ownership check below is skipped. isAdminTokenConfigured() is kept in
  // front of it to state that intent at the call site rather than leaving it
  // to be re-derived from the helper.
  const adminOverride = isAdminTokenConfigured() && isAuthorizedAdmin(req);
  if (!adminOverride) {
    const [ownership, host] = await Promise.all([packOwnership({ packId: id }), hostSessionForRequest(req)]);
    // Still one indistinguishable 401 for "no session", "not your pack" and
    // "wrong admin token" — a probe must not be able to tell an id it does
    // not own from one that does not exist.
    if (!host || !ownership || !canEditPack(ownership, host.creator.id)) {
      return NextResponse.json({ error: "Invalid admin token" }, { status: 401 });
    }
  }
  await db.quizPack.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
