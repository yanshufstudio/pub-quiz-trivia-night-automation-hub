import Link from "next/link";
import { db } from "@/lib/db";
import { requireHostPage } from "@/lib/auth-guard";
import { visiblePacksWhere } from "@/lib/pack-access";
import { liveSessionWhere } from "@/lib/live-game-guard";
import { SiteHeader } from "@/components/SiteHeader";
import { ArrowRightIcon } from "@/components/icons";
import { countOf } from "@/lib/plural";
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

  // Games this account started that are still running (H4). Before this, the
  // only route back to a host desk was the browser that opened it: the host key
  // is written to that browser's local storage and shown nowhere, so a closed
  // tab or a second device meant a quiz with no host controls. The filter is
  // the same one the editor's guard uses (src/lib/live-game-guard.ts), so every
  // game listed here is exactly a game that would refuse a structural edit.
  const liveGames = await db.session.findMany({
    where: { creatorId: host.creator.id, ...liveSessionWhere() },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { code: true, status: true, createdAt: true, pack: { select: { title: true } } },
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

        {liveGames.length > 0 ? (
          <section className="mt-8 rounded-xl border border-amber/40 bg-amber/5 px-5 py-4">
            <h2 className="font-serif text-lg font-semibold">Your live games</h2>
            <p className="mt-1 text-sm text-muted">
              Open the host desk on this device — you don&apos;t need the host key for a game you
              started. A game still running here also stops its pack being restructured.
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {liveGames.map((game) => (
                <li key={game.code}>
                  <Link
                    href={`/host/${game.code}`}
                    className="group inline-flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 text-sm font-semibold hover:bg-amber/10"
                  >
                    <span className="font-mono text-base tracking-[0.2em]">{game.code}</span>
                    <span className="font-medium text-muted">{game.pack.title}</span>
                    <span className="text-xs font-medium uppercase tracking-wider text-muted">
                      {game.status === "LOBBY" ? "In the lobby" : "In progress"}
                    </span>
                    <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

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
                      {countOf(pack.rounds.length, "round")} · {countOf(questionCount, "question")}
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
