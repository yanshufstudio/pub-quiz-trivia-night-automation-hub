/**
 * The refusals the sign-in caps can produce, and nothing else.
 *
 * A file of its own because both sides need them: the server throws them
 * (src/lib/sign-in-limits.ts) and the form reads them back
 * (src/lib/sign-in-errors.ts, imported by a client component). Putting them in
 * sign-in-limits.ts would pull that module's Upstash client into the browser
 * bundle for the sake of four strings.
 */

export const SIGN_IN_CODES_PAUSED_CODE = "SIGN_IN_CODES_PAUSED";
export const SIGN_IN_CODES_PAUSED_MESSAGE =
  "Email codes are paused until tomorrow — please use Google sign-in.";

export const TOO_MANY_CODES_FOR_ADDRESS_CODE = "TOO_MANY_CODES_FOR_ADDRESS";
export const TOO_MANY_CODES_FOR_ADDRESS_MESSAGE =
  "Too many codes sent to that address. Wait an hour, or use Google sign-in.";

/**
 * The longest address we will take, and why it is 254 rather than a round number.
 *
 * RFC 5321 bounds a `MAIL FROM`/`RCPT TO` path at 256 octets *including* the
 * angle brackets, which leaves 254 for the address itself. Anything longer is not
 * a mailbox anybody has: it is a mistake, a paste, or somebody probing what we do
 * with it.
 *
 * Refused at the same boundary as the caps and for a related reason. Better Auth
 * accepts an address of any length — measured, with a 20,000-character local part:
 * it validated, a verification row was written and a code went out, which in
 * production means handing it to Resend. So this is checked *before* a code is
 * created or sent rather than left to the mail provider to reject.
 *
 * 400 rather than 429: this one does not reset, and retrying the same address
 * cannot help. The only fix is a different address, which the message says.
 */
export const MAX_EMAIL_LENGTH = 254;

export const EMAIL_TOO_LONG_CODE = "EMAIL_TOO_LONG";
export const EMAIL_TOO_LONG_MESSAGE =
  "That email address is too long — addresses can be at most 254 characters. Check it and try again.";
