/**
 * The two refusals the sign-in caps can produce, and nothing else.
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
