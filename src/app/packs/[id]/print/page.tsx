import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireHostPage } from "@/lib/auth-guard";
import { canReadPack } from "@/lib/pack-access";
import { printPageTitle } from "@/lib/print-sheets";
import { toQuestionView } from "@/lib/question-types";
import { PrintPreview } from "./PrintPreview";

export const dynamic = "force-dynamic";

// Read once per request, for the title and the page alike. The title carries
// the pack's name, so it goes through the same access check as the sheets.
const printablePack = cache(async (id: string) => {
  // Host-side, and it prints the ANSWER sheets. Before accounts this page
  // was open to anyone holding the id; now it needs an account, and one that
  // may read this pack.
  const host = await requireHostPage(`/packs/${id}/print`);
  const pack = await db.quizPack.findUnique({
    where: { id },
    include: {
      rounds: {
        orderBy: { index: "asc" },
        // `media: { select: { id: true } }` and never the bytes — without
        // this include toQuestionView reports `hasMedia: false` for every
        // question and PrintPreview silently renders no images.
        include: { questions: { orderBy: { index: "asc" }, include: { media: { select: { id: true } } } } },
      },
    },
  });
  if (!pack || !canReadPack(pack, host.creator.id)) notFound();
  return pack;
});

// The first sheet's title; PrintPreview changes it as the host switches sheets.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: printPageTitle((await printablePack(id)).title, "script") };
}

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pack = await printablePack(id);

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
