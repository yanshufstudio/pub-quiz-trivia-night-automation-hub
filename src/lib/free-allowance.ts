import { createHash } from "node:crypto";
import { createFixedWindowCounter, isCounterUnavailable } from "@/lib/fixed-window-counter";
import { warnCounterUnavailable } from "@/lib/rate-limit";
import { parseCeiling, secondsUntilUtcMidnight, utcDay } from "@/lib/daily-ceiling";
import { FREE_LIMIT } from "@/lib/creator";
import { db } from "@/lib/db";

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
 * **Both are enforced here now.** (2) is a fixed-window counter keyed on the
 * address. (1) is `reserveMailboxGeneration`, which is not a counter at all: it
 * is a row per mailbox carrying its own 30-day period, because the window a
 * counter gives you starts on first use and a Creator's period starts on
 * `periodStartedAt`, and two clocks that drift refuse a legitimate host whose
 * own period has legitimately rolled. That was measured, not feared — see the
 * note on `reserveMailboxGeneration`.
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
 * What consumes it is `reserveMailboxGeneration` below, via `freeAllowanceKey`.
 * It is deliberately not a fixed-window counter: that window would open on the
 * mailbox's first generation while a Creator's period rolls from
 * `periodStartedAt`, and the drift refuses a legitimate host whose own 30-day
 * period has legitimately reset. Measured, not feared — wiring it that way broke
 * "resets the count for an account whose period has already expired" in
 * src/test/generate-cap.integration.test.ts, which is exactly a real user coming
 * back after a month. So the shared allowance carries its own period instead.
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

/**
 * The stored key for a mailbox: a digest, never the address.
 *
 * The row it keys has to outlive the deletion of every account behind it. A cap
 * that a "delete my account" resets is not a cap — it is two more free packs for
 * anyone who notices — so the row cannot be cleaned up with the account, and a
 * row designed to outlive the account must not be a second stored copy of
 * somebody's email address. Equality is the only thing this table ever asks of
 * the key, and a digest answers that.
 *
 * Unkeyed on purpose. An HMAC would stop somebody holding only this table from
 * confirming a guess, but it would tie every allowance to BETTER_AUTH_SECRET, so
 * rotating that secret would silently hand every mailbox a fresh allowance —
 * and anybody holding the database already has the real addresses on `User`, so
 * the key would be buying protection against an attacker who does not exist.
 *
 * The `v1.` prefix names the normalisation the digest was taken under. If those
 * rules ever change, the keys change with them, and the prefix makes that a
 * visible decision (every mailbox starts a fresh allowance) rather than a silent
 * one.
 */
export const FREE_ALLOWANCE_KEY_VERSION = "v1";

export function freeAllowanceKey(email: string): string {
  const digest = createHash("sha256").update(normaliseForFreeAllowance(email)).digest("hex");
  return `${FREE_ALLOWANCE_KEY_VERSION}.${digest}`;
}

/** Exported so the retention sweep cuts at exactly the boundary the reservation
 * rolls at. Two definitions of "the period has ended" would eventually disagree,
 * and the disagreeing one would be deleting rows that still count. */
export const MAILBOX_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * What a host is told when the mailbox behind their account is out of free packs
 * but this particular account is not.
 *
 * Deliberately the same sentence the per-account cap uses. It is true — the free
 * packs for this mailbox are spent — and saying more would be worse in both
 * directions: it would explain the alias folding to somebody looking for a way
 * around it, and it would accuse a person who may simply have two accounts of
 * something they did not knowingly do. "Upgrade to Pro" is the honest way out
 * either way, and it is the same one.
 */
export const MAILBOX_LIMIT_MESSAGE =
  "You've used your free packs for this period. Upgrade to Pro to lift the limit.";

export type MailboxReservation = {
  reserved: boolean;
  used: number;
  limit: number;
  release: () => Promise<void>;
};

