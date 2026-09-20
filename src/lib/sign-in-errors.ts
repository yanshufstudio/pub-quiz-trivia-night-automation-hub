/**
 * What a failed sign-in attempt is told to the person.
 *
 * Shared by the /sign-in form and the confirm page the emailed link opens,
 * because the same failure should read the same way whichever half of the
 * email was used — but worded for where they are. Somebody who typed six
 * digits is almost always looking at a typo and has attempts left; somebody
 * who pressed a button on a page they arrived at from an email has nothing
 * to correct and needs a fresh email.
 *
 * None of these says whether the address has an account, and none claims to
 * know *which* way a code failed. Better Auth answers INVALID_OTP whether
 * the digits were wrong, the code was already spent, or no code was ever
 * issued for that address — and that is worth keeping rather than working
 * around: a message that said "already used" would confirm that a code had
 * once been sent to an address, which is exactly what the sign-in form must
 * not tell a stranger.
 */

/** The shape every Better Auth client call reports a failure in. */
export type SignInFailure = { status?: number; code?: string } | null | undefined;

/**
 * Being throttled is the one failure worth naming.
 *
 * The generic wording below is deliberate everywhere else — it is what stops
 * the form being an account-existence oracle. A 429 carries no such risk:
 * the limiter in src/lib/auth.ts is keyed on the caller's address and the
 * path, and knows nothing about whether the address exists. So telling
 * someone they are going too fast reveals nothing, and *not* telling them
 * sends them off to re-read an email address that was never the problem.
 *
 * "A minute" rather than a countdown because all three sign-in rules use a
 * 60-second window (`customRules` in src/lib/auth.ts). Better Auth does send
 * an `X-Retry-After`, but the client surfaces the parsed body rather than
 * the headers, so a precise number here would be a guess dressed up as one.
 */
export const RATE_LIMITED_MESSAGE = "Too many attempts. Wait a minute and try again.";

export function isRateLimited(err: SignInFailure): boolean {
  return err?.status === 429;
}

/** Asking for a code. */
export function signInSendError(err: SignInFailure): string {
  if (isRateLimited(err)) return RATE_LIMITED_MESSAGE;
  return "Couldn't send that code. Check the address and try again.";
}

/** Starting the Google redirect. */
export function googleSignInError(err: SignInFailure): string {
  if (isRateLimited(err)) return RATE_LIMITED_MESSAGE;
  return "Couldn't start Google sign-in. Please try again, or use the email code below.";
}

const TYPED: Record<string, string> = {
  INVALID_OTP: "That code didn't match. Check the six digits and try again.",
  OTP_EXPIRED: "That code has expired. Codes last 15 minutes — ask for a fresh one.",
  TOO_MANY_ATTEMPTS: "Too many wrong codes for that one. Ask for a fresh one.",
};

const FROM_LINK: Record<string, string> = {
  INVALID_OTP:
    "That sign-in link no longer works. Links work once and last 15 minutes — ask for a fresh one.",
  OTP_EXPIRED: "That sign-in link has expired. Links last 15 minutes — ask for a fresh one.",
  TOO_MANY_ATTEMPTS: "Too many wrong codes for that one. Ask for a fresh one.",
};

const FALLBACK = "Couldn't sign you in with that. Ask for a fresh one and try again.";

/** Submitting a code, typed or carried by the emailed link. */
export function signInCodeError(err: SignInFailure, { fromLink = false } = {}): string {
  // Ahead of the code table, because a throttled request never reaches the
  // endpoint that would produce one of those codes — `err.code` is undefined
  // on a 429 and this would otherwise fall through to the generic fallback,
  // which tells someone to ask for a fresh code they are about to be
  // throttled out of asking for.
  if (isRateLimited(err)) return RATE_LIMITED_MESSAGE;
  const table = fromLink ? FROM_LINK : TYPED;
  if (!err?.code) return FALLBACK;
  return table[err.code] ?? FALLBACK;
}
