import { createFixedWindowCounter, isCounterUnavailable } from "@/lib/fixed-window-counter";
import { parseCeiling, secondsUntilUtcMidnight, utcDay } from "@/lib/daily-ceiling";
import type { Creator } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * What one Pro subscriber may generate, and what they have generated.
 *
 * Two different numbers, for two different jobs:
 *
 * - **A per-user daily cap** (H2). The shared ceiling in
 *   src/lib/daily-ceiling.ts bounds the whole deployment's spend, with no
 *   identity in its key at all — which means one Pro subscriber running a loop
 *   could consume the entire day's Pro capacity and lock out every other
 *   paying customer. /pricing promised "as many as you want" until 25 Sep;
 *   what it promises now is ten a day, and this is the thing that makes that
 *   sentence true rather than aspirational.
 * - **A per-billing-period count** (M8), which is what /refunds' terms are
 *   written in terms of. Stored on the Creator, and rolled only when Paddle
 *   says a new billing period has started.
 */

export const PRO_USER_DAILY_LIMIT_ENV = "PRO_USER_DAILY_PACK_LIMIT";

/**
 * Ten a day. Chosen to sit far above a real host's use — a quiz night needs
 * one pack — and far below what a loop can spend: at ACC5's measured $0.075 a
 * pack ($0.136 for five rounds of ten), ten is about $0.75-1.40 per subscriber
 * per day, and at most about $14 if every call ran to its 16k max_tokens.
 */
export const DEFAULT_PRO_USER_DAILY_LIMIT = 10;

/** Read per request, for the same reason dailyCeilingFor is: it is a lever the
 * owner reaches for when something is going wrong, and re-reading it costs
 * nothing next to the model call it guards. */
export function proUserDailyLimit(): number {
  return parseCeiling(process.env[PRO_USER_DAILY_LIMIT_ENV], DEFAULT_PRO_USER_DAILY_LIMIT);
}

/**
 * What a subscriber is told when the limit is zero — the deliberate kill switch,
 * reachable only by setting PRO_USER_DAILY_PACK_LIMIT to an explicit "0".
 *
 * It exists because the sentence below is false in that state, in two ways at
 * once: they have not made any packs today, and nothing resets at midnight,
 * because what is stopping them is a value somebody set rather than an
 * allowance they spent. Observed by driving the route with the limit at 0: it
 * answered "You've made 0 packs today — the limit resets at 00:00 UTC."
 *
 * So this says nothing about counts or clocks. It does not invite a retry at a
 * particular time, because there is no particular time — only the owner
 * changing the value back.
 */
export const PRO_GENERATION_OFF_MESSAGE =
  "Pro pack generation is paused right now. Sorry — this is on us, not your subscription. " +
  "Please try again later, or email us if it stays this way.";

/**
 * What a capped subscriber is told.
 *
 * It names the number and the reset, because "try again later" from something
 * somebody is paying for reads like a fault rather than a limit. 00:00 UTC is
 * stated outright rather than localised: the counter's window really is a UTC
 * day, and a time converted to the reader's zone would be a different promise
 * from the one the code keeps.
 *
 * A limit of zero is not a small limit, it is a different situation, and it gets
 * the sentence above instead.
 */
export function proDailyLimitMessage(limit: number): string {
  if (limit <= 0) return PRO_GENERATION_OFF_MESSAGE;
  return `You've made ${limit} packs today — the limit resets at 00:00 UTC.`;
}

/** How long a caller turned away by the kill switch is told to wait. Short, and
 * not the time to midnight: the switch is not on a clock. */
export const OFF_RETRY_SECONDS = 30;

const counter = createFixedWindowCounter();

/** Exposed for tests: the fallback store is module-level and outlives a test. */
export function __resetProLimitCounters() {
  counter.resetMemory();
}

export type ProDailyReservation = {
  allowed: boolean;
  limit: number;
  used: number;
  retryAfterSeconds: number;
  /** The counter could not be reached, so nothing could be counted — not "you
   * are over your limit". Same distinction, and same reason, as
   * DailyReservation.unavailable. */
  unavailable?: boolean;
  /**
   * The limit is zero: the owner has switched Pro generation off, rather than
   * this subscriber having spent an allowance. Like `unavailable`, it needs
   * different words and a different status from "too many" — and, unlike a
   * spent allowance, nothing about it resets at midnight, so the caller must
   * not be sent away with a Retry-After measured to the day boundary. Never
   * true when `allowed`.
   */
  generationOff?: boolean;
  release: () => Promise<void>;
};

