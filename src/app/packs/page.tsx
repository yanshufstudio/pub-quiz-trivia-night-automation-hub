import Link from "next/link";
import { db } from "@/lib/db";
import { requireHostPage } from "@/lib/auth-guard";
import { visiblePacksWhere } from "@/lib/pack-access";
import { SiteHeader } from "@/components/SiteHeader";
import { ArrowRightIcon } from "@/components/icons";
import { ImportPackButton } from "./ImportPackButton";

export const dynamic = "force-dynamic";

export default async function PacksPage() {
  // The real check, not the proxy's cookie glance: this reads the session
  // out of the database, and throws a redirect to /sign-in if there isn't
  // one (src/lib/auth-guard.ts).
  const host = await requireHostPage("/packs");
  // Shared (ownerless) packs plus this host's own — never another
  // account's. See src/lib/pack-access.ts.
  const packs = await db.quizPack.findMany({
    where: visiblePacksWhere(host.creator.id),
    orderBy: { createdAt: "desc" },
    take: 100, // bound worst-case query/render cost as packs accumulate
    include: { rounds: { include: { questions: true } } },
  });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-semibold tracking-tight">Quiz packs</h1>
            <p className="mt-2 text-muted">Edit questions, preview print sheets, then start a live session.</p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <ImportPackButton />
            <Link
              href="/create"
              className="inline-flex h-11 items-center rounded-xl bg-amber px-4 text-sm font-semibold text-white hover:bg-amber-hover"
            >
              New pack
            </Link>
          </div>
        </div>

        {packs.length === 0 ? (
          <div className="paper-sheet mt-10 rounded-xl border border-line px-6 py-12 text-center">
            <p className="font-medium">No packs yet.</p>
            <p className="mt-2 text-sm text-muted">Generate one from a brief, or seed the demo pack.</p>
            <Link href="/create" className="group mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-amber">
              Open the wizard
              <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {packs.map((pack) => {
              const questionCount = pack.rounds.reduce((sum, round) => sum + round.questions.length, 0);
              return (
                <li key={pack.id}>
                  <Link
                    href={`/packs/${pack.id}`}
                    className="paper-sheet block rounded-xl border border-line p-5 transition-colors hover:border-amber/50"
                  >
                    <h2 className="font-serif text-lg font-semibold">{pack.title}</h2>
                    <p className="mt-2 text-sm text-muted">
                      {pack.rounds.length} rounds · {questionCount} questions
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {new Date(pack.createdAt).toLocaleDateString()}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
