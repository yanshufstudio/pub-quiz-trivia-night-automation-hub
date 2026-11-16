import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { hostSessionForPage, safeNextPath } from "@/lib/auth-guard";
import { isGoogleSignInConfigured } from "@/lib/auth";
import { SignInForm } from "./SignInForm";
import { getT, type MessageKey, type Translator } from "@/i18n";
import { pageLanguage } from "@/i18n/page-language";

export async function generateMetadata(): Promise<Metadata> {
  const t = getT(await pageLanguage());
  return {
    title: t("signIn.pageTitle"),
    description: t("signIn.description"),
    // Nothing here is worth indexing, and a sign-in page in search results is
    // only ever a phishing lookalike's opportunity.
    robots: { index: false, follow: false },
  };
}

// Reads the session and the incoming `?next=`, so it cannot be prerendered.
export const dynamic = "force-dynamic";

/**
 * `?error=<code>` on the way back from Google.
 *
 * The emailed code needs nothing here: it is submitted by fetch from the
 * form (or from the confirm page), so its failures arrive as a response to
 * read rather than as a redirect — see src/lib/sign-in-errors.ts, which both
 * of those share.
 */
const ERROR_CODES = new Set(["unable_to_create_user", "state_mismatch"]);

function messageFor(t: Translator, code: string | undefined): string | null {
  if (!code) return null;
  return t(ERROR_CODES.has(code) ? (`signIn.googleErrors.${code}` as MessageKey) : "signIn.googleErrors.fallback");
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  // Only ever a path on this site — see safeNextPath. Everything else lands
  // on /packs, so a crafted `?next=//somewhere.else` cannot turn signing in
  // into a redirect off the site.
  const target = safeNextPath(next);

  // Already signed in and no error to read: there is nothing to do here.
  const host = await hostSessionForPage();
  if (host && !error) redirect(target);
  const t = getT(await pageLanguage());

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-10">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{t("signIn.heading")}</h1>
        <p className="mt-2 text-muted">{t("signIn.intro")}</p>
        <SignInForm
          next={target}
          googleEnabled={isGoogleSignInConfigured()}
          initialError={messageFor(t, error)}
        />
        <p className="mt-8 text-sm text-muted">{t("signIn.teamsNote")}</p>
      </main>
    </>
  );
}
