import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { hostSessionForPage, safeNextPath } from "@/lib/auth-guard";
import { isGoogleSignInConfigured } from "@/lib/auth";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = {
  title: "Sign in · TriviaFoundry",
  description: "Sign in to write, print and run your quiz packs.",
  // Nothing here is worth indexing, and a sign-in page in search results is
  // only ever a phishing lookalike's opportunity.
  robots: { index: false, follow: false },
};

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
const ERROR_MESSAGES: Record<string, string> = {
  unable_to_create_user: "Something went wrong setting up your account. Please try again.",
  state_mismatch: "That Google sign-in didn't complete. Please try again.",
};

function messageFor(code: string | undefined): string | null {
  if (!code) return null;
  return ERROR_MESSAGES[code] ?? "That sign-in didn't complete. Try again below.";
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

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-10">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-muted">
          Your packs, your plan and your free allowance live on your account — not in this
          browser. Signing in on any device brings all three with you.
        </p>
        <SignInForm
          next={target}
          googleEnabled={isGoogleSignInConfigured()}
          initialError={messageFor(error)}
        />
        <p className="mt-8 text-sm text-muted">
          Running a quiz as a team? You don&apos;t need an account — just the join code from your
          host.
        </p>
      </main>
    </>
  );
}
