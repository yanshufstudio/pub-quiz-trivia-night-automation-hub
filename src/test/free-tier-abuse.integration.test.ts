import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";

vi.mock("@/lib/generate-pack", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/generate-pack")>()),
  generateQuizPack: vi.fn(),
}));

import { generateQuizPack } from "@/lib/generate-pack";
import { POST as generate } from "@/app/api/packs/generate/route";
import {
  FREE_IP_DAILY_LIMIT_ENV,
  FREE_IP_LIMIT_MESSAGE,
  MAILBOX_LIMIT_MESSAGE,
  freeAllowanceKey,
  __resetFreeAllowanceCounters,
} from "@/lib/free-allowance";
import { FREE_LIMIT } from "@/lib/creator";
import { __resetMemoryCounters } from "@/lib/daily-ceiling";
import { __resetProLimitCounters } from "@/lib/pro-limits";
import { signInTestHost, type TestHost } from "./auth-fixture";

const BASE = "http://localhost:3000";

const PACK = {
  pack: {
    title: "Abuse Test Pack",
    rounds: [
      {
        title: "Round One",
        category: "General Knowledge",
        questions: [{ text: "What is the capital of Australia?", answer: "Canberra", points: 1, type: "TEXT" }],
      },
    ],
  },
  droppedQuestions: 0,
  droppedRounds: 0,
  truncated: false,
};

/**
 * The free-tier hole that needs no cookie (H1a), through the real route.
 *
 * Accounts stopped a caller dropping `pq_creator` for a fresh allowance. They did
 * not stop the same person signing up again with any address at all, and the
 * per-IP limiter on this route (5 per 10 minutes, ~720 a day) is a throttle
 * rather than a cap. This is the cap.
 *
 * H1(b) — aliases of one mailbox sharing one allowance — is the second half, and
 * has its own describe block below. It is the cap that matters more: an address
 * is cheap to change and a mailbox is not.
 */

const savedEnv: Record<string, string | undefined> = {};
let ipCounter = 600;

/** A distinct address unless one is given, so the per-IP caps do not collide
 * between tests that are not about them. */
