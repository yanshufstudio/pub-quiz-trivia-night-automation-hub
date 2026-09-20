"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { emailOtp, signIn } from "@/lib/auth-client";
import { googleSignInError, signInCodeError, signInSendError } from "@/lib/sign-in-errors";

/**
 * Two ways in, no passwords: Google, or a code mailed to the address.
 *
 * The email carries the code *and* a link to a page that offers to submit it
 * for you. This form is the other end of the same code: a host who reads
 * their mail on a phone and runs the quiz on a pub PC types the six digits
 * here instead of trying to open a link on the wrong machine.
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
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"google" | "email" | "code" | null>(null);
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
      setError(googleSignInError(err));
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
    const { error: err } = await emailOtp.sendVerificationOtp({ email: address, type: "sign-in" });
    setBusy(null);

    if (err) {
      // Deliberately the same message whatever went wrong, with one
      // exception: being throttled is named, because a 429 cannot leak
      // whether an address has an account. See src/lib/sign-in-errors.ts.
      setError(signInSendError(err));
      return;
    }
    setCode("");
    setSentTo(address);
  }

  async function onCode(event: React.FormEvent) {
    event.preventDefault();
    const digits = code.trim();
    if (!sentTo || !digits) return;

    setBusy("code");
    setError(null);
    const { error: err } = await signIn.emailOtp({ email: sentTo, otp: digits });

    if (err) {
      setBusy(null);
      setError(signInCodeError(err));
      return;
    }

    // `next` reached this component from the server already narrowed to a
    // path on this site (`safeNextPath`), which is what makes it safe to
    // hand to the router at all. `refresh` before `push` because the target
    // renders from the session and the client cache may still be holding
    // what it looked like while nobody was signed in.
    router.refresh();
    router.push(next);
  }

  if (sentTo) {
    return (
      <div className="paper-sheet mt-8 rounded-xl border border-line px-6 py-8">
        <h2 className="font-serif text-xl font-semibold">Check your inbox</h2>
        <p className="mt-3 text-muted">
          A six-digit code is on its way to{" "}
          <span className="font-medium text-foreground">{sentTo}</span>. Type it in below — or open
          the link in the same email and press the button there. Either works once, and both expire
          in 15 minutes.
        </p>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-line bg-white/60 px-4 py-3 text-sm text-foreground"
          >
            {error}
          </p>
        ) : null}

        <form onSubmit={onCode} className="mt-5 space-y-3">
          <label htmlFor="sign-in-code" className="block text-sm font-semibold">
            Sign-in code
          </label>
          <input
            id="sign-in-code"
            name="code"
            type="text"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            // Lets a phone keyboard and a password manager both recognise it,
            // and stops an autocorrect turning six digits into something else.
            autoCorrect="off"
            spellCheck={false}
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            className="h-11 w-full rounded-xl border border-line bg-white px-4 font-mono text-lg tracking-[0.4em] outline-none focus:border-amber"
          />
          <button
            type="submit"
            disabled={busy !== null || code.length < 6}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-amber px-4 text-sm font-semibold text-white transition-colors hover:bg-amber-hover disabled:opacity-60"
          >
            {busy === "code" ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-sm text-muted">
          Nothing after a minute or two? Check spam, then{" "}
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
              setCode("");
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
          {busy === "email" ? "Sending…" : "Email me a sign-in code"}
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
