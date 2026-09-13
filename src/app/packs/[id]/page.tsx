import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { COOKIE_NAME } from "@/lib/creator";
import { canEditPack, creatorIdForDeviceKey } from "@/lib/pack-access";
import { SiteHeader } from "@/components/SiteHeader";
import { toQuestionView } from "@/lib/question-types";
import { PackEditor } from "./PackEditor";

export const dynamic = "force-dynamic";

export default async function PackEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [pack, creatorId] = await Promise.all([
    db.quizPack.findUnique({
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
    }),
    creatorIdForDeviceKey((await cookies()).get(COOKIE_NAME)?.value),
  ]);
  if (!pack) notFound();

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <PackEditor
          canEdit={canEditPack(pack, creatorId)}
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
