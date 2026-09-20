import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { ConfirmSignIn } from "./ConfirmSignIn";

export const metadata: Metadata = {
  title: "Confirm sign-in · TriviaFoundry",
  description: "Finish signing in to TriviaFoundry.",
  // A URL carrying a live sign-in code is the last thing that should be in
  // an index, and /sign-in* is disallowed in robots.txt as well.
  robots: { index: false, follow: false },
  // The code is in this page's URL, so the URL is a credential for the next
  // fifteen minutes. Browsers default to `strict-origin-when-cross-origin`,
  // which already strips the query off a cross-origin Referer — this says it
  // rather than inheriting it, and covers same-origin navigations too.
  referrer: "no-referrer",
};

// Reads the code out of the query string, so it can never be prerendered.
export const dynamic = "force-dynamic";

/** RFC-shaped enough, and capped: 254 is the longest address SMTP carries. */
const ADDRESS = /^[^\s@,<>"]{1,64}@[^\s@,<>"]{1,189}\.[A-Za-z]{2,24}$/;

function looksLikeAnAddress(value: string | undefined): value is string {
  return typeof value === "string" && value.length <= 254 && ADDRESS.test(value);
}

/**
 * The page the link in the sign-in email opens.
 *
 * **It consumes nothing.** That is the entire reason it exists. The previous
 * design mailed a link straight to Better Auth's `GET /magic-link/verify`,
 * which spends the token on the first GET — and corporate mail filters
 * (Microsoft 365 Safe Links, Defender, Proofpoint and friends) fetch links in
 * incoming mail before the person ever clicks. For a host behind one of
 * those, the link was already spent and their first click said "already been
 * used". A scanner that fetches this page gets a button and nothing else:
 * the code is still whole, and so is the one printed in the same email.
 *
 * So there is no database call here, no session lookup, and no `useEffect`
 * that submits on arrival. Only the button in `ConfirmSignIn` — a POST to
 * `/api/auth/sign-in/email-otp` — spends anything.
 *
 * The page never asks whether the code is real, either. Saying "that code
 * has expired" to an unauthenticated GET would hand a scanner (or anyone who
 * intercepted the URL) a free oracle on whether the code is still live;
 * finding that out is what pressing the button is for.
 */
export default async function ConfirmSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; code?: string }>;
}) {
  const { email, code } = await searchParams;

  // A shape check, not a truth check — whether the code is live is what
  // pressing the button finds out. It is deliberately tight all the same:
  // this page prints the address back, and anyone can craft a URL for it, so
  // "looks like an email address, and is short" is what stops the page being
  // a way to render someone else's words on our domain.
  const usable = looksLikeAnAddress(email) && /^\d{4,8}$/.test(code ?? "");

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-10">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Confirm sign-in</h1>
        {usable ? (
          <ConfirmSignIn email={email} code={code as string} />
        ) : (
          <div className="paper-sheet mt-8 rounded-xl border border-line px-6 py-8">
            <p role="alert" className="text-muted">
              That link is missing the part that signs you in — some mail clients cut long links in
              half. Type the six-digit code from the same email instead.
            </p>
            <Link
              href="/sign-in"
              className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-amber px-5 text-sm font-semibold text-white transition-colors hover:bg-amber-hover"
            >
              Back to sign in
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
