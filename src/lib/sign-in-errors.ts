/**
 * What a failed code submission is told to the person.
 *
 * Shared by the /sign-in form and the confirm page the emailed link opens,
 * because the same failure should read the same way — but worded for where
 * they are. Somebody who typed six digits is almost always looking at a
 * typo and has attempts left; somebody who pressed a button on a page they
 * arrived at from an email has nothing to correct and needs a fresh email.
 *
 * None of these says whether the address has an account, and none claims to
 * know *which* way a code failed. Better Auth answers INVALID_OTP whether
 * the digits were wrong, the code was already spent, or no code was ever
 * issued for that address — and that is worth keeping rather than working
 * around: a message that said "already used" would confirm that a code had
 * once been sent to an address, which is exactly what the sign-in form must
 * not tell a stranger.
 */

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

export function signInCodeError(code: string | undefined | null, { fromLink = false } = {}): string {
  const table = fromLink ? FROM_LINK : TYPED;
  if (!code) return FALLBACK;
  return table[code] ?? FALLBACK;
}
