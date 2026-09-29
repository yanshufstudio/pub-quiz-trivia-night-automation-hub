import type { Creator } from "@prisma/client";
import { db } from "@/lib/db";
import { paddleEnv } from "@/lib/paddle/config";
import { isCompEmail } from "@/lib/comp";

export const DEFAULT_FREE_LIMIT = 2;

/**
 * The free-tier ceiling, overridable per environment so a preview deploy can
 * be exercised end to end without burning the production allowance. Read once
 * at module load: the value is fixed for the life of a deploy, and re-reading
 * it per request would let a mid-run env change move the ceiling under a
 * creator who is already part-way through a period.
 *
 * Anything that isn't a non-negative integer falls back to the default rather
 * than propagating. `Number("")` is 0 and `Number("two")` is NaN, and NaN
 * loses every `<` comparison in `canGenerate` — so a typo'd or blank env var
 * would silently lock out every free creator instead of raising the cap.
 * Failing back to the documented default keeps a misconfigured deploy
 * working at production's limit.
 */
export function parseFreeLimit(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_FREE_LIMIT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return DEFAULT_FREE_LIMIT;
  return parsed;
}

export const FREE_LIMIT = parseFreeLimit(process.env.FREE_PACK_LIMIT);
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Rolls an expired 30-day period back to zero. Pure — never writes to the DB.
 * The caller decides when (if ever) to persist the result.
 */
export function withRolledPeriod(creator: Creator): Creator {
  const expired = Date.now() - creator.periodStartedAt.getTime() > PERIOD_MS;
  if (!expired) return creator;
  return { ...creator, packsGeneratedInPeriod: 0, periodStartedAt: new Date() };
}

/**
 * The plan this deployment will act on, which is not always the one in the row
 * (C1).
 *
 * Preview deployments share the production database and talk to Paddle's
 * sandbox, and BETTER_AUTH_SECRET is set separately for Preview — so a sandbox
 * checkout on a preview is signed and verified by that preview, and then writes
 * `plan: "PRO"` to the same Creator row production reads. A test purchase that
 * costs nothing could hand out real Pro. C2 does not close this: a sandbox price
 * id is exactly what a preview's own NEXT_PUBLIC_PADDLE_PRICE_* are set to, so
 * the event is ours as far as that check can tell.
 *
 * `plan` stays the only gate, written by the same webhook as before. What
 * changes is that a grant records the environment that made it, and a read
 * honours Pro only where that environment matches. A sandbox grant is FREE on
 * production and a production grant is FREE on a preview — which also keeps the
 * sandbox walk honest in the other direction, because a preview testing Pro is
 * testing the grant the preview made.
 *
 * **Null is production.** Every Pro row that exists today was granted by
 * production and has no value here, so nothing anybody is paying for changes
 * state when this ships. It also means this can only take Pro away from a grant
 * that positively recorded itself as sandbox, never from one we are unsure
 * about — the same asymmetry priceOwnership uses, and for the same reason.
 *
 * Every server-side read of the plan goes through this. There are five, and
 * leaving any of them reading `creator.plan` directly would be a surface where
 * sandbox Pro still worked.
 */
export function effectivePlan(
  creator: Pick<Creator, "plan" | "proEnvironment">,
  // The account's email, for owner comp (PRC4, src/lib/comp.ts). A caller that
  // leaves it out gets the row's own plan, never more.
  email?: string | null
): "FREE" | "PRO" {
  if (isCompEmail(email)) return "PRO";
  if (creator.plan !== "PRO") return "FREE";
  if (creator.proEnvironment === null || creator.proEnvironment === undefined) return "PRO";
  return creator.proEnvironment === paddleEnv() ? "PRO" : "FREE";
}

/** True when the row says PRO but this deployment will not honour it, which is
 * the only case worth a distinct word: it is why somebody looking at the
 * database sees Pro and the site does not. */
export function isProFromAnotherEnvironment(
  creator: Pick<Creator, "plan" | "proEnvironment">
): boolean {
  return creator.plan === "PRO" && effectivePlan(creator) === "FREE";
}

