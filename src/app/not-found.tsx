import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { getT } from "@/i18n";
import { pageLanguage } from "@/i18n/page-language";

// Only the tab title: Next adds the noindex itself for a 404, and the share
// tags stay the layout's.
export async function generateMetadata(): Promise<Metadata> {
  return { title: getT(await pageLanguage())("notFound.pageTitle") };
}

// Next's default 404 is an unstyled white card with no way back. This keeps
// the site chrome and offers the two places a lost visitor is likely to
// want: the quiz they were trying to join, or the start.
export default async function NotFound() {
  const t = getT(await pageLanguage());
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber">{t("notFound.code")}</p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight">{t("notFound.heading")}</h1>
        <p className="mt-3 text-muted">{t("notFound.body")}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/play" className="inline-flex h-11 items-center rounded-xl bg-amber px-4 text-sm font-semibold text-white hover:bg-amber-hover">
            {t("notFound.joinQuiz")}
          </Link>
          <Link href="/" className="inline-flex h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold hover:border-amber">
            {t("notFound.goToStart")}
          </Link>
        </div>
      </main>
    </>
  );
}
