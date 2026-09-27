import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as runSweep } from "@/app/api/cron/retention/route";
import { CRON_SECRET_ENV } from "@/lib/cron-auth";
import { sweepExpiredAuthRows, sweepOrphanedMailboxAllowances } from "@/lib/retention";
import {
  MAILBOX_PERIOD_MS,
  freeAllowanceKey,
  reserveMailboxGeneration,
} from "@/lib/free-allowance";
import { db } from "@/lib/db";
import { requestSignInCode, signInTestHost } from "./auth-fixture";

/**
 * The retention sweep, against the rows Better Auth really writes.
 *
 * Every row here comes from the real sign-in path — a code requested and
 * never entered, a session minted by a real sign-in — and is then aged by
 * moving its `expiresAt`. A sweep tested against hand-made rows would pass
 * just as happily if Better Auth wrote somewhere else.
 *
 * Order matters in these tests: every row is created BEFORE any is aged.
 * Submitting a sign-in code makes Better Auth delete every expired
 * verification row in the table (see src/lib/retention.ts), so a sign-in
 * performed after the ageing would clear the codes itself and the sweep
 * would be tested against nothing. The first draft of this file did exactly
 * that: its sweep found zero codes to delete, because Better Auth had already
 * deleted them.
 */

const SECRET = "integration-cron-secret";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function cronCall(authorization?: string) {
  return new NextRequest("http://localhost/api/cron/retention", {
    headers: authorization === undefined ? {} : { authorization },
  });
}

function address(tag: string) {
  return `retention-${tag}-${Math.random().toString(36).slice(2)}@example.test`;
}

/** The verification row a real, unused sign-in code left behind. */
async function unusedCode(tag: string) {
  const email = address(tag);
  await requestSignInCode(email);
  return db.verification.findFirstOrThrow({
    where: { identifier: { contains: email } },
    orderBy: { createdAt: "desc" },
  });
}

function expireCode(id: string, at: Date) {
  return db.verification.update({ where: { id }, data: { expiresAt: at } });
}

function expireSession(id: string, at: Date) {
  return db.authSession.update({ where: { id }, data: { expiresAt: at } });
}

