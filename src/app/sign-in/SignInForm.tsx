"use client";

import { useState } from "react";
import { signIn } from "@/lib/auth-client";

/**
 * Two ways in, no passwords: Google, or a link mailed to the address.
 *
 * The desk styling matches /create and /pricing — cream sheet, amber primary
 * control — so this reads as part of the same building rather than as a
 * library's default form.
 */
export function SignInForm({
  next,
  googleEnabled,
  initialError,
}: {
  next: string;
  googleEnabled: boolean;
  initialError: string | null;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"google" | "email" | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);

  async function onGoogle() {
    setBusy("google");
    setError(null);
    const { error: err } = await signIn.social({
      provider: "google",
      callbackURL: next,
      errorCallbackURL: `/sign-in?next=${encodeURIComponent(next)}`,
    });
    if (err) {
      setBusy(null);
      setError("Couldn't start Google sign-in. Please try again, or use the email link below.");
    }
    // On success the browser is already navigating away, so `busy` stays set
    // deliberately: re-enabling the button would only invite a second click
    // during the redirect.
  }

  async function onEmail(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;

    setBusy("email");
    setError(null);
    const { error: err } = await signIn.magicLink({
      email: address,
      callbackURL: next,
      errorCallbackURL: `/sign-in?next=${encodeURIComponent(next)}`,
    });
    setBusy(null);

    if (err) {
      // Deliberately the same message whatever went wrong. Anything that
      // distinguished "no such account" from "sent" would turn this form
      // into a way to test whether an address has one.
      setError("Couldn't send that link. Check the address and try again.");
      return;
    }
    setSentTo(address);
  }

  if (sentTo) {
    return (
      <div className="paper-sheet mt-8 rounded-xl border border-line px-6 py-8">
        <h2 className="font-serif text-xl font-semibold">Check your inbox</h2>
        <p className="mt-3 text-muted">
          A sign-in link is on its way to <span className="font-medium text-foreground">{sentTo}</span>.
          It works once and expires in 15 minutes.
        </p>
        <p className="mt-3 text-sm text-muted">
          Nothing after a minute or two? Check spam, then{" "}
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
              setError(null);
            }}
            className="font-semibold text-amber hover:underline"
          >
            try a different address
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      {error ? (
        <p role="alert" className="rounded-xl border border-line bg-white/60 px-4 py-3 text-sm text-foreground">
          {error}
        </p>
      ) : null}

      {googleEnabled ? (
        <>
          <button
            type="button"
            onClick={onGoogle}
            disabled={busy !== null}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-semibold transition-colors hover:border-amber/50 disabled:opacity-60"
          >
            <GoogleMark className="h-4 w-4" />
            {busy === "google" ? "Opening Google…" : "Continue with Google"}
          </button>

          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-muted">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      ) : null}

      <form onSubmit={onEmail} className="space-y-3">
        <label htmlFor="sign-in-email" className="block text-sm font-semibold">
          Email address
        </label>
        <input
          id="sign-in-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="h-11 w-full rounded-xl border border-line bg-white px-4 text-base outline-none focus:border-amber"
        />
        <button
          type="submit"
          disabled={busy !== null}
          className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-amber px-4 text-sm font-semibold text-white transition-colors hover:bg-amber-hover disabled:opacity-60"
        >
          {busy === "email" ? "Sending…" : "Email me a sign-in link"}
        </button>
        <p className="text-sm text-muted">
          No password to remember, and none for us to lose.
        </p>
      </form>
    </div>
  );
}

/** Google's mark, inline so the button never waits on a third-party asset. */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2.5 24 .5 14.6.5 6.5 5.9 2.6 13.8l7.8 6.1C12.3 13.7 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.15-3.2-.43-4.7H24v9h12.7c-.55 3-2.2 5.5-4.7 7.2l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.4z" />
      <path fill="#FBBC05" d="M10.4 28.4a14.6 14.6 0 0 1 0-8.8l-7.8-6.1a23.6 23.6 0 0 0 0 21z" />
      <path fill="#34A853" d="M24 47.5c6.2 0 11.5-2 15.3-5.6l-7.6-5.9c-2.1 1.4-4.8 2.3-7.7 2.3-6.4 0-11.7-4.2-13.6-10.4l-7.8 6.1C6.5 42.1 14.6 47.5 24 47.5z" />
    </svg>
  );
}
