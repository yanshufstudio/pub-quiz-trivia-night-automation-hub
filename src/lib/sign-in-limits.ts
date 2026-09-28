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
 * Better Auth's own rate limiting cannot express either cap. It keys on the
 * caller's IP and the path (`customRules` in src/lib/auth.ts), so it bounds one
 * address's requests and says nothing about one *mailbox* being hammered from a
 * hundred IPs, or about the day's total across everybody.
 *
 * Both caps fail **open**, which is the lesson of 27 Sep written down: a bad
 * Upstash token made every Redis call throw and sign-in went down for everyone
 * because the throttle was broken. A throttle that cannot count must not become
 * an outage. The exposure while the store is away is bounded by Better Auth's
 * per-IP rules, which are in front of these and do not need Upstash — and by
 * Resend simply refusing to send once the quota is gone, which is a failure to
 * email rather than a failure to run.
 */

export const PER_ADDRESS_HOURLY_ENV = "SIGNIN_CODE_PER_ADDRESS_HOURLY";
export const DEFAULT_PER_ADDRESS_HOURLY = 3;

export const DAILY_LIMIT_ENV = "SIGNIN_CODE_DAILY_LIMIT";
/**
 * 60, not 100. The rest of Resend's free-plan allowance is deliberately left
 * for the other product sharing the account, and for the genuine resends a real
 * person asks for after a cap has already stopped a flood.
 */
export const DEFAULT_DAILY_LIMIT = 60;

export function perAddressHourlyLimit(): number {
  return parseCeiling(process.env[PER_ADDRESS_HOURLY_ENV], DEFAULT_PER_ADDRESS_HOURLY);
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
  | { allowed: false; reason: "address" | "global" };

const HOUR_MS = 60 * 60 * 1000;

/**
 * Take permission to email one sign-in code.
 *
 * The per-address cap is checked first, so one person asking repeatedly is told
 * about their own address rather than being told the service is paused — and,
 * more importantly, does not consume a unit of the day's shared allowance on the
 * way to being refused.
 */
export async function reserveSignInCode(
  address: string,
  now: Date = new Date()
): Promise<SignInCodeDecision> {
  const addressLimit = perAddressHourlyLimit();
  const addressKey = `signin:code:address:${signInCodeKeyFor(address)}`;

  if (addressLimit === 0) return { allowed: false, reason: "address" };

  let addressCount: number;
  try {
    addressCount = await counter.hit(addressKey, HOUR_MS, now.getTime());
  } catch (error) {
    if (!isCounterUnavailable(error)) throw error;
    warnCounterUnavailable(addressKey, error, now.getTime());
    return { allowed: true, release: async () => {} };
  }

  if (addressCount > addressLimit) {
    try {
      await counter.release(addressKey, HOUR_MS);
    } catch (error) {
      if (!isCounterUnavailable(error)) throw error;
    }
    return { allowed: false, reason: "address" };
  }

  const dayLimit = dailyCodeLimit();
  const dayKey = `signin:code:global:${utcDay(now)}`;
  const dayWindowMs = secondsUntilUtcMidnight(now) * 1000;

  const giveBackAddress = async () => {
    try {
      await counter.release(addressKey, HOUR_MS);
    } catch (error) {
      if (!isCounterUnavailable(error)) throw error;
    }
  };

  if (dayLimit === 0) {
    await giveBackAddress();
    return { allowed: false, reason: "global" };
  }

  let dayCount: number;
  try {
    dayCount = await counter.hit(dayKey, dayWindowMs, now.getTime());
  } catch (error) {
    if (!isCounterUnavailable(error)) throw error;
    warnCounterUnavailable(dayKey, error, now.getTime());
    return { allowed: true, release: giveBackAddress };
  }

  if (dayCount > dayLimit) {
    try {
      await counter.release(dayKey, dayWindowMs);
    } catch (error) {
      if (!isCounterUnavailable(error)) throw error;
    }
    // The address unit goes back too: this person did nothing wrong, and their
    // own hourly allowance should be intact when the day rolls over.
    await giveBackAddress();
    return { allowed: false, reason: "global" };
  }

  let released = false;
  return {
    allowed: true,
    release: async () => {
      if (released) return;
      released = true;
      await giveBackAddress();
      try {
        await counter.release(dayKey, dayWindowMs);
      } catch (error) {
        if (!isCounterUnavailable(error)) throw error;
      }
    },
  };
}