export function canGenerate(creator: Creator, email?: string | null): boolean {
  if (effectivePlan(creator, email) === "PRO") return true;
  return withRolledPeriod(creator).packsGeneratedInPeriod < FREE_LIMIT;
}

/**
 * The pre-accounts identity cookie.
 *
 * It is no longer identity. Nothing sets it any more and nothing reads it to
 * decide who you are — a host is their account (src/lib/auth-guard.ts). It
 * survives for exactly one purpose: a browser that still carries one from
 * before this change can hand it over once, on sign-in, so the packs and the
 * used allowance behind it move onto the account instead of being stranded.
 * See src/lib/creator-claim.ts, which is the only place left that looks at it.
 */
export const COOKIE_NAME = "pq_creator";

/**
 * Claim one of this creator's free-tier generations *before* the model runs.
 *
 * The route used to check `canGenerate` at the top and increment at the
 * bottom, with a multi-second Anthropic call in between (M12). Both requests
 * of a concurrent pair read the same pre-call count, both passed the check,
 * and both generated — so the last free pack could be spent twice, and with
 * enough parallelism a two-pack allowance stretched as far as the caller
 * liked. Reserving up front closes the window: the check and the increment
 * are one atomic statement, and whatever isn't spent is handed back by
 * `releaseFreeGeneration`.
 *
 * The increment is a conditional `updateMany` — the same race-safe shape the
 * session state machine uses for its transitions — so the database, not this
 * process, decides who got the last one. `count === 0` means somebody else
 * took it.
 *
 * PRO reserves nothing and is never counted: Pro has no per-user cap, which
 * is what /pricing's "Pro lifts the 2-pack limit" promises. Its spend
 * is bounded by the global daily ceiling instead (src/lib/daily-ceiling.ts).
 */
export async function reserveFreeGeneration(
  creator: Creator,
  email?: string | null
): Promise<{ reserved: boolean; used: number; limit: number; release: () => Promise<void> }> {
  if (effectivePlan(creator, email) === "PRO") {
    return {
      reserved: true,
      used: creator.packsGeneratedInPeriod,
      limit: FREE_LIMIT,
      release: async () => {},
    };
  }

  // Roll an expired period first, conditional on the period we actually read.
  // Two concurrent requests that both see an expired period would otherwise
  // both zero the count — the second one wiping the first one's increment.
  // The condition means only one of them wins the roll; the loser's update
  // matches nothing and falls through to the claim below against the count
  // the winner just reset.
  const rolled = withRolledPeriod(creator);
  if (rolled.periodStartedAt !== creator.periodStartedAt) {
    await db.creator.updateMany({
      where: { id: creator.id, periodStartedAt: creator.periodStartedAt },
      data: { packsGeneratedInPeriod: 0, periodStartedAt: rolled.periodStartedAt },
    });
  }

  const claimed = await db.creator.updateMany({
    where: { id: creator.id, packsGeneratedInPeriod: { lt: FREE_LIMIT } },
    data: { packsGeneratedInPeriod: { increment: 1 } },
  });

  if (claimed.count === 0) {
    const current = await db.creator.findUnique({ where: { id: creator.id } });
    return {
      reserved: false,
      used: current?.packsGeneratedInPeriod ?? FREE_LIMIT,
      limit: FREE_LIMIT,
      release: async () => {},
    };
  }

  // The period this reservation was taken against. The release below is
  // conditional on it still being current, because a generation can take a
  // minute and a 30-day period can expire inside that minute: if another
  // request rolls the row in between, decrementing would refund a reservation
  // from the old period against the new one's count. A `> 0` guard keeps the
  // number non-negative but does not prevent that — only matching the period
  // does.
  const claimedPeriod = rolled.periodStartedAt;
  let released = false;

  return {
    reserved: true,
    used: rolled.packsGeneratedInPeriod + 1,
    limit: FREE_LIMIT,
    release: async () => {
      if (released) return;
      released = true;
      await db.creator.updateMany({
        where: { id: creator.id, periodStartedAt: claimedPeriod, packsGeneratedInPeriod: { gt: 0 } },
        data: { packsGeneratedInPeriod: { decrement: 1 } },
      });
    },
  };
}