function generateRequest(host: TestHost, ip?: string) {
  ipCounter += 1;
  return new NextRequest(`${BASE}/api/packs/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip ?? `10.7.0.${ipCounter % 250}`,
      ...host.cookieHeader,
    },
    body: JSON.stringify({ prompt: "Four rounds of pub trivia." }),
  });
}

beforeEach(() => {
  savedEnv[FREE_IP_DAILY_LIMIT_ENV] = process.env[FREE_IP_DAILY_LIMIT_ENV];
  delete process.env[FREE_IP_DAILY_LIMIT_ENV];
  __resetFreeAllowanceCounters();
  __resetMemoryCounters();
  __resetProLimitCounters();
  vi.mocked(generateQuizPack).mockReset();
  vi.mocked(generateQuizPack).mockResolvedValue(PACK as never);
});

afterEach(() => {
  if (savedEnv[FREE_IP_DAILY_LIMIT_ENV] === undefined) delete process.env[FREE_IP_DAILY_LIMIT_ENV];
  else process.env[FREE_IP_DAILY_LIMIT_ENV] = savedEnv[FREE_IP_DAILY_LIMIT_ENV];
  __resetFreeAllowanceCounters();
  __resetMemoryCounters();
  __resetProLimitCounters();
  vi.mocked(generateQuizPack).mockReset();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("one address's free packs for a day (H1a)", () => {
  it("refuses a caller past the day's allowance, whatever account they use", async () => {
    process.env[FREE_IP_DAILY_LIMIT_ENV] = "2";
    const ip = "10.7.9.1";

    // Two packs from two fresh accounts — so nothing else is refusing this.
    for (let i = 0; i < 2; i++) {
      const host = await signInTestHost();
      expect((await generate(generateRequest(host, ip))).status).toBe(201);
    }

    const third = await signInTestHost();
    const refused = await generate(generateRequest(third, ip));
    expect(refused.status).toBe(429);
    const body = await refused.json();
    expect(body.error).toBe(FREE_IP_LIMIT_MESSAGE);
    expect(body.freeIpLimitReached).toBe(true);
    expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("does not refuse a different network", async () => {
    process.env[FREE_IP_DAILY_LIMIT_ENV] = "1";
    const first = await signInTestHost();
    expect((await generate(generateRequest(first, "10.7.9.2"))).status).toBe(201);

    const elsewhere = await signInTestHost();
    expect((await generate(generateRequest(elsewhere, "10.7.9.3"))).status).toBe(201);
  });

  it("does not apply to a Pro subscriber on a shared address", async () => {
    // A pub's wifi is one address and the person running the quiz on it has
    // paid. Throttling them because the free tier was busy would be the worst
    // possible place for this cap to bite.
    process.env[FREE_IP_DAILY_LIMIT_ENV] = "1";
    const ip = "10.7.9.4";
    const freeHost = await signInTestHost();
    expect((await generate(generateRequest(freeHost, ip))).status).toBe(201);

    const pro = await signInTestHost();
    await db.creator.update({ where: { id: pro.id }, data: { plan: "PRO" } });
    expect((await generate(generateRequest(pro, ip))).status).toBe(201);
  });

  it("does not consume the shared ceiling when it refuses", async () => {
    process.env[FREE_IP_DAILY_LIMIT_ENV] = "1";
    const ip = "10.7.9.5";
    const first = await signInTestHost();
    expect((await generate(generateRequest(first, ip))).status).toBe(201);

    const refused = await signInTestHost();
    expect((await generate(generateRequest(refused, ip))).status).toBe(429);

    // The ceiling is untouched, so somebody elsewhere is still served.
    const elsewhere = await signInTestHost();
    expect((await generate(generateRequest(elsewhere, "10.7.9.6"))).status).toBe(201);
  });
});

/**
 * One mailbox, one free allowance (H1b), through the real route.
 *
 * The hole: signing up is free, and `someone+1@gmail.com`,
 * `someone+2@gmail.com` and `some.one@googlemail.com` are one inbox that Google
 * delivers all of. Each was a separate account with its own two free packs, for
 * as long as somebody cared to keep typing. Nothing here mocks the folding — the
 * addresses are real aliases of each other and the route is the real route.
 */
describe("one mailbox's free packs (H1b)", () => {
  /** Spend the mailbox's whole allowance through one account, which is also
   * that account's own allowance. Returns nothing: the point is the state. */
  async function spendTheAllowance(email: string) {
    const host = await signInTestHost(email);
    for (let i = 0; i < FREE_LIMIT; i++) {
      const res = await generate(generateRequest(host));
      expect(res.status).toBe(201);
    }
  }

  it("refuses a second account behind the same inbox", async () => {
    const stem = `alias${Math.random().toString(36).slice(2, 8)}`;
    await spendTheAllowance(`${stem}+one@gmail.com`);

    // A brand-new account, its own allowance untouched, and a different address
    // in every character that a string comparison would look at.
    const second = await signInTestHost(`${stem}+two@gmail.com`);
    const refused = await generate(generateRequest(second));

    expect(refused.status).toBe(403);
    const body = await refused.json();
    expect(body.error).toBe(MAILBOX_LIMIT_MESSAGE);
    expect(body.limit).toBe(FREE_LIMIT);

    // And it really was this account's first attempt: the per-account cap did
    // not refuse it, the mailbox did.
    const creator = await db.creator.findUnique({ where: { id: second.id } });
    expect(creator?.packsGeneratedInPeriod).toBe(0);
  });

  it("folds dots and googlemail too, which is the same inbox to Google", async () => {
    const stem = `d.o.t${Math.random().toString(36).slice(2, 8)}`;
    await spendTheAllowance(`${stem}@gmail.com`);

    const dotless = stem.replace(/\./g, "");
    const second = await signInTestHost(`${dotless}@googlemail.com`);
    expect((await generate(generateRequest(second))).status).toBe(403);
  });

  it("leaves a genuinely different inbox alone", async () => {
    await spendTheAllowance(`neighbour${Math.random().toString(36).slice(2, 8)}@gmail.com`);
    const other = await signInTestHost(`someone-else${Math.random().toString(36).slice(2, 8)}@gmail.com`);
    expect((await generate(generateRequest(other))).status).toBe(201);
  });

  it("does not fold dots outside Gmail, where they are two different people", async () => {
    // first.last@company.com and firstlast@company.com are one person at Google
    // and usually two at a company. Refusing a colleague their free packs is a
    // worse failure than letting a determined abuser have two more.
    const stem = Math.random().toString(36).slice(2, 8);
    await spendTheAllowance(`first.last${stem}@company.test`);
    const colleague = await signInTestHost(`firstlast${stem}@company.test`);
    expect((await generate(generateRequest(colleague))).status).toBe(201);
  });

  it("still folds +tags outside Gmail, where they are near-universal", async () => {
    const stem = `tagged${Math.random().toString(36).slice(2, 8)}`;
    await spendTheAllowance(`${stem}@company.test`);
    const tagged = await signInTestHost(`${stem}+quiz@company.test`);
    expect((await generate(generateRequest(tagged))).status).toBe(403);
  });

  it("does not apply to a Pro subscriber sharing an inbox with a spent free account", async () => {
    const stem = `paid${Math.random().toString(36).slice(2, 8)}`;
    await spendTheAllowance(`${stem}+free@gmail.com`);

    const pro = await signInTestHost(`${stem}+pro@gmail.com`);
    await db.creator.update({ where: { id: pro.id }, data: { plan: "PRO" } });
    expect((await generate(generateRequest(pro))).status).toBe(201);
  });

  it("gives the unit back when the generation fails, so a crash costs nothing", async () => {
    const email = `refund${Math.random().toString(36).slice(2, 8)}@gmail.com`;
    const host = await signInTestHost(email);
    const key = freeAllowanceKey(email);

    vi.mocked(generateQuizPack).mockRejectedValueOnce(new Error("the model fell over"));
    const failed = await generate(generateRequest(host));
    expect(failed.status).toBeGreaterThanOrEqual(500);

    const row = await db.mailboxAllowance.findUnique({ where: { key } });
    expect(row?.packsGenerated).toBe(0);

    // And the proof that it is spendable rather than merely zero.
    expect((await generate(generateRequest(host))).status).toBe(201);
  });

  it("rolls its own 30-day period, so a real user coming back is not refused", async () => {
    // The reason this is a row and not a fixed-window counter. The counter's
    // window would open on the mailbox's first generation while a Creator's
    // period rolls from periodStartedAt, and the drift refuses somebody whose
    // own period has legitimately reset.
    const email = `returning${Math.random().toString(36).slice(2, 8)}@gmail.com`;
    await spendTheAllowance(email);
    const key = freeAllowanceKey(email);

    const longAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await db.mailboxAllowance.update({ where: { key }, data: { periodStartedAt: longAgo } });
    await db.creator.updateMany({
      where: { user: { email } },
      data: { periodStartedAt: longAgo, packsGeneratedInPeriod: 0 },
    });

    const host = await signInTestHost(email);
    expect((await generate(generateRequest(host))).status).toBe(201);

    const row = await db.mailboxAllowance.findUnique({ where: { key } });
    expect(row?.packsGenerated).toBe(1);
    expect(row!.periodStartedAt.getTime()).toBeGreaterThan(longAgo.getTime());
  });

  it("rolls with the account's own period, not from its first generation", async () => {
    // The drift that sank two designs. A Creator's period starts at sign-up and
    // the shared row used to start at the mailbox's first generation, so somebody
    // who signed up and generated three weeks later had a shared period ending
    // three weeks after their account's: their account rolled, handed them two
    // packs, and the mailbox refused them for the rest of the month.
    const email = `patient${Math.random().toString(36).slice(2, 8)}@gmail.com`;
    const host = await signInTestHost(email);
    const key = freeAllowanceKey(email);

    // Signed up 29 days ago and only generating now.
    const signedUp = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    await db.creator.update({ where: { id: host.id }, data: { periodStartedAt: signedUp } });
    for (let i = 0; i < FREE_LIMIT; i++) {
      expect((await generate(generateRequest(host))).status).toBe(201);
    }

    // The shared row took the account's anchor, not today's date.
    const row = await db.mailboxAllowance.findUnique({ where: { key } });
    expect(row!.periodStartedAt.getTime()).toBe(signedUp.getTime());

    // So when the account's period ends, this one ends with it.
    const expired = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await db.creator.update({ where: { id: host.id }, data: { periodStartedAt: expired } });
    expect((await generate(generateRequest(host))).status).toBe(201);
  });

  it("does not let a newer account pull the shared period forward", async () => {
    // The other half of the same rule, and the half the cap depends on: every
    // fresh account has a brand-new periodStartedAt, so honouring a *newer*
    // anchor would hand a fresh allowance to anybody who signed up again.
    const stem = `newer${Math.random().toString(36).slice(2, 8)}`;
    const first = await signInTestHost(`${stem}+old@gmail.com`);
    const signedUp = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    await db.creator.update({ where: { id: first.id }, data: { periodStartedAt: signedUp } });
    for (let i = 0; i < FREE_LIMIT; i++) {
      expect((await generate(generateRequest(first))).status).toBe(201);
    }

    // A second alias, signed up today — the newest anchor there could be.
    const second = await signInTestHost(`${stem}+new@gmail.com`);
    expect((await generate(generateRequest(second))).status).toBe(403);

    const row = await db.mailboxAllowance.findUnique({
      where: { key: freeAllowanceKey(`${stem}+old@gmail.com`) },
    });
    expect(row!.periodStartedAt.getTime()).toBe(signedUp.getTime());
    expect(row!.packsGenerated).toBe(FREE_LIMIT);
  });

  it("stores a digest, never the address", async () => {
    const email = `private${Math.random().toString(36).slice(2, 8)}@gmail.com`;
    const host = await signInTestHost(email);
    expect((await generate(generateRequest(host))).status).toBe(201);

    // The row outlives account deletion by design, so it must not be a second
    // copy of somebody's email address.
    const rows = await db.mailboxAllowance.findMany();
    for (const row of rows) {
      expect(row.key).not.toContain("@");
      expect(row.key).not.toContain(email.split("@")[0]);
    }
    expect(rows.some((row) => row.key === freeAllowanceKey(email))).toBe(true);
  });
});