/**
 * H1(b) — claim one of the mailbox's free generations, before the model runs.
 *
 * This is the cap that a supply of aliases cannot rotate around. The per-account
 * reservation (`reserveFreeGeneration` in src/lib/creator.ts) still runs first
 * and still decides what one account may have; this one decides what one *inbox*
 * may have, however many accounts it holds.
 *
 * **`anchor` is the requesting creator's `periodStartedAt`, and getting it from
 * the caller is the whole design.** The first attempt at this gave the row a
 * period of its own, starting at the mailbox's first generation — and that is the
 * drift this was supposed to avoid, just moved. A Creator's period starts at
 * sign-up, so somebody who signs up, waits three weeks and then generates has a
 * row whose 30 days end up to three weeks after their account's do: their
 * account rolls, hands them two packs, and the mailbox refuses them for the rest
 * of the month. Caught by "resets the count for an account whose period has
 * already expired" in src/test/generate-cap.integration.test.ts — the same test
 * that caught the fixed-window-counter version, which is worth saying plainly:
 * two different designs, same test, same lesson.
 *
 * So the shared period is anchored at the **oldest** period start among the
 * accounts that use the mailbox. An older anchor pulls the row's back; a newer
 * one never pulls it forward, which is what keeps the cap: every fresh account
 * has a brand-new `periodStartedAt`, and honouring that would hand a fresh
 * allowance to anybody who signed up again. Pulling *back* is safe — it can only
 * make the shared period end sooner, and it can only be done with an account
 * that genuinely is that old, whose own allowance has rolled anyway.
 *
 * It mirrors `reserveFreeGeneration` statement for statement otherwise, because
 * it has the same two races to lose:
 *
 * - **The roll.** Two requests that both see an expired period would both zero
 *   the count, the second wiping the first's increment. Every write here is
 *   conditional on the `periodStartedAt` this request actually read, so only one
 *   wins and the loser falls through to claim against what the winner left.
 * - **The claim.** The check and the increment are one conditional `updateMany`,
 *   so the database decides who took the last one rather than two processes
 *   deciding from the same stale read. `count === 0` means somebody else got it.
 *
 * And the release is conditional on the period it was taken against, because a
 * generation can take a minute and a 30-day period can end inside that minute:
 * decrementing blind would refund an old period's reservation against the new
 * one's count.
 *
 * Unlike the per-IP cap above this does **not** fail open, because there is
 * nothing to fail: it is a row in the same database the pack itself is written
 * to. If that is unreachable there is no generation to protect.
 */
export async function reserveMailboxGeneration(
  email: string,
  anchor: Date,
  limit: number = FREE_LIMIT,
  now: Date = new Date()
): Promise<MailboxReservation> {
  const key = freeAllowanceKey(email);

  // A limit of zero refuses without writing anything, as the ceilings do.
  if (limit <= 0) {
    return { reserved: false, used: 0, limit, release: async () => {} };
  }

  // First generation from this mailbox: the row has to exist before it can be
  // claimed against, and it starts on this account's period rather than on now.
  // `upsert` rather than create, because two first requests race here and the
  // loser must find the winner's row rather than a constraint violation.
  //
  // Creating it at `anchor` rather than at `now` is not what makes the anchoring
  // correct — the pull-back below would fix a row created at `now` inside this
  // same request, and a mutation replacing `anchor` with `now` here survives the
  // suite for exactly that reason. It is kept because it is the truthful value
  // and because it saves the pull-back's write on every mailbox's first
  // generation, and because a pull-back that lost its race would leave this
  // request holding a period the row does not have, which makes its release
  // match nothing.
  const existing = await db.mailboxAllowance.upsert({
    where: { key },
    update: {},
    create: { key, packsGenerated: 0, periodStartedAt: anchor, createdAt: now },
  });

  // An older account than any that has used this mailbox before pulls the shared
  // period back to its own start. Conditional on what was read, so a race leaves
  // one winner rather than two half-applied anchors.
  let period = existing.periodStartedAt;
  if (anchor.getTime() < period.getTime()) {
    await db.mailboxAllowance.updateMany({
      where: { key, periodStartedAt: period },
      data: { periodStartedAt: anchor },
    });
    period = anchor;
  }

  const expired = now.getTime() - period.getTime() > MAILBOX_PERIOD_MS;
  const claimedPeriod = expired ? now : period;
  if (expired) {
    await db.mailboxAllowance.updateMany({
      where: { key, periodStartedAt: period },
      data: { packsGenerated: 0, periodStartedAt: claimedPeriod },
    });
  }

  const claimed = await db.mailboxAllowance.updateMany({
    where: { key, packsGenerated: { lt: limit } },
    data: { packsGenerated: { increment: 1 } },
  });

  if (claimed.count === 0) {
    const current = await db.mailboxAllowance.findUnique({ where: { key } });
    return { reserved: false, used: current?.packsGenerated ?? limit, limit, release: async () => {} };
  }

  let released = false;
  return {
    reserved: true,
    used: (expired ? 0 : existing.packsGenerated) + 1,
    limit,
    release: async () => {
      if (released) return;
      released = true;
      await db.mailboxAllowance.updateMany({
        where: { key, periodStartedAt: claimedPeriod, packsGenerated: { gt: 0 } },
        data: { packsGenerated: { decrement: 1 } },
      });
    },
  };
}