const exists = {
  code: async (id: string) => (await db.verification.findUnique({ where: { id } })) !== null,
  session: async (id: string) => (await db.authSession.findUnique({ where: { id } })) !== null,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("GET /api/cron/retention — who may run it", () => {
  it("refuses everyone when CRON_SECRET is not set, and deletes nothing", async () => {
    vi.stubEnv(CRON_SECRET_ENV, "");
    const stale = await unusedCode("unset");
    await expireCode(stale.id, new Date(Date.now() - DAY));

    for (const header of [undefined, "Bearer ", `Bearer ${SECRET}`]) {
      const res = await runSweep(cronCall(header));
      expect(res.status, String(header)).toBe(401);
    }
    expect(await exists.code(stale.id)).toBe(true);
  });

  it("refuses a wrong secret, and deletes nothing", async () => {
    vi.stubEnv(CRON_SECRET_ENV, SECRET);
    const stale = await unusedCode("wrong");
    await expireCode(stale.id, new Date(Date.now() - DAY));

    for (const header of [undefined, "", SECRET, `Bearer ${SECRET}-not`]) {
      const res = await runSweep(cronCall(header));
      expect(res.status, String(header)).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    }
    expect(await exists.code(stale.id)).toBe(true);
  });
});

describe("GET /api/cron/retention — what it deletes", () => {
  it("deletes expired codes and expired sessions, and nothing that still works", async () => {
    vi.stubEnv(CRON_SECRET_ENV, SECRET);

    // Everything first — see the note at the top about why.
    const expiredCode = await unusedCode("expired");
    const liveCode = await unusedCode("live");
    const lapsedHost = await signInTestHost(address("lapsed-host"));
    const activeHost = await signInTestHost(address("active-host"));
    const lapsedSession = await db.authSession.findFirstOrThrow({ where: { userId: lapsedHost.userId } });
    const activeSession = await db.authSession.findFirstOrThrow({ where: { userId: activeHost.userId } });

    // The sign-ins above submitted codes, so Better Auth has swept already;
    // both codes are still here because neither had expired yet.
    expect(await exists.code(expiredCode.id)).toBe(true);
    expect(await exists.code(liveCode.id)).toBe(true);

    const accountsBefore = await db.account.count({ where: { userId: lapsedHost.userId } });
    const now = Date.now();
    await expireCode(expiredCode.id, new Date(now - HOUR));
    await expireSession(lapsedSession.id, new Date(now - HOUR));

    const res = await runSweep(cronCall(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    // At least ours; another file in this run may have left expired rows too.
    expect(body.verifications).toBeGreaterThanOrEqual(1);
    expect(body.sessions).toBeGreaterThanOrEqual(1);

    expect(await exists.code(expiredCode.id)).toBe(false);
    expect(await exists.code(liveCode.id)).toBe(true);
    expect(await exists.session(lapsedSession.id)).toBe(false);
    expect(await exists.session(activeSession.id)).toBe(true);

    // A lapsed session is a signed-out host, not a deleted one: the user, any
    // linked sign-in method and the creator (packs, allowance) all stay.
    expect(await db.user.findUnique({ where: { id: lapsedHost.userId } })).not.toBeNull();
    expect(await db.account.count({ where: { userId: lapsedHost.userId } })).toBe(accountsBefore);
    expect(await db.creator.findUnique({ where: { id: lapsedHost.id } })).not.toBeNull();
  });

  it("cuts off at the moment it runs: expired a second ago goes, a second from now stays", async () => {
    const now = new Date("2026-09-20T03:00:00.000Z");
    const justExpired = await unusedCode("just-expired");
    const aboutTo = await unusedCode("about-to");
    await expireCode(justExpired.id, new Date(now.getTime() - 1000));
    await expireCode(aboutTo.id, new Date(now.getTime() + 1000));

    const sweep = await sweepExpiredAuthRows(now);
    expect(sweep.cutoff).toBe(now.toISOString());
    expect(await exists.code(justExpired.id)).toBe(false);
    expect(await exists.code(aboutTo.id)).toBe(true);
  });
});

/**
 * Not this code's behaviour — Better Auth's — pinned because src/lib/retention.ts
 * and the PR that added it describe it. If an upgrade stops Better Auth
 * clearing expired codes when one is submitted, the sweep is the only thing
 * left doing it, and this is where that becomes visible.
 */
describe("Better Auth's own cleanup, which the sweep backs up", () => {
  it("deletes every expired code whenever anyone submits one", async () => {
    const stale = await unusedCode("opportunistic");
    await expireCode(stale.id, new Date(Date.now() - HOUR));
    expect(await exists.code(stale.id)).toBe(true);

    // Somebody else, anywhere, signs in.
    await signInTestHost(address("somebody-else"));

    expect(await exists.code(stale.id)).toBe(false);
  });
});

/**
 * The mailbox free-allowance rows (H1b), which are the one thing in this sweep
 * that deliberately outlives the account it was created for.
 *
 * The rule: delete once the row's period has ended AND no existing account's
 * normalised mailbox maps to it. The first condition is what makes deleting safe
 * and the second is what makes /privacy's retention promise true.
 */
describe("orphaned mailbox free-allowance rows", () => {
  const anchor = () => new Date();

  /** A row for `email`, with one pack claimed against it. */
  async function rowFor(email: string) {
    const reservation = await reserveMailboxGeneration(email, anchor());
    expect(reservation.reserved).toBe(true);
    return freeAllowanceKey(email);
  }

  const ended = () => new Date(Date.now() - MAILBOX_PERIOD_MS - DAY);

  it("deletes a row whose period ended and whose accounts are gone", async () => {
    const email = address("orphan");
    const key = await rowFor(email);
    await db.mailboxAllowance.update({ where: { key }, data: { periodStartedAt: ended() } });

    expect(await sweepOrphanedMailboxAllowances()).toBeGreaterThanOrEqual(1);
    expect(await db.mailboxAllowance.findUnique({ where: { key } })).toBeNull();
  });

  it("keeps a row whose period is still live, even with no account behind it", async () => {
    // The condition that makes deleting safe at all. A live period is the only
    // state in which the row is doing anything.
    const key = await rowFor(address("live-period"));
    await sweepOrphanedMailboxAllowances();
    expect(await db.mailboxAllowance.findUnique({ where: { key } })).not.toBeNull();
  });

  it("keeps a row whose account still exists, however long the period has been over", async () => {
    // A real host who keeps their account keeps their row, so the count they are
    // subject to stays continuous rather than being deleted and recreated.
    const email = address("still-here");
    await signInTestHost(email);
    const key = await rowFor(email);
    await db.mailboxAllowance.update({ where: { key }, data: { periodStartedAt: ended() } });

    await sweepOrphanedMailboxAllowances();
    expect(await db.mailboxAllowance.findUnique({ where: { key } })).not.toBeNull();
  });

  it("matches an account through the alias folding, not by string equality", async () => {
    // The row is keyed on the normalised mailbox, so the account that keeps it
    // alive may be signed up under any alias of it. A sweep that compared
    // addresses literally would delete this row while its owner still had an
    // account.
    const stem = `alias-${Math.random().toString(36).slice(2, 8)}`;
    await signInTestHost(`${stem}+signup@gmail.com`);
    const key = await rowFor(`${stem}+other@gmail.com`);
    await db.mailboxAllowance.update({ where: { key }, data: { periodStartedAt: ended() } });

    await sweepOrphanedMailboxAllowances();
    expect(await db.mailboxAllowance.findUnique({ where: { key } })).not.toBeNull();
  });

  it("grants nothing by deleting: an ended row and a missing row behave identically", async () => {
    // This is the argument the whole design rests on, so it is asserted rather
    // than reasoned about. reserveMailboxGeneration resets an ended period to
    // zero, so the row only carries force while its period is live — which means
    // deleting an ended row does early what the next generation would have done
    // anyway.
    const kept = address("kept");
    const swept = address("swept");

    // Both spend their whole allowance, both age out.
    for (const email of [kept, swept]) {
      let reservation = await reserveMailboxGeneration(email, anchor(), 1);
      expect(reservation.reserved).toBe(true);
      reservation = await reserveMailboxGeneration(email, anchor(), 1);
      expect(reservation.reserved).toBe(false);
      await db.mailboxAllowance.update({
        where: { key: freeAllowanceKey(email) },
        data: { periodStartedAt: ended() },
      });
    }

    // One row is deleted, the other left in place.
    await db.mailboxAllowance.delete({ where: { key: freeAllowanceKey(swept) } });

    const afterKept = await reserveMailboxGeneration(kept, anchor(), 1);
    const afterSwept = await reserveMailboxGeneration(swept, anchor(), 1);

    expect(afterKept.reserved).toBe(true);
    expect(afterSwept.reserved).toBe(afterKept.reserved);
    expect(afterSwept.used).toBe(afterKept.used);

    // And both are now spent again to exactly the same degree.
    expect((await reserveMailboxGeneration(kept, anchor(), 1)).reserved).toBe(false);
    expect((await reserveMailboxGeneration(swept, anchor(), 1)).reserved).toBe(false);
  });

  it("is reported by the cron route in the same line as the rest", async () => {
    vi.stubEnv(CRON_SECRET_ENV, SECRET);
    const key = await rowFor(address("cron-reported"));
    await db.mailboxAllowance.update({ where: { key }, data: { periodStartedAt: ended() } });

    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const res = await runSweep(cronCall(`Bearer ${SECRET}`));
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({ mailboxAllowances: expect.any(Number) });
      expect(info).toHaveBeenCalledWith(expect.stringContaining("orphaned mailbox allowances"));
    } finally {
      info.mockRestore();
    }
    expect(await db.mailboxAllowance.findUnique({ where: { key } })).toBeNull();
  });
});