const NO_OP_RELEASE = async () => {};

/**
 * Take one of this subscriber's ten for today, before the model is called.
 *
 * Reserved up front rather than counted afterwards, for the same reason the
 * shared ceiling is: a generation takes several seconds, and a count read after
 * the fact lets any number of concurrent requests through on one stale read.
 *
 * Keyed on the creator, so it is per *account* rather than per browser or per
 * address — a Pro subscriber has signed in by definition, so there is no cookie
 * to rotate around it.
 *
 * Fails closed when the store is unreachable, like the shared ceiling and
 * unlike the rate limiter. In practice the shared ceiling refuses first during
 * an outage, so this branch is nearly unreachable — but "nearly" is not a
 * reason to leave a spend control failing open.
 */
export async function reserveProDailyGeneration(
  creatorId: string,
  now: Date = new Date()
): Promise<ProDailyReservation> {
  const limit = proUserDailyLimit();
  const key = `generate:pro:user:${creatorId}:${utcDay(now)}`;
  const ttlSeconds = secondsUntilUtcMidnight(now);

  // A limit of zero refuses without touching the counter, as the shared
  // ceiling does: an explicit "0" is a deliberate kill switch. It is reported as
  // its own thing rather than as a limit of zero — see `generationOff` above and
  // PRO_GENERATION_OFF_MESSAGE. The wait is the short one, because a switch is
  // thrown back whenever the owner throws it and not at 00:00 UTC.
  if (limit === 0) {
    return {
      allowed: false,
      limit,
      used: 0,
      retryAfterSeconds: OFF_RETRY_SECONDS,
      generationOff: true,
      release: NO_OP_RELEASE,
    };
  }

  const windowMs = ttlSeconds * 1000;

  let count: number;
  try {
    count = await counter.hit(key, windowMs, now.getTime());
  } catch (error) {
    if (!isCounterUnavailable(error)) throw error;
    console.error(
      "pro-user-daily-redis-error: refusing generation because the per-subscriber daily counter " +
        "is unreachable — nothing can be counted, so nothing is spent",
      error
    );
    return {
      allowed: false,
      limit,
      used: 0,
      retryAfterSeconds: 30,
      unavailable: true,
      release: NO_OP_RELEASE,
    };
  }

  if (count > limit) {
    // Hand the unit straight back, so a refused caller does not push their own
    // counter further past the limit with every retry.
    try {
      await counter.release(key, windowMs);
    } catch (error) {
      if (!isCounterUnavailable(error)) throw error;
    }
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
      try {
        await counter.release(key, windowMs);
      } catch (error) {
        if (!isCounterUnavailable(error)) throw error;
      }
    },
  };
}

/**
 * Count a Pro pack against the current billing period (M8).
 *
 * Called after the pack is saved, not before: unlike the daily cap this is a
 * record of what was produced, not a permit to produce it, and /refunds quotes
 * it back to a host. A pack that failed to save is not a pack they generated.
 *
 * It never throws. The count is bookkeeping, and losing one is a smaller
 * failure than answering 500 for a pack that exists.
 */
export async function countProGenerationInPeriod(creatorId: string): Promise<void> {
  try {
    await db.creator.update({
      where: { id: creatorId },
      data: { proPacksGeneratedInPeriod: { increment: 1 } },
    });
  } catch (error) {
    console.error("Failed to count a Pro generation against the billing period:", error);
  }
}

/**
 * Pro fair use (PRC5): a rolling 30-day cap on top of the ten a day.
 *
 * Not the M8 count above. That one rolls on Paddle's billing period, which is
 * a year on the annual price, and a comped account has no period at all — so
 * this keeps its own window on the Creator, rolled like the free tier's.
 *
 * The number is unpublished (M12), so nothing a host is shown carries it: the
 * refusal names the date the window resets, never the size of the window.
 */
