import { createFixedWindowCounter, isCounterUnavailable } from "@/lib/fixed-window-counter";
import { warnCounterUnavailable } from "@/lib/rate-limit";
import { parseCeiling, secondsUntilUtcMidnight, utcDay } from "@/lib/daily-ceiling";
import { MAX_EMAIL_LENGTH } from "@/lib/sign-in-limit-messages";

// Re-exported so a server caller has one import for the whole mechanism; the
// definitions live in a module with no dependencies because the sign-in form
// reads them too. See src/lib/sign-in-limit-messages.ts.
export {
  EMAIL_TOO_LONG_CODE,
  EMAIL_TOO_LONG_MESSAGE,
  MAX_EMAIL_LENGTH,
  SIGN_IN_CODES_PAUSED_CODE,
  SIGN_IN_CODES_PAUSED_MESSAGE,
  TOO_MANY_CODES_FROM_HERE_CODE,
  TOO_MANY_CODES_FROM_HERE_MESSAGE,
  TOO_MANY_CODES_FOR_ADDRESS_CODE,
  TOO_MANY_CODES_FOR_ADDRESS_MESSAGE,
} from "@/lib/sign-in-limit-messages";

/**
 * How many sign-in codes this app will email, and to whom.
 *
 * The reason is a hard external number: Resend's free plan allows 100 emails a
 * day, and that allowance is **shared with another product on the same
 * account**. So a flood here does not merely spam one inbox — it exhausts a
 * quota that something else depends on, and when it is gone every later sign-in
 * email silently fails to send for both.
 *
 * Better Auth's own rate limiting cannot express these caps. It keys on the
 * caller's IP and the path (`customRules` in src/lib/auth.ts) over a minute, so
 * it says nothing about one *mailbox* being hammered from a hundred IPs, about
 * one caller's total for the day, or about the day's total across everybody.
 *
 * All three caps fail **open**, which is the lesson of 27 Sep written down: a bad
 * Upstash token made every Redis call throw and sign-in went down for everyone
 * because the throttle was broken. A throttle that cannot count must not become
 * an outage. The exposure while the store is away is bounded by Better Auth's
 * per-IP rules, which are in front of these and do not need Upstash — and by
 * Resend simply refusing to send once the quota is gone, which is a failure to
 * email rather than a failure to run.
 */

export const PER_ADDRESS_HOURLY_ENV = "SIGNIN_CODE_PER_ADDRESS_HOURLY";
export const DEFAULT_PER_ADDRESS_HOURLY = 3;

/**
 * One caller's codes for the day, whatever addresses they ask for. This is what
 * stops one person spending everybody's allowance: the day's total used to be
 * the only cap a caller changing address each time ever met, and it was 60, so
 * twelve minutes of requests paused email sign-in for every host until midnight.
 */
export const PER_IP_DAILY_ENV = "SIGNIN_CODE_PER_IP_DAILY";
export const DEFAULT_PER_IP_DAILY = 10;

export const DAILY_LIMIT_ENV = "SIGNIN_CODE_DAILY_LIMIT";
/**
 * A backstop, not the working limit: the per-address and per-IP caps are what a
 * caller meets. It is far above Resend's free plan (100 a day, shared), so a
 * flood spread over many networks is stopped by Resend first; set this env var
 * lower to hold some of that allowance back.
 */
export const DEFAULT_DAILY_LIMIT = 500;

export function perAddressHourlyLimit(): number {
  return parseCeiling(process.env[PER_ADDRESS_HOURLY_ENV], DEFAULT_PER_ADDRESS_HOURLY);
}

export function perIpDailyLimit(): number {
  return parseCeiling(process.env[PER_IP_DAILY_ENV], DEFAULT_PER_IP_DAILY);
}

export function dailyCodeLimit(): number {
  return parseCeiling(process.env[DAILY_LIMIT_ENV], DEFAULT_DAILY_LIMIT);
}

/**
 * The address as a counting key: trimmed and lower-cased, nothing more.
 *
 * Deliberately *not* the alias normalisation in src/lib/free-allowance.ts. That
 * one folds gmail dots and +tags together to stop one mailbox claiming several
 * free allowances; doing it here would mean a shared-domain team hitting each
 * other's sign-in cap, and would make this cap a way to probe which addresses
 * an alias scheme collapses to. Case and whitespace are the only two things
 * that are genuinely the same mailbox by definition.
 */
export function signInCodeKeyFor(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * Is this address longer than any real mailbox can be?
 *
 * Measured on the same string the caps count against — `signInCodeKeyFor`, so
 * trimmed and lower-cased — because that is the address as this module
 * understands it, and because surrounding whitespace should not push a legitimate
 * address over the line. Lower-casing cannot change a length.
 *
 * Deliberately a length check and nothing more: the shape of an address is Better
 * Auth's to validate and it does. What it does not do is bound the length, which
 * was measured — a 20,000-character local part validated, wrote a verification
 * row, and had a code sent to it.
 */
export function isEmailTooLong(address: string): boolean {
  return signInCodeKeyFor(address).length > MAX_EMAIL_LENGTH;
}

const counter = createFixedWindowCounter();

/** Exposed for tests: the fallback store is module-level and outlives a test. */
export function __resetSignInLimitCounters() {
  counter.resetMemory();
}

export type SignInCodeDecision =
  | { allowed: true; release: () => Promise<void> }
  | { allowed: false; reason: "address" | "ip" | "global" };

const HOUR_MS = 60 * 60 * 1000;

/**
 * Take permission to email one sign-in code.
 *
 * Narrowest cap first — address, then caller, then the day — so a refused
 * request is told about its own limit and never spends a unit of a wider one:
 * whatever it had already taken is given back before it is refused.
 */
export async function reserveSignInCode(
  address: string,
  ip: string,
  now: Date = new Date()
): Promise<SignInCodeDecision> {
  const day = utcDay(now);
  const dayWindowMs = secondsUntilUtcMidnight(now) * 1000;
  const caps = [
    {
      reason: "address",
      key: `signin:code:address:${signInCodeKeyFor(address)}`,
      windowMs: HOUR_MS,
      limit: perAddressHourlyLimit(),
    },
    { reason: "ip", key: `signin:code:ip:${ip}:${day}`, windowMs: dayWindowMs, limit: perIpDailyLimit() },
    { reason: "global", key: `signin:code:global:${day}`, windowMs: dayWindowMs, limit: dailyCodeLimit() },
  ] as const;

  // Idempotent: each unit is given back once, however often this is called.
  const taken: { key: string; windowMs: number }[] = [];
  const release = async () => {
    for (const { key, windowMs } of taken.splice(0)) {
      try {
        await counter.release(key, windowMs);
      } catch (error) {
        if (!isCounterUnavailable(error)) throw error;
      }
    }
  };

  for (const cap of caps) {
    let count = Infinity; // an explicit 0 is the off switch, refused without counting
    if (cap.limit > 0) {
      try {
        count = await counter.hit(cap.key, cap.windowMs, now.getTime());
      } catch (error) {
        if (!isCounterUnavailable(error)) throw error;
        warnCounterUnavailable(cap.key, error, now.getTime());
        return { allowed: true, release };
      }
      taken.push(cap);
    }
    if (count > cap.limit) {
      await release();
      return { allowed: false, reason: cap.reason };
    }
  }

  return { allowed: true, release };
}
