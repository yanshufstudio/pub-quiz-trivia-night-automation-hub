/**
 * Sending the sign-in email, and the one place the test suite is allowed to
 * read one back.
 *
 * One email carries both ways in: a six-digit code to type wherever the
 * person started, and a link to a page that offers to submit that same code
 * for them. They are one secret, not two — see `src/lib/auth.ts` for why that
 * is the shape, and `src/app/sign-in/confirm/page.tsx` for the page the link
 * opens.
 *
 * Resend over plain `fetch` rather than the SDK: one POST to one documented
 * endpoint is not worth a dependency, and `fetch` is what the Next runtime
 * already gives us on every host we deploy to.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type CapturedSignInEmail = {
  email: string;
  /** The six digits. The link below carries the same value. */
  code: string;
  url: string;
  capturedAt: number;
};

/**
 * The capture used by e2e and integration tests to read the email that was
 * "sent". It is a module-level array, so it only ever holds what was minted
 * by the process doing the asserting.
 *
 * Three independent conditions have to hold before anything is ever put in
 * it (see `signInEmailCaptureEnabled`), and `src/lib/sign-in-email.test.ts`
 * asserts that a production-shaped environment cannot satisfy them however
 * the flag is set. That matters more than the convenience: a capture that
 * survived into production would be a way to read other people's sign-in
 * codes out of a running server.
 */
const captured: CapturedSignInEmail[] = [];

export const EMAIL_CAPTURE_ENV = "SIGN_IN_EMAIL_CAPTURE";

/**
 * Capture is off unless ALL of:
 *
 * 1. NODE_ENV is not "production" — a production build can never capture,
 *    whatever else is set. This is the condition that cannot be reached from
 *    a Vercel production deploy at all.
 * 2. SIGN_IN_EMAIL_CAPTURE is exactly "1" — so a dev server does not
 *    accumulate other people's codes by default either.
 * 3. There is no RESEND_API_KEY — capture replaces real sending; it never
 *    runs alongside it, so a misconfiguration cannot both email a code and
 *    park a copy somewhere readable.
 *
 * Read per call, not memoised: the tests set the variable per file, and a
 * value frozen at import would make the order of imports decide the answer.
 */
export function signInEmailCaptureEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === "production") return false;
  if (env[EMAIL_CAPTURE_ENV] !== "1") return false;
  return !env.RESEND_API_KEY;
}

/** Test-only. Returns [] whenever capture is disabled, so a caller that
 * reaches for it in the wrong environment gets nothing rather than stale
 * codes from some earlier configuration. */
export function capturedSignInEmails(): readonly CapturedSignInEmail[] {
  if (!signInEmailCaptureEnabled()) return [];
  return captured;
}

/** Test-only. */
export function clearCapturedSignInEmails(): void {
  captured.length = 0;
}

export class SignInEmailNotConfiguredError extends Error {
  constructor() {
    super("RESEND_API_KEY is not set, so sign-in emails cannot be sent");
    this.name = "SignInEmailNotConfiguredError";
  }
}

export class SignInEmailSendError extends Error {
  constructor(public readonly status: number, public readonly body: string) {
    super(`Resend rejected the sign-in email (HTTP ${status})`);
    this.name = "SignInEmailSendError";
  }
}

function subject() {
  return "Your TriviaFoundry sign-in code";
}

/**
 * The code first, the link second.
 *
 * That order is deliberate: the code is the half that works when the mail is
 * read on a phone and the quiz is being set up on a pub PC, and it is also
 * the half that still works if something between us and the reader has
 * already opened the link.
 */
function textBody({ code, url }: { code: string; url: string }) {
  return [
    `Your TriviaFoundry sign-in code is ${code}`,
    "",
    "Type it into the sign-in page you started on — that works even if you",
    "are reading this on a different device.",
    "",
    "Or open this link and press the button there to sign in:",
    "",
    url,
    "",
    "The code works once and expires in 15 minutes.",
    "If you didn't ask to sign in, you can ignore this email — nobody can",
    "sign in as you without the code above.",
  ].join("\n");
}

function htmlBody({ code, url }: { code: string; url: string }) {
  // Deliberately plain. An email client is not our design system, and a
  // sign-in email that renders as bare, obviously-readable text is easier to
  // trust than one hidden behind a styled button.
  return [
    `<p>Your TriviaFoundry sign-in code is:</p>`,
    `<p style="font-size:28px;letter-spacing:6px;font-weight:600">${code}</p>`,
    `<p>Type it into the sign-in page you started on — that works even if you are reading this on a different device.</p>`,
    `<p>Or open this link and press the button there to sign in:</p>`,
    `<p><a href="${url}">${url}</a></p>`,
    `<p>The code works once and expires in 15 minutes.</p>`,
    `<p>If you didn't ask to sign in, you can ignore this email — nobody can sign in as you without the code above.</p>`,
  ].join("");
}

/**
 * Deliver one sign-in email.
 *
 * Production (NODE_ENV === "production") with no RESEND_API_KEY throws. It
 * must: a silent no-op there means every host who chooses the email route is
 * told "check your inbox" for a mail that was never sent, and the only
 * symptom is people quietly failing to sign in. Outside production the code
 * goes to the server console instead, which is what makes `npm run dev` work
 * with no mail provider at all.
 */
export async function sendSignInEmail({
  email,
  code,
  url,
}: {
  email: string;
  code: string;
  url: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") throw new SignInEmailNotConfiguredError();
    if (signInEmailCaptureEnabled()) {
      captured.push({ email, code, url, capturedAt: Date.now() });
      return;
    }
    // The local-dev delivery channel: with no mail provider configured, the
    // server log IS the inbox.
    console.log(`\n[sign-in] code for ${email}: ${code}\n[sign-in] or open: ${url}\n`);
    return;
  }

  if (!from) throw new SignInEmailNotConfiguredError();

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: subject(),
      text: textBody({ code, url }),
      html: htmlBody({ code, url }),
    }),
  });

  if (!res.ok) {
    // Read the body for the log, but never put it in the error shown to a
    // visitor: Resend echoes the address it was asked to mail, and the
    // sign-in form must not become a way to confirm one.
    const body = await res.text().catch(() => "");
    throw new SignInEmailSendError(res.status, body);
  }
}
