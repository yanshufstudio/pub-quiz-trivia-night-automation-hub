import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";

/**
 * The shared shell for /terms, /privacy and /refunds.
 *
 * The three pages are chrome-identical and differ only in prose, so the
 * header, the column width and the "last updated" line live here — one place
 * to change when a policy is revised, rather than three that can drift out of
 * step with each other. The visual language matches /pricing and the rest of
 * the paper-toned pages: SiteHeader, a centred column, a serif h1.
 */

/** Shown on all three pages. Bump this when the wording of any of them changes. */
export const LEGAL_LAST_UPDATED = "2026-09-15";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated: {LEGAL_LAST_UPDATED}</p>
        <div className="mt-8 space-y-8">{children}</div>
      </main>
    </>
  );
}

/** One titled clause. `id` gives each clause a linkable anchor. */
export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="space-y-3">
      <h2 className="font-serif text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

/** Body copy. Kept as a component so every paragraph reads the same. */
export function LegalText({ children }: { children: ReactNode }) {
  return <p className="text-muted">{children}</p>;
}

/** A bulleted list of points within a clause. */
export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 text-muted">{children}</ul>;
}
