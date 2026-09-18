import { randomUUID } from "node:crypto";
import type { Creator } from "@prisma/client";
import type { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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

export function canGenerate(creator: Creator): boolean {
  if (creator.plan === "PRO") return true;
  return withRolledPeriod(creator).packsGeneratedInPeriod < FREE_LIMIT;
}

export const COOKIE_NAME = "pq_creator";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
}

/**
 * Reads the identity cookie and returns the matching Creator, creating one
 * (with a fresh cookie) if the cookie is missing or stale (no matching row —
 * e.g. a reset DB). Only ever called from the generate route: creating a
 * Creator has a real (tiny) cost, so it stays lazy rather than firing on
 * every page visit.
 */
export async function getOrCreateCreator(
  req: NextRequest
): Promise<{ creator: Creator; setCookieOn: (res: NextResponse) => void }> {
  const existingKey = req.cookies.get(COOKIE_NAME)?.value;
  if (existingKey) {
    const found = await db.creator.findUnique({ where: { deviceKey: existingKey } });
    if (found) return { creator: found, setCookieOn: () => {} };
  }

  const deviceKey = randomUUID();
  const creator = await db.creator.create({ data: { deviceKey } });
  return {
    creator,
    setCookieOn: (res) => res.cookies.set(COOKIE_NAME, deviceKey, cookieOptions()),
  };
}

/** Read-only lookup for the status endpoint — never creates a row or sets a cookie. */
export async function getCreatorReadOnly(req: NextRequest) {
  const deviceKey = req.cookies.get(COOKIE_NAME)?.value;
  if (!deviceKey) return null;
  return db.creator.findUnique({ where: { deviceKey } });
}

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
 * is what keeps "as many quiz packs as you want" on /pricing true. Its spend
 * is bounded by the global daily ceiling instead (src/lib/daily-ceiling.ts).
 */
export async function reserveFreeGeneration(
  creator: Creator
): Promise<{ reserved: boolean; used: number; limit: number }> {
  if (creator.plan === "PRO") {
    return { reserved: true, used: creator.packsGeneratedInPeriod, limit: FREE_LIMIT };
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
    return { reserved: false, used: current?.packsGeneratedInPeriod ?? FREE_LIMIT, limit: FREE_LIMIT };
  }

  return { reserved: true, used: rolled.packsGeneratedInPeriod + 1, limit: FREE_LIMIT };
}

/**
 * Hand back a reservation the generation never spent — a refusal, an upstream
 * failure, a bad brief. Guarded against going negative, so a release that
 * somehow arrives after a period roll cannot mint an extra free pack.
 *
 * A no-op for PRO, which never reserved anything.
 */
export async function releaseFreeGeneration(creator: Creator): Promise<void> {
  if (creator.plan === "PRO") return;
  await db.creator.updateMany({
    where: { id: creator.id, packsGeneratedInPeriod: { gt: 0 } },
    data: { packsGeneratedInPeriod: { decrement: 1 } },
  });
}
