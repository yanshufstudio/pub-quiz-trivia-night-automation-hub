"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { signInCodeError } from "@/lib/sign-in-errors";

/**
 * The button — and nothing but the button — that spends the code.
 *
 * Deliberately not a `useEffect` that submits on mount. The whole point of
 * the confirm page is that something which merely *fetches* the URL has not
 * signed anybody in and has not burned the code, and an effect that fired on
 * render would put us straight back where the magic link was.
 *
 * Where it lands is `/packs` rather than wherever the host was going when
 * they asked to sign in. Nothing carries that intent through the email, on
 * purpose: this link is routinely opened on a different device from the one
 * that started, so "finish where you left off" is not a thing it can honour,
 * and a redirect target arriving from an inbox is one more thing to have to
 * validate. Typing the code into the tab you started in keeps the journey —
 * see `SignInForm`.
 */
export function ConfirmSignIn({ email, code }: { email: string; code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setBusy(true);
    setError(null);
    const { error: err } = await signIn.emailOtp({ email, otp: code });
    if (err) {
      setBusy(false);
      setError(signInCodeError(err.code, { fromLink: true }));
      return;
    }
    // `refresh` before `push`: /packs renders from the session on the
    // server, and the client cache may still be holding what this route
    // looked like a moment ago, when nobody was signed in.
    router.refresh();
    router.push("/packs");
  }

  return (
    <div className="paper-sheet mt-8 rounded-xl border border-line px-6 py-8">
      <p className="text-muted">
        Sign in as <span className="font-medium text-foreground">{email}</span>?
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-line bg-white/60 px-4 py-3 text-sm text-foreground"
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-amber px-4 text-sm font-semibold text-white transition-colors hover:bg-amber-hover disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <p className="mt-4 text-sm text-muted">
        Not you? Close this page — nothing has happened yet. Need a fresh code?{" "}
        <Link href="/sign-in" className="font-semibold text-amber hover:underline">
          Start again
        </Link>
        .
      </p>
    </div>
  );
}
