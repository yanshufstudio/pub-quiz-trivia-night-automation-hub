import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireHostPage } from "@/lib/auth-guard";
import { canEditPack } from "@/lib/pack-access";
import { SiteHeader } from "@/components/SiteHeader";
import { toQuestionView } from "@/lib/question-types";
import { PackEditor } from "./PackEditor";

export const dynamic = "force-dynamic";

export default async function PackEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const host = await requireHostPage(`/packs/${id}`);
  const pack = await db.quizPack.findUnique({
      where: { id },
      include: {
        rounds: {
          orderBy: { index: "asc" },
          include: {
            // `media: { select: { id: true } }` and never the bytes —
            // toQuestionView turns it into a `hasMedia` flag, and the image
            // itself is fetched from /api/questions/[id]/media.
            questions: { orderBy: { index: "asc" }, include: { media: { select: { id: true } } } },
          },
        },
      },
  });
  if (!pack) notFound();

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <PackEditor
          canEdit={canEditPack(pack, host.creator.id)}
          pack={{
            ...pack,
            createdAt: pack.createdAt.toISOString(),
            rounds: pack.rounds.map((round) => ({
              ...round,
              questions: round.questions.map(toQuestionView),
            })),
          }}
        />
      </main>
    </>
  );
}
