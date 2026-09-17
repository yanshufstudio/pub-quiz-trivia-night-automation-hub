import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

// Next's default 404 is an unstyled white card with no way back. This keeps
// the site chrome and offers the two places a lost visitor is likely to
// want: the quiz they were trying to join, or the start.
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber">404</p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight">That page isn&apos;t on the board.</h1>
        <p className="mt-3 text-muted">
          The link may be old, or the session it pointed at has finished. Join codes are five
          characters and are entered on the join page, not typed into the address bar.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/play" className="inline-flex h-11 items-center rounded-xl bg-amber px-4 text-sm font-semibold text-white hover:bg-amber-hover">
            Join a quiz
          </Link>
          <Link href="/" className="inline-flex h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold hover:border-amber">
            Go to the start
          </Link>
        </div>
      </main>
    </>
  );
}
