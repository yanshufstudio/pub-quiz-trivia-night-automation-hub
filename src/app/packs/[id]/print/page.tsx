import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireHostPage } from "@/lib/auth-guard";
import { toQuestionView } from "@/lib/question-types";
import { PrintPreview } from "./PrintPreview";

export const dynamic = "force-dynamic";

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Host-side, and it prints the ANSWER sheets. Before accounts this page
  // was open to anyone holding the id; it is not any more.
  await requireHostPage(`/packs/${id}/print`);
  const pack = await db.quizPack.findUnique({
    where: { id },
    include: {
      rounds: {
        orderBy: { index: "asc" },
        // `media: { select: { id: true } }` and never the bytes — without
        // this include toQuestionView reports `hasMedia: false` for every
        // question and PrintPreview silently renders no images (the PDFs
        // load their own rows, so they were unaffected).
        include: { questions: { orderBy: { index: "asc" }, include: { media: { select: { id: true } } } } },
      },
    },
  });
  if (!pack) notFound();

  return (
    <PrintPreview
      pack={{
        ...pack,
        createdAt: pack.createdAt.toISOString(),
        rounds: pack.rounds.map((round) => ({
          ...round,
          questions: round.questions.map(toQuestionView),
        })),
      }}
    />
  );
}
