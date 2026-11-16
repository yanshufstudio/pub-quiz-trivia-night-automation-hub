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

import { getT, type MessageKey, type Translator } from "@/i18n";
import {
  EMAIL_TOO_LONG_CODE,
  SIGN_IN_CODES_PAUSED_CODE,
  TOO_MANY_CODES_FOR_ADDRESS_CODE,
  TOO_MANY_CODES_FROM_HERE_CODE,
} from "@/lib/sign-in-limit-messages";

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
export const RATE_LIMITED_MESSAGE = getT("en")("signIn.errors.rateLimited");

export function isRateLimited(err: SignInFailure): boolean {
  return err?.status === 429;
}

/** Asking for a code. Worded in `t`'s language (L1). */
export function signInSendError(err: SignInFailure, t: Translator = getT()): string {
  // Ahead of the generic 429 wording, because both of these *are* 429s and
  // "wait a minute and try again" would be false for either: one resets in an
  // hour and the other tomorrow, and both have a working alternative sitting
  // above the form (M2).
  // Not a throttle at all: a 400 that no amount of waiting fixes, so it is
  // ahead of everything and says what to change.
  if (err?.code === EMAIL_TOO_LONG_CODE) return t("signIn.errors.emailTooLong");
  if (err?.code === SIGN_IN_CODES_PAUSED_CODE) return t("signIn.errors.codesPaused");
  if (err?.code === TOO_MANY_CODES_FOR_ADDRESS_CODE) return t("signIn.errors.tooManyForAddress");
  if (err?.code === TOO_MANY_CODES_FROM_HERE_CODE) return t("signIn.errors.tooManyFromHere");
  if (isRateLimited(err)) return t("signIn.errors.rateLimited");
  return t("signIn.errors.sendFailed");
}

/** Starting the Google redirect. */
export function googleSignInError(err: SignInFailure, t: Translator = getT()): string {
  if (isRateLimited(err)) return t("signIn.errors.rateLimited");
  return t("signIn.errors.googleFailed");
}

/** The Better Auth codes with a message of their own, typed or from the link. */
const CODES = new Set(["INVALID_OTP", "OTP_EXPIRED", "TOO_MANY_ATTEMPTS"]);

/** Submitting a code, typed or carried by the emailed link. */
export function signInCodeError(
  err: SignInFailure,
  { fromLink = false } = {},
  t: Translator = getT()
): string {
  // Ahead of the code table, because a throttled request never reaches the
  // endpoint that would produce one of those codes — `err.code` is undefined
  // on a 429 and this would otherwise fall through to the generic fallback,
  // which tells someone to ask for a fresh code they are about to be
  // throttled out of asking for.
  if (isRateLimited(err)) return t("signIn.errors.rateLimited");
  if (!err?.code || !CODES.has(err.code)) return t("signIn.errors.fallback");
  return t(`signIn.errors.${fromLink ? "fromLink" : "typed"}.${err.code}` as MessageKey);
}
