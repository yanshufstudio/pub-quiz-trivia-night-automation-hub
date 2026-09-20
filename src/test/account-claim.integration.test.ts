import { afterAll, describe, expect, it } from "vitest";
import { createPackFromGenerated } from "@/lib/create-pack";
import { COOKIE_NAME, FREE_LIMIT } from "@/lib/creator";
import { hostSession } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { signInTestHost } from "./auth-fixture";

/**
 * Claiming a `pq_creator` cookie.
 *
 * Before accounts a host *was* a cookie, so signing in has to carry those
 * packs and that used allowance across — and must not become a way to get an
 * allowance back, or to take someone else's packs.
 */

const DAY = 24 * 60 * 60 * 1000;

/** A pre-accounts Creator, exactly as the old cookie path would have left it. */
async function legacyCreator({
  used = 0,
  periodStartedAt = new Date(),
  plan = "FREE",
  userId = null as string | null,
} = {}) {
  return db.creator.create({
    data: {
      deviceKey: `legacy-${Math.random().toString(36).slice(2)}`,
      packsGeneratedInPeriod: used,
      periodStartedAt,
      plan,
      userId,
    },
  });
}

async function packFor(creatorId: string | null, title = `Claimed ${Math.random().toString(36).slice(2)}`) {
  return createPackFromGenerated(
    {
      title,
      rounds: [{ title: "R", category: "C", questions: [{ text: "Q?", answer: "a", points: 1, type: "TEXT" as const }] }],
    },
    "claim test",
    creatorId
  );
}

const legacyCookie = (deviceKey: string) => `${COOKIE_NAME}=${deviceKey}`;

describe("claiming a pre-accounts cookie on first sign-in", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("links the cookie's Creator to a brand-new account, keeping its packs and its count", async () => {
    const legacy = await legacyCreator({ used: 1 });
    const pack = await packFor(legacy.id);

    const host = await signInTestHost(undefined, { legacyCookie: legacyCookie(legacy.deviceKey) });

    // The same row, now owned — not a copy, and not a second creator.
    expect(host.id).toBe(legacy.id);
    const claimed = await db.creator.findUniqueOrThrow({ where: { id: legacy.id } });
    expect(claimed.userId).toBe(host.userId);
    expect(claimed.packsGeneratedInPeriod).toBe(1);

    const row = await db.quizPack.findUniqueOrThrow({ where: { id: pack.id } });
    expect(row.creatorId).toBe(host.id);
  });

  it("moves the cookie's packs onto an account that already has a creator", async () => {
    const email = `merger-${Math.random().toString(36).slice(2)}@example.test`;
    const first = await signInTestHost(email);
    const ownPack = await packFor(first.id);

    const legacy = await legacyCreator({ used: 1 });
    const legacyPack = await packFor(legacy.id);

    const second = await signInTestHost(email, { legacyCookie: legacyCookie(legacy.deviceKey) });
    expect(second.id).toBe(first.id);

    for (const id of [ownPack.id, legacyPack.id]) {
      const row = await db.quizPack.findUniqueOrThrow({ where: { id } });
      expect(row.creatorId).toBe(first.id);
    }
    // The husk is gone rather than left behind as a second allowance.
    expect(await db.creator.findUnique({ where: { id: legacy.id } })).toBeNull();
  });

  it("keeps the higher of the two counts, so claiming can never refund an allowance", async () => {
    const email = `higher-${Math.random().toString(36).slice(2)}@example.test`;
    const first = await signInTestHost(email);
    // The account has spent its whole allowance.
    await db.creator.update({ where: { id: first.id }, data: { packsGeneratedInPeriod: FREE_LIMIT } });

    // The cookie is fresh and unspent — the shape of the exploit.
    const legacy = await legacyCreator({ used: 0 });
    const after = await signInTestHost(email, { legacyCookie: legacyCookie(legacy.deviceKey) });

    const row = await db.creator.findUniqueOrThrow({ where: { id: after.id } });
    expect(row.packsGeneratedInPeriod).toBe(FREE_LIMIT);
  });

  it("takes the cookie's count when that one is higher", async () => {
    const email = `raise-${Math.random().toString(36).slice(2)}@example.test`;
    await signInTestHost(email);
    const legacy = await legacyCreator({ used: 2, periodStartedAt: new Date(Date.now() - 2 * DAY) });

    const after = await signInTestHost(email, { legacyCookie: legacyCookie(legacy.deviceKey) });
    const row = await db.creator.findUniqueOrThrow({ where: { id: after.id } });
    expect(row.packsGeneratedInPeriod).toBe(2);
  });

  it("never takes a Creator that already belongs to another user", async () => {
    const theirs = await signInTestHost();
    const theirPack = await packFor(theirs.id);
    const theirCreator = await db.creator.findUniqueOrThrow({ where: { id: theirs.id } });

    // A different person presents the victim's device key as their cookie.
    const attacker = await signInTestHost(undefined, {
      legacyCookie: legacyCookie(theirCreator.deviceKey),
    });

    expect(attacker.id).not.toBe(theirs.id);
    expect(attacker.userId).not.toBe(theirs.userId);

    // Nothing moved.
    const stillTheirs = await db.creator.findUniqueOrThrow({ where: { id: theirs.id } });
    expect(stillTheirs.userId).toBe(theirs.userId);
    expect((await db.quizPack.findUniqueOrThrow({ where: { id: theirPack.id } })).creatorId).toBe(theirs.id);
  });

  it("carries a PRO plan across rather than dropping someone to FREE for signing in", async () => {
    const legacy = await legacyCreator({ plan: "PRO" });
    const host = await signInTestHost(undefined, { legacyCookie: legacyCookie(legacy.deviceKey) });
    expect((await db.creator.findUniqueOrThrow({ where: { id: host.id } })).plan).toBe("PRO");
  });

  it("is idempotent: presenting the same cookie again changes nothing", async () => {
    const email = `repeat-${Math.random().toString(36).slice(2)}@example.test`;
    const legacy = await legacyCreator({ used: 1 });
    const first = await signInTestHost(email, { legacyCookie: legacyCookie(legacy.deviceKey) });

    const second = await signInTestHost(email, { legacyCookie: legacyCookie(legacy.deviceKey) });
    expect(second.id).toBe(first.id);
    expect((await db.creator.findUniqueOrThrow({ where: { id: first.id } })).packsGeneratedInPeriod).toBe(1);
    expect(await db.creator.count({ where: { userId: first.userId } })).toBe(1);
  });

  it("gives an account exactly one creator even when two requests race to make it", async () => {
    const host = await signInTestHost();
    // Two concurrent host requests, both resolving the same account.
    const headers = () => new Headers({ cookie: host.cookie });
    const [a, b] = await Promise.all([hostSession(headers()), hostSession(headers())]);

    expect(a?.creator.id).toBe(b?.creator.id);
    expect(await db.creator.count({ where: { userId: host.userId } })).toBe(1);
  });

  it("ignores a cookie naming no Creator at all", async () => {
    const host = await signInTestHost(undefined, { legacyCookie: `${COOKIE_NAME}=not-a-real-device-key` });
    expect(host.id).toBeTruthy();
    expect(await db.creator.count({ where: { userId: host.userId } })).toBe(1);
  });
});
