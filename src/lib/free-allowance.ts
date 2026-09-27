import { createFixedWindowCounter, isCounterUnavailable } from "@/lib/fixed-window-counter";
import { warnCounterUnavailable } from "@/lib/rate-limit";
import { parseCeiling, secondsUntilUtcMidnight, utcDay } from "@/lib/daily-ceiling";

/**
 * Two ways the free tier was free for the taking, and neither needed a cookie.
 *
 * Accounts closed the cookie door: generation needs one now, so dropping a
 * `pq_creator` cookie no longer hands out a fresh allowance. What it did not
 * close is that **signing up is free**, and one person can hold any number of
 * accounts:
 *
 * 1. **Aliases of one mailbox.** `someone+1@gmail.com`, `someone+2@gmail.com`
 *    and `some.one@googlemail.com` are all the same inbox, and Google delivers
 *    all of them. Each was a separate account with its own two free packs, for
 *    as long as somebody cared to keep typing.
 * 2. **One machine, many accounts.** Even with unrelated addresses, nothing
 *    bounded how many free packs one caller could take in a day. The per-IP
 *    limiter on the generate route allows 5 per 10 minutes — about 720 a day —
 *    which is a throttle, not a cap.
 *
 * Neither is fixed by charging more carefully; both are fixed by counting
 * something the attacker cannot rotate for free: the address the packs are asked
 * for from, and the mailbox behind the aliases.
 *
 * **Only (2) is enforced here.** `normaliseForFreeAllowance` below is the
 * mailbox key that (1) needs, and it is deliberately not wired to anything yet —
 * a fixed-window counter is the wrong substrate for it, and the right one needs a
 * decision that is not mine to make. See the note on that function.
 *
 * Both counters are Upstash-backed and **fail open**, per N1: an abuse control
 * that cannot count must not stop paying and legitimate users working. The
 * global daily ceiling (src/lib/daily-ceiling.ts) still fails closed behind
 * them, so an outage cannot turn into unbounded spend — it can only turn into
 * unbounded *free-tier fairness*, briefly.
 */

export const FREE_IP_DAILY_LIMIT_ENV = "FREE_IP_DAILY_LIMIT";

/**
 * Five free packs a day from one address. A real host on the free tier gets two
 * per 30-day period, so five a day is already far more than legitimate use from
 * one home or one pub's wifi — and it is deliberately not one, because a shared
 * NAT address (a pub, an office, a campus) can carry several genuine hosts.
 */
export const DEFAULT_FREE_IP_DAILY_LIMIT = 5;

export const FREE_IP_LIMIT_MESSAGE =
  "This network has used its free packs for today. Try again tomorrow, or upgrade to Pro.";

export function freeIpDailyLimit(): number {
  return parseCeiling(process.env[FREE_IP_DAILY_LIMIT_ENV], DEFAULT_FREE_IP_DAILY_LIMIT);
}

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * The mailbox behind an address, **for free-allowance counting only**.
 *
 * This is emphatically not an identity. Sign-in, account lookup and every
 * `User.email` comparison are untouched and must stay untouched: an account
 * created as `Some.One+quiz@Gmail.com` signs in as exactly that, today and
 * after this change. What this produces is a counting key, used in one place, to
 * answer one question — which accounts are the same person helping themselves to
 * another two free packs.
 *
 * - Always trimmed and lower-cased. Domains are case-insensitive by RFC, and
 *   every real-world mailbox treats the local part that way too.
 * - **gmail.com and googlemail.com**: `+tag` stripped, dots removed, and
 *   googlemail folded into gmail. All three are Google's own documented
 *   equivalences — `s.o.m.e+anything@googlemail.com` is one inbox.
 * - **Every other domain**: `+tag` stripped and nothing else. Plus-addressing is
 *   near-universal; dot-folding is a Gmail peculiarity, and applying it
 *   elsewhere would merge `first.last@company.com` with `firstlast@company.com`,
 *   which at most companies are two different people. Being wrong in that
 *   direction would deny a real customer their free packs, which is worse than
 *   letting a determined abuser have two more.
 *
 * **Not wired to anything yet, on purpose.** Sharing one allowance across several
 * accounts needs somewhere to keep the shared count, and the obvious cheap
 * substrate — a 30-day fixed-window counter keyed on this string — is wrong. Its
 * window opens on the mailbox's first generation, while a Creator's free period
 * rolls from `periodStartedAt`; the two anchors differ, so they drift apart, and
 * the drift refuses a legitimate host whose own 30-day period has legitimately
 * reset. That is not a theory: wiring it that way broke
 * "resets the count for an account whose period has already expired" in
 * src/test/generate-cap.integration.test.ts, which is exactly a real user coming
 * back after a month.
 *
 * Doing it properly means the shared allowance carries its own period, the same
 * way a Creator's does — a row per mailbox, rolled by the same rule. That is a
 * new table rather than an additive column, so it is the owner's call (H1).
 *
 * An address with no `@`, or an empty local part, is returned lower-cased and
 * otherwise untouched: it cannot be reasoned about, and it cannot have signed in
 * either, since Better Auth validates the address first.
 */
export function normaliseForFreeAllowance(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return trimmed;

  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  // Strip the tag everywhere. "+tag" with an empty local part ("+a@x.com") is
  // left alone rather than reduced to nothing.
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);

  if (GMAIL_DOMAINS.has(domain)) {
    const withoutDots = local.replace(/\./g, "");
    // Only if something survives: "...@gmail.com" must not become "@gmail.com".
    return `${withoutDots || local}@gmail.com`;
  }

  return `${local}@${domain}`;
}

const counter = createFixedWindowCounter();

/** Exposed for tests: the fallback store is module-level and outlives a test. */
export function __resetFreeAllowanceCounters() {
  counter.resetMemory();
}

export type FreeReservation = {
  allowed: boolean;
  limit: number;
  used: number;
  retryAfterSeconds: number;
  release: () => Promise<void>;
};

const NO_OP_RELEASE = async () => {};

async function giveBack(key: string, windowMs: number) {
  try {
    await counter.release(key, windowMs);
  } catch (error) {
    if (!isCounterUnavailable(error)) throw error;
  }
}

/**
 * H1(a) — how many free packs one address may take in a UTC day.
 *
 * Fails open (N1). The exposure is one address generating freely while Upstash
 * is away, which the global ceiling still bounds in money terms.
 */
export async function reserveFreeIpDaily(ip: string, now: Date = new Date()): Promise<FreeReservation> {
  const limit = freeIpDailyLimit();
  const ttlSeconds = secondsUntilUtcMidnight(now);
  if (limit === 0) {
    return { allowed: false, limit, used: 0, retryAfterSeconds: ttlSeconds, release: NO_OP_RELEASE };
  }

  const key = `generate:free:ip:${ip}:${utcDay(now)}`;
  const windowMs = ttlSeconds * 1000;

  let count: number;
  try {
    count = await counter.hit(key, windowMs, now.getTime());
  } catch (error) {
    if (!isCounterUnavailable(error)) throw error;
    warnCounterUnavailable(key, error, now.getTime());
    return { allowed: true, limit, used: 0, retryAfterSeconds: 0, release: NO_OP_RELEASE };
  }

  if (count > limit) {
    await giveBack(key, windowMs);
    return { allowed: false, limit, used: limit, retryAfterSeconds: ttlSeconds, release: NO_OP_RELEASE };
  }

  let released = false;
  return {
    allowed: true,
    limit,
    used: count,
    retryAfterSeconds: 0,
    release: async () => {
      if (released) return;
      released = true;
      await giveBack(key, windowMs);
    },
  };
}