export const PRO_PERIOD_LIMIT_ENV = "PRO_USER_PERIOD_PACK_LIMIT";
export const PRO_TRIAL_LIMIT_ENV = "PRO_TRIAL_PACK_LIMIT";
export const DEFAULT_PRO_PERIOD_LIMIT = 40;
export const DEFAULT_PRO_TRIAL_LIMIT = 10;

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** The cap for this subscription status; 0 means the cap is off. Read per
 * request, like the daily limit, so a changed value needs no rebuild. */
export function proFairUseLimit(subscriptionStatus: string | null): number {
  if (subscriptionStatus === "trialing") {
    return parseCeiling(process.env[PRO_TRIAL_LIMIT_ENV], DEFAULT_PRO_TRIAL_LIMIT);
  }
  return parseCeiling(process.env[PRO_PERIOD_LIMIT_ENV], DEFAULT_PRO_PERIOD_LIMIT);
}

/** True when there is no window yet, or the current one has run its 30 days —
 * at which point the date the refusal promised has arrived. */
export function proWindowExpired(startedAt: Date | null, now: Date): boolean {
  return startedAt === null || now.getTime() - startedAt.getTime() >= WINDOW_MS;
}

export function proFairUseLimitMessage(resetsAt: Date): string {
  const date = resetsAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return `You've reached Pro's fair-use limit for now. It resets on ${date}.`;
}

export const PRO_TRIAL_LIMIT_MESSAGE =
  "You've reached the trial's limit. Pro continues when your subscription starts.";

export type ProFairUseReservation =
  | { allowed: true; release: () => Promise<void> }
  | { allowed: false; message: string; retryAfterSeconds: number };

/**
 * Take one pack from this account's window before the model runs.
 *
 * The same race-safe shape as reserveFreeGeneration: roll an expired window
 * conditional on the start we read, then claim with a conditional updateMany,
 * so the database decides who got the last pack. A reservation is handed back
 * on any failure, since a host should not lose a pack to ours.
 */
export async function reserveProFairUse(
  creator: Pick<Creator, "id" | "subscriptionStatus" | "proWindowStartedAt">,
  now: Date = new Date()
): Promise<ProFairUseReservation> {
  const limit = proFairUseLimit(creator.subscriptionStatus);
  if (limit === 0) return { allowed: true, release: NO_OP_RELEASE };

  let windowStart: Date;
  if (creator.proWindowStartedAt === null || proWindowExpired(creator.proWindowStartedAt, now)) {
    await db.creator.updateMany({
      where: { id: creator.id, proWindowStartedAt: creator.proWindowStartedAt },
      data: { proWindowCount: 0, proWindowStartedAt: now },
    });
    windowStart = now;
  } else {
    windowStart = creator.proWindowStartedAt;
  }

  const claimed = await db.creator.updateMany({
    where: { id: creator.id, proWindowCount: { lt: limit } },
    data: { proWindowCount: { increment: 1 } },
  });

  if (claimed.count === 0) {
    const current = await db.creator.findUnique({ where: { id: creator.id } });
    const resetsAt = new Date((current?.proWindowStartedAt ?? windowStart).getTime() + WINDOW_MS);
    return {
      allowed: false,
      message:
        creator.subscriptionStatus === "trialing"
          ? PRO_TRIAL_LIMIT_MESSAGE
          : proFairUseLimitMessage(resetsAt),
      retryAfterSeconds: Math.max(1, Math.ceil((resetsAt.getTime() - now.getTime()) / 1000)),
    };
  }

  // Conditional on the window it was taken from, so a release that lands
  // after a roll does not refund the old window against the new one.
  const claimedWindow = windowStart;
  let released = false;
  return {
    allowed: true,
    release: async () => {
      if (released) return;
      released = true;
      await db.creator.updateMany({
        where: { id: creator.id, proWindowStartedAt: claimedWindow, proWindowCount: { gt: 0 } },
        data: { proWindowCount: { decrement: 1 } },
      });
    },
  };
}

/**
 * Whether a subscription event reports a billing period we have not counted
 * against yet.
 *
 * Paddle is the only authority on when a period begins, so the count rolls on
 * its word and never on a clock of ours. A null stored value means "never
 * rolled", which any reported period start rolls.
 */
export function shouldRollProPeriod(reportedStart: Date | null, storedStart: Date | null): boolean {
  if (reportedStart === null) return false;
  if (storedStart === null) return true;
  return reportedStart.getTime() > storedStart.getTime();
}
