import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toPackFile } from "@/lib/pack-file";
import { toQuestionView } from "@/lib/question-types";
import { packWithRoundsAndMediaArgs, type PackWithRoundsAndMedia } from "@/lib/session-state";
import { hostSessionForRequest, unauthorized } from "@/lib/auth-guard";

function filenameFor(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "quiz-pack"}.json`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // A pack file carries every answer, so exporting needs an account. Not
  // ownership, though: Export → Import is exactly how a host takes an
  // editable copy of the ownerless demo pack.
  const host = await hostSessionForRequest(req);
  if (!host) return unauthorized();

  const { id } = await params;
  // The full media rows, not the lightweight `hasMedia` shape most reads
  // use — a v2 file embeds the actual bytes as base64 (see pack-file.ts).
  const pack = (await db.quizPack.findUnique({
    where: { id },
    ...packWithRoundsAndMediaArgs,
  })) as PackWithRoundsAndMedia | null;
  if (!pack) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }

  const file = toPackFile({
    ...pack,
    createdAt: pack.createdAt.toISOString(),
    rounds: pack.rounds.map((round) => ({
      ...round,
      // toQuestionView consumes `media` into `hasMedia`; re-attach the raw
      // relation alongside it so toPackFile can still reach the bytes.
      questions: round.questions.map((q) => ({ ...toQuestionView(q), media: q.media })),
    })),
  });

  return new NextResponse(JSON.stringify(file, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameFor(pack.title)}"`,
    },
  });
}
