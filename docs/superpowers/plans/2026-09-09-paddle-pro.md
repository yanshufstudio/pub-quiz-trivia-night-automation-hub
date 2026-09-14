# Paddle Pro Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a visitor at the free cap buy a monthly or annual Pro subscription through Paddle, with `Creator.plan` flipped by verified webhooks and restorable by an email magic link.

**Architecture:** Paddle Billing integrated directly. Two vendor touchpoints: a client-side overlay checkout on `/pricing` carrying `customData.creatorId`, and a signature-verified webhook route that upserts subscription state onto `Creator`. Every plan gate keeps reading `Creator.plan`. Phase 3a (Tasks 1–9) ships checkout, webhook, gating and the customer-portal link. Phase 3b (Tasks 10–12) adds `/restore` once a Resend sending domain exists.

**Tech Stack:** Next.js 16.3.4 App Router, React 19, Prisma 6.19.3 + `@prisma/adapter-libsql`, `@paddle/paddle-node-sdk` 3.10.0, `@paddle/paddle-js` 1.6.5, vitest (unit + integration), Playwright, Resend (phase 3b).

**Spec:** `docs/superpowers/specs/2026-09-09-paddle-pro-design.md`

**Status 2026-09-14:** Tasks 1–8 built and green (unit 168, integration 169, e2e 9/9, tsc, eslint) on branch `claude/paddle-pro-3a`. Two deviations from the text below, both forced by the codebase: (1) Next 16 refuses cookie writes during a server-component render, so Task 6's `getOrCreateCreatorForPage` became read-only `getCreatorForPage` plus `POST /api/creator/ensure`, which the pricing cards call before opening checkout; (2) Task 5's "unrelated event" fixture is a well-formed `payout.paid`, not a mislabelled subscription payload, because the SDK's `unmarshal` parses by event type and threw on the latter. Task 9 (sandbox catalog, destination, real sandbox checkout) has NOT been run.

## Global Constraints

- `Creator.plan` is the only plan gate. No route or component calls Paddle to decide access.
- Webhook handler is idempotent on Paddle `event_id` (table `PaddleEvent`).
- Vendor ids live on `Creator` only.
- Status to plan: `active`, `trialing`, `past_due` → `PRO`; `canceled`, `paused` → `FREE`.
- Env names exactly: `NEXT_PUBLIC_PADDLE_ENV`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `NEXT_PUBLIC_PADDLE_PRICE_MONTHLY`, `NEXT_PUBLIC_PADDLE_PRICE_ANNUAL`, `PADDLE_API_KEY`, `PADDLE_NOTIFICATION_WEBHOOK_SECRET`, `RESEND_API_KEY`, `MAGIC_LINK_PEPPER`.
- Prices: `500` cents USD per month, `2500` cents USD per year. Product "Pub Quiz Pro", tax category `saas` (fallback `standard`).
- Never print, paste or commit a Paddle key, webhook secret or Resend key. Set them with `vercel env add NAME production --sensitive < file` or in the Vercel UI.
- Sandbox before live, always. Preview deployments use sandbox values.
- Tests: TDD, red then green. Unit via `npm run test`, integration via `npm run test:integration` (throwaway `prisma/test.db`, migrations run by `vitest.integration.setup.ts`), e2e via `npm run test:e2e` (dev server on port 4517; do not run while another `next dev` is up in this directory).
- Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Commit messages in normal prose.
- Run `git fetch && git status` before every commit; other sessions commit to this repo.

---

## File map

| Path | Responsibility |
| --- | --- |
| `prisma/schema.prisma`, `prisma/migrations/20260909120000_add_paddle_subscription/migration.sql` | New columns on `Creator`, tables `PaddleEvent` and `RestoreToken` |
| `src/lib/paddle/plan.ts` | Pure: `statusToPlan`, `isNewerEvent` |
| `src/lib/paddle/config.ts` | Reads and validates env; `paddleEnv()`, `publicPaddleConfig()` |
| `src/lib/paddle/client.ts` | `getPaddle()` singleton over `@paddle/paddle-node-sdk` |
| `src/lib/paddle/apply-subscription.ts` | `applySubscriptionEvent`, `applyCustomerEvent`, `recordEvent` (DB writes) |
| `src/app/api/paddle/webhook/route.ts` | Thin route: verify, dedupe, dispatch |
| `src/app/pricing/page.tsx`, `src/app/pricing/PricingCards.tsx` | Server page resolves creator; client component opens checkout |
| `src/app/pricing/actions.ts` | Server action `openCustomerPortal` |
| `src/app/create/page.tsx` | Link to `/pricing`, `?upgraded=1` polling, "Manage subscription" |
| `src/app/api/creator/status/route.ts` | Adds `hasSubscription` to the response |
| `next.config.ts` | Build-time throw on empty `NEXT_PUBLIC_PADDLE_*` in production builds |
| `.env.example`, `README.md` | Documentation |
| `src/lib/restore/token.ts`, `src/app/restore/*`, `src/app/api/restore/route.ts` | Phase 3b magic link |
| `src/test/paddle-fixtures.ts` | Signed webhook payload builder shared by integration tests |

---

### Task 1: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma` (model `Creator`, lines 116–124)
- Create: `prisma/migrations/20260909120000_add_paddle_subscription/migration.sql`
- Test: `src/test/paddle-schema.integration.test.ts`

**Interfaces:**
- Produces: `Creator.email`, `Creator.paddleCustomerId`, `Creator.paddleSubscriptionId`, `Creator.subscriptionStatus`, `Creator.subscriptionUpdatedAt` (all nullable); `db.paddleEvent`, `db.restoreToken`.

- [x] **Step 1: Write the failing test**

```ts
// src/test/paddle-schema.integration.test.ts
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";

describe("paddle schema", () => {
  it("stores subscription fields on Creator and dedupes PaddleEvent by eventId", async () => {
    const creator = await db.creator.create({
      data: {
        deviceKey: `schema-${Math.random().toString(36).slice(2)}`,
        email: "buyer@example.com",
        paddleCustomerId: "ctm_test",
        paddleSubscriptionId: "sub_test",
        subscriptionStatus: "active",
        subscriptionUpdatedAt: new Date("2026-09-09T10:00:00Z"),
        plan: "PRO",
      },
    });
    expect(creator.paddleSubscriptionId).toBe("sub_test");

    await db.paddleEvent.create({
      data: { eventId: "evt_dup", type: "subscription.created", occurredAt: new Date() },
    });
    await expect(
      db.paddleEvent.create({
        data: { eventId: "evt_dup", type: "subscription.created", occurredAt: new Date() },
      })
    ).rejects.toThrow();

    const token = await db.restoreToken.create({
      data: { tokenHash: "abc", creatorId: creator.id, expiresAt: new Date(Date.now() + 60_000) },
    });
    expect(token.usedAt).toBeNull();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run (Git Bash, repo root): `npx vitest run --config vitest.integration.config.ts src/test/paddle-schema.integration.test.ts`
Expected: FAIL, `Unknown argument 'email'` or `db.paddleEvent is undefined`.

- [x] **Step 3: Edit the schema**

Replace the `Creator` model and add two models:

```prisma
model Creator {
  id                     String     @id @default(cuid())
  deviceKey              String     @unique
  plan                   String     @default("FREE") // FREE | PRO
  packsGeneratedInPeriod Int        @default(0)
  periodStartedAt        DateTime   @default(now())
  createdAt              DateTime   @default(now())
  packs                  QuizPack[]

  // Set by the Paddle webhook (src/lib/paddle/apply-subscription.ts) and
  // the restore flow. Never written from the browser.
  email                  String?    @unique
  paddleCustomerId       String?
  paddleSubscriptionId   String?    @unique
  subscriptionStatus     String?    // Paddle SubscriptionStatus
  subscriptionUpdatedAt  DateTime?  // occurred_at of the last applied event
  restoreTokens          RestoreToken[]
}

// One row per Paddle webhook delivery. Primary key on Paddle's event_id
// makes the webhook idempotent: a retry hits the unique constraint and is
// acknowledged without re-applying.
model PaddleEvent {
  eventId    String   @id
  type       String
  occurredAt DateTime
  receivedAt DateTime @default(now())
}

// Single-use magic-link tokens for /restore. Only the SHA-256 of the token
// is stored; the raw token travels in the email link.
model RestoreToken {
  tokenHash String    @id
  creator   Creator   @relation(fields: [creatorId], references: [id], onDelete: Cascade)
  creatorId String
  expiresAt DateTime
  usedAt    DateTime?

  @@index([creatorId])
}
```

- [x] **Step 4: Write the migration by hand** (same style as `20260907000000_add_creator`)

```sql
-- AlterTable
ALTER TABLE "Creator" ADD COLUMN "email" TEXT;
ALTER TABLE "Creator" ADD COLUMN "paddleCustomerId" TEXT;
ALTER TABLE "Creator" ADD COLUMN "paddleSubscriptionId" TEXT;
ALTER TABLE "Creator" ADD COLUMN "subscriptionStatus" TEXT;
ALTER TABLE "Creator" ADD COLUMN "subscriptionUpdatedAt" DATETIME;

-- CreateTable
CREATE TABLE "PaddleEvent" (
    "eventId" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RestoreToken" (
    "tokenHash" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    CONSTRAINT "RestoreToken_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Creator_email_key" ON "Creator"("email");
CREATE UNIQUE INDEX "Creator_paddleSubscriptionId_key" ON "Creator"("paddleSubscriptionId");
CREATE INDEX "RestoreToken_creatorId_idx" ON "RestoreToken"("creatorId");
```

- [x] **Step 5: Regenerate the client and run the test**

Run: `npx prisma generate && npx vitest run --config vitest.integration.config.ts src/test/paddle-schema.integration.test.ts`
Expected: PASS. Also run `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "file:./prisma/shadow.db"` and expect "No difference detected"; delete `prisma/shadow.db` after.

- [x] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260909120000_add_paddle_subscription src/test/paddle-schema.integration.test.ts
git commit -m "Add Paddle subscription columns, PaddleEvent and RestoreToken tables"
```

---

### Task 2: Pure plan helpers

**Files:**
- Create: `src/lib/paddle/plan.ts`
- Test: `src/lib/paddle/plan.test.ts`

**Interfaces:**
- Produces: `statusToPlan(status: string): "FREE" | "PRO"`; `isNewerEvent(occurredAt: Date, storedUpdatedAt: Date | null): boolean`.

- [x] **Step 1: Write the failing tests**

```ts
// src/lib/paddle/plan.test.ts
import { describe, expect, it } from "vitest";
import { isNewerEvent, statusToPlan } from "./plan";

describe("statusToPlan", () => {
  it.each([
    ["active", "PRO"],
    ["trialing", "PRO"],
    ["past_due", "PRO"],
    ["canceled", "FREE"],
    ["paused", "FREE"],
    ["something-new", "FREE"],
  ])("%s → %s", (status, plan) => {
    expect(statusToPlan(status)).toBe(plan);
  });
});

describe("isNewerEvent", () => {
  const t1 = new Date("2026-09-09T10:00:00Z");
  const t2 = new Date("2026-09-09T10:00:01Z");
  it("accepts any event when nothing is stored", () => {
    expect(isNewerEvent(t1, null)).toBe(true);
  });
  it("accepts a later event", () => {
    expect(isNewerEvent(t2, t1)).toBe(true);
  });
  it("rejects an older event", () => {
    expect(isNewerEvent(t1, t2)).toBe(false);
  });
  it("accepts an equal timestamp (same-second updates from Paddle)", () => {
    expect(isNewerEvent(t1, t1)).toBe(true);
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/paddle/plan.test.ts`
Expected: FAIL, cannot find module `./plan`.

- [x] **Step 3: Implement**

```ts
// src/lib/paddle/plan.ts
export type Plan = "FREE" | "PRO";

/**
 * Paddle keeps billing through `past_due` (dunning), so Pro stays on until
 * Paddle gives up and moves the subscription to `canceled` or `paused`.
 * Unknown statuses fail closed.
 */
export function statusToPlan(status: string): Plan {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
      return "PRO";
    default:
      return "FREE";
  }
}

/** Retries can arrive out of order; only an event at least as new as the
 * stored one may overwrite. Equal timestamps are allowed because Paddle can
 * emit `subscription.created` and `subscription.activated` in the same
 * second and the later one carries the final status. */
export function isNewerEvent(occurredAt: Date, storedUpdatedAt: Date | null): boolean {
  if (!storedUpdatedAt) return true;
  return occurredAt.getTime() >= storedUpdatedAt.getTime();
}
```

- [x] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/paddle/plan.test.ts`
Expected: PASS, 10 tests.

- [x] **Step 5: Commit**

```bash
git add src/lib/paddle/plan.ts src/lib/paddle/plan.test.ts
git commit -m "Add pure Paddle status-to-plan and event-ordering helpers"
```

---

### Task 3: Config, SDK client and dependencies

**Files:**
- Modify: `package.json` (add `@paddle/paddle-node-sdk@^3.10.0`, `@paddle/paddle-js@^1.6.5`)
- Create: `src/lib/paddle/config.ts`, `src/lib/paddle/client.ts`
- Modify: `next.config.ts`, `.env.example`
- Test: `src/lib/paddle/config.test.ts`

**Interfaces:**
- Produces: `paddleEnv(): "sandbox" | "production"`; `publicPaddleConfig(): { env; clientToken; priceMonthly; priceAnnual }` (throws `PaddleConfigError` when any is empty); `webhookSecret(): string` (throws when empty); `getPaddle(): Paddle`.

- [x] **Step 1: Install**

Run: `npm install @paddle/paddle-node-sdk@^3.10.0 @paddle/paddle-js@^1.6.5`
Expected: both in `dependencies`; `npm audit` unchanged apart from these.

- [x] **Step 2: Write the failing test**

```ts
// src/lib/paddle/config.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaddleConfigError, paddleEnv, publicPaddleConfig, webhookSecret } from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("paddle config", () => {
  it("defaults to sandbox", () => {
    vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "");
    expect(paddleEnv()).toBe("sandbox");
  });

  it("returns production only for the exact value", () => {
    vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "production");
    expect(paddleEnv()).toBe("production");
  });

  it("throws naming the first missing public value", () => {
    vi.stubEnv("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN", "test_abc");
    vi.stubEnv("NEXT_PUBLIC_PADDLE_PRICE_MONTHLY", "");
    vi.stubEnv("NEXT_PUBLIC_PADDLE_PRICE_ANNUAL", "pri_y");
    expect(() => publicPaddleConfig()).toThrow(PaddleConfigError);
    expect(() => publicPaddleConfig()).toThrow("NEXT_PUBLIC_PADDLE_PRICE_MONTHLY");
  });

  it("returns all four public values", () => {
    vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "sandbox");
    vi.stubEnv("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN", "test_abc");
    vi.stubEnv("NEXT_PUBLIC_PADDLE_PRICE_MONTHLY", "pri_m");
    vi.stubEnv("NEXT_PUBLIC_PADDLE_PRICE_ANNUAL", "pri_y");
    expect(publicPaddleConfig()).toEqual({
      env: "sandbox",
      clientToken: "test_abc",
      priceMonthly: "pri_m",
      priceAnnual: "pri_y",
    });
  });

  it("throws when the webhook secret is empty", () => {
    vi.stubEnv("PADDLE_NOTIFICATION_WEBHOOK_SECRET", "");
    expect(() => webhookSecret()).toThrow("PADDLE_NOTIFICATION_WEBHOOK_SECRET");
  });
});
```

- [x] **Step 3: Run to verify failure**

Run: `npx vitest run src/lib/paddle/config.test.ts`
Expected: FAIL, cannot find module `./config`.

- [x] **Step 4: Implement config and client**

```ts
// src/lib/paddle/config.ts
export class PaddleConfigError extends Error {}

export type PaddleEnv = "sandbox" | "production";

export function paddleEnv(): PaddleEnv {
  return process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox";
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new PaddleConfigError(`${name} is not set`);
  return value;
}

/**
 * Browser-safe values. Next inlines NEXT_PUBLIC_* at build time, so these
 * must be read through the literal `process.env.NEXT_PUBLIC_...` form in
 * client components; this helper is for server code and the build check.
 */
export function publicPaddleConfig() {
  return {
    env: paddleEnv(),
    clientToken: required("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN"),
    priceMonthly: required("NEXT_PUBLIC_PADDLE_PRICE_MONTHLY"),
    priceAnnual: required("NEXT_PUBLIC_PADDLE_PRICE_ANNUAL"),
  };
}

export function webhookSecret(): string {
  return required("PADDLE_NOTIFICATION_WEBHOOK_SECRET");
}

export function apiKey(): string {
  return required("PADDLE_API_KEY");
}
```

```ts
// src/lib/paddle/client.ts
import { Environment, LogLevel, Paddle } from "@paddle/paddle-node-sdk";
import { apiKey, paddleEnv } from "./config";

const globalForPaddle = globalThis as unknown as { paddle: Paddle | undefined };

/** One SDK instance per process. Reads PADDLE_API_KEY lazily so importing
 * this module in a test or a build never throws. */
export function getPaddle(): Paddle {
  if (globalForPaddle.paddle) return globalForPaddle.paddle;
  const paddle = new Paddle(apiKey(), {
    environment: paddleEnv() === "production" ? Environment.production : Environment.sandbox,
    logLevel: LogLevel.error,
  });
  globalForPaddle.paddle = paddle;
  return paddle;
}
```

- [x] **Step 5: Build-time guard in `next.config.ts`**

```ts
import type { NextConfig } from "next";

// A Vercel variable typed as legacy "Secret" resolves empty at build time
// and would ship a /pricing page whose buttons do nothing. Fail the build
// instead. Only enforced for production builds so local `next build`
// experiments and CI without Paddle values still work.
const REQUIRED_PUBLIC_PADDLE = [
  "NEXT_PUBLIC_PADDLE_ENV",
  "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN",
  "NEXT_PUBLIC_PADDLE_PRICE_MONTHLY",
  "NEXT_PUBLIC_PADDLE_PRICE_ANNUAL",
] as const;

if (process.env.VERCEL_ENV === "production") {
  for (const name of REQUIRED_PUBLIC_PADDLE) {
    if (!process.env[name]) {
      throw new Error(`Build aborted: ${name} is empty. Set it as a Vercel Config variable and redeploy.`);
    }
  }
}

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [x] **Step 6: Document in `.env.example`** (append)

```bash
# Paddle Billing (docs/superpowers/specs/2026-09-09-paddle-pro-design.md).
# Sandbox values locally and on preview deployments, live values in
# production. The four NEXT_PUBLIC_* values are publishable; set them in
# Vercel as type Config. The two server-side values are secrets; add them
# with `vercel env add NAME production --sensitive < file`.
NEXT_PUBLIC_PADDLE_ENV="sandbox"
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=""
NEXT_PUBLIC_PADDLE_PRICE_MONTHLY=""
NEXT_PUBLIC_PADDLE_PRICE_ANNUAL=""
PADDLE_API_KEY=""
PADDLE_NOTIFICATION_WEBHOOK_SECRET=""
```

- [x] **Step 7: Run tests and typecheck**

Run: `npx vitest run src/lib/paddle && npx tsc --noEmit -p .`
Expected: PASS, no type errors.

- [x] **Step 8: Commit**

```bash
git add package.json package-lock.json src/lib/paddle/config.ts src/lib/paddle/config.test.ts src/lib/paddle/client.ts next.config.ts .env.example
git commit -m "Add Paddle SDKs, env config helpers and a production build guard"
```

---

### Task 4: Apply subscription events to Creator

**Files:**
- Create: `src/lib/paddle/apply-subscription.ts`
- Test: `src/test/paddle-apply.integration.test.ts`

**Interfaces:**
- Consumes: `statusToPlan`, `isNewerEvent` (Task 2); `db` (Task 1 columns).
- Produces:
  - `recordEvent(eventId: string, type: string, occurredAt: Date): Promise<"new" | "duplicate">`
  - `applySubscriptionEvent(input: SubscriptionEventInput): Promise<"applied" | "stale" | "unmatched">`
  - `applyCustomerEvent(input: { customerId: string; email: string }): Promise<void>`
  - `type SubscriptionEventInput = { occurredAt: Date; subscriptionId: string; customerId: string; status: string; creatorId: string | null; email: string | null }`

- [x] **Step 1: Write the failing tests**

```ts
// src/test/paddle-apply.integration.test.ts
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applyCustomerEvent, applySubscriptionEvent, recordEvent } from "@/lib/paddle/apply-subscription";

async function creator() {
  return db.creator.create({ data: { deviceKey: `apply-${Math.random().toString(36).slice(2)}` } });
}

const t = (s: string) => new Date(`2026-09-09T10:00:${s}Z`);

describe("recordEvent", () => {
  it("returns new then duplicate for the same eventId", async () => {
    const id = `evt_${Math.random().toString(36).slice(2)}`;
    expect(await recordEvent(id, "subscription.created", t("00"))).toBe("new");
    expect(await recordEvent(id, "subscription.created", t("00"))).toBe("duplicate");
  });
});

describe("applySubscriptionEvent", () => {
  it("binds by creatorId and sets PRO for active", async () => {
    const c = await creator();
    const result = await applySubscriptionEvent({
      occurredAt: t("00"),
      subscriptionId: `sub_${c.id}`,
      customerId: "ctm_1",
      status: "active",
      creatorId: c.id,
      email: "buyer@example.com",
    });
    expect(result).toBe("applied");
    const after = await db.creator.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.plan).toBe("PRO");
    expect(after.paddleSubscriptionId).toBe(`sub_${c.id}`);
    expect(after.paddleCustomerId).toBe("ctm_1");
    expect(after.email).toBe("buyer@example.com");
    expect(after.subscriptionUpdatedAt?.toISOString()).toBe(t("00").toISOString());
  });

  it("falls back to the stored subscription id when creatorId is missing", async () => {
    const c = await creator();
    await applySubscriptionEvent({ occurredAt: t("00"), subscriptionId: `sub_${c.id}`, customerId: "ctm_1", status: "active", creatorId: c.id, email: null });
    const result = await applySubscriptionEvent({ occurredAt: t("05"), subscriptionId: `sub_${c.id}`, customerId: "ctm_1", status: "canceled", creatorId: null, email: null });
    expect(result).toBe("applied");
    const after = await db.creator.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.plan).toBe("FREE");
    expect(after.subscriptionStatus).toBe("canceled");
  });

  it("ignores an event older than the stored one", async () => {
    const c = await creator();
    await applySubscriptionEvent({ occurredAt: t("10"), subscriptionId: `sub_${c.id}`, customerId: "ctm_1", status: "canceled", creatorId: c.id, email: null });
    const result = await applySubscriptionEvent({ occurredAt: t("05"), subscriptionId: `sub_${c.id}`, customerId: "ctm_1", status: "active", creatorId: c.id, email: null });
    expect(result).toBe("stale");
    const after = await db.creator.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.plan).toBe("FREE");
  });

  it("returns unmatched for an unknown creator and unknown subscription", async () => {
    const result = await applySubscriptionEvent({ occurredAt: t("00"), subscriptionId: "sub_nobody", customerId: "ctm_1", status: "active", creatorId: "does-not-exist", email: null });
    expect(result).toBe("unmatched");
  });

  it("keeps an existing email when the event carries none", async () => {
    const c = await creator();
    await applySubscriptionEvent({ occurredAt: t("00"), subscriptionId: `sub_${c.id}`, customerId: "ctm_1", status: "active", creatorId: c.id, email: "keep@example.com" });
    await applySubscriptionEvent({ occurredAt: t("01"), subscriptionId: `sub_${c.id}`, customerId: "ctm_1", status: "active", creatorId: c.id, email: null });
    const after = await db.creator.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.email).toBe("keep@example.com");
  });
});

describe("applyCustomerEvent", () => {
  it("updates email by paddleCustomerId and is a no-op for unknown customers", async () => {
    const c = await creator();
    await applySubscriptionEvent({ occurredAt: t("00"), subscriptionId: `sub_${c.id}`, customerId: `ctm_${c.id}`, status: "active", creatorId: c.id, email: "old@example.com" });
    await applyCustomerEvent({ customerId: `ctm_${c.id}`, email: "new@example.com" });
    await applyCustomerEvent({ customerId: "ctm_unknown", email: "nobody@example.com" });
    const after = await db.creator.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.email).toBe("new@example.com");
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run --config vitest.integration.config.ts src/test/paddle-apply.integration.test.ts`
Expected: FAIL, cannot find module `@/lib/paddle/apply-subscription`.

- [x] **Step 3: Implement**

```ts
// src/lib/paddle/apply-subscription.ts
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isNewerEvent, statusToPlan } from "./plan";

export type SubscriptionEventInput = {
  occurredAt: Date;
  subscriptionId: string;
  customerId: string;
  status: string;
  creatorId: string | null;
  email: string | null;
};

/** Insert the event id; a unique-constraint failure means Paddle retried an
 * event that was already applied. */
export async function recordEvent(eventId: string, type: string, occurredAt: Date): Promise<"new" | "duplicate"> {
  try {
    await db.paddleEvent.create({ data: { eventId, type, occurredAt } });
    return "new";
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "duplicate";
    throw err;
  }
}

export async function applySubscriptionEvent(input: SubscriptionEventInput): Promise<"applied" | "stale" | "unmatched"> {
  const creator =
    (input.creatorId ? await db.creator.findUnique({ where: { id: input.creatorId } }) : null) ??
    (await db.creator.findUnique({ where: { paddleSubscriptionId: input.subscriptionId } }));
  if (!creator) return "unmatched";
  if (!isNewerEvent(input.occurredAt, creator.subscriptionUpdatedAt)) return "stale";

  await db.creator.update({
    where: { id: creator.id },
    data: {
      plan: statusToPlan(input.status),
      subscriptionStatus: input.status,
      subscriptionUpdatedAt: input.occurredAt,
      paddleSubscriptionId: input.subscriptionId,
      paddleCustomerId: input.customerId,
      ...(input.email ? { email: input.email } : {}),
    },
  });
  return "applied";
}

export async function applyCustomerEvent(input: { customerId: string; email: string }): Promise<void> {
  await db.creator.updateMany({
    where: { paddleCustomerId: input.customerId },
    data: { email: input.email },
  });
}
```

- [x] **Step 4: Run to verify pass**

Run: `npx vitest run --config vitest.integration.config.ts src/test/paddle-apply.integration.test.ts`
Expected: PASS, 7 tests.

- [x] **Step 5: Commit**

```bash
git add src/lib/paddle/apply-subscription.ts src/test/paddle-apply.integration.test.ts
git commit -m "Apply Paddle subscription and customer events to Creator"
```

---

### Task 5: Webhook route

**Files:**
- Create: `src/app/api/paddle/webhook/route.ts`, `src/test/paddle-fixtures.ts`
- Test: `src/test/paddle-webhook.integration.test.ts`

**Interfaces:**
- Consumes: `webhookSecret()` (Task 3), `recordEvent`, `applySubscriptionEvent`, `applyCustomerEvent` (Task 4).
- Produces: `POST /api/paddle/webhook`; test helper `signedWebhookRequest(payload: object, secret: string, opts?: { ts?: number }): NextRequest` and `subscriptionPayload(overrides): object`.

- [x] **Step 1: Write the fixture builder**

Paddle signs `"{ts}:{rawBody}"` with HMAC-SHA256 hex and sends `paddle-signature: ts={ts};h1={hex}`. The SDK rejects a `ts` older than 5 seconds.

```ts
// src/test/paddle-fixtures.ts
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";

export const TEST_WEBHOOK_SECRET = "pdl_ntfset_test_secret";

export function signedWebhookRequest(payload: object, secret = TEST_WEBHOOK_SECRET, opts: { ts?: number } = {}) {
  const body = JSON.stringify(payload);
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const h1 = createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex");
  return new NextRequest("http://localhost:3000/api/paddle/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "paddle-signature": `ts=${ts};h1=${h1}` },
    body,
  });
}

let counter = 0;

/** Minimal subscription.* payload the SDK's fromJson accepts. Fields not
 * listed are left absent; the notification entity tolerates that. */
export function subscriptionPayload(overrides: {
  eventType?: string;
  eventId?: string;
  occurredAt?: string;
  subscriptionId?: string;
  customerId?: string;
  status?: string;
  creatorId?: string | null;
}) {
  counter += 1;
  const subscriptionId = overrides.subscriptionId ?? `sub_test_${counter}`;
  return {
    event_id: overrides.eventId ?? `evt_test_${Date.now()}_${counter}`,
    event_type: overrides.eventType ?? "subscription.created",
    occurred_at: overrides.occurredAt ?? new Date().toISOString(),
    notification_id: `ntf_test_${counter}`,
    data: {
      id: subscriptionId,
      status: overrides.status ?? "active",
      customer_id: overrides.customerId ?? "ctm_test",
      address_id: "add_test",
      business_id: null,
      currency_code: "USD",
      created_at: "2026-09-09T10:00:00Z",
      updated_at: "2026-09-09T10:00:00Z",
      started_at: null,
      first_billed_at: null,
      next_billed_at: null,
      paused_at: null,
      canceled_at: null,
      discount: null,
      collection_mode: "automatic",
      billing_details: null,
      current_billing_period: null,
      billing_cycle: { interval: "month", frequency: 1 },
      scheduled_change: null,
      items: [],
      custom_data: overrides.creatorId === undefined ? null : { creatorId: overrides.creatorId },
      import_meta: null,
    },
  };
}

export function customerPayload(overrides: { customerId: string; email: string; eventId?: string }) {
  counter += 1;
  return {
    event_id: overrides.eventId ?? `evt_test_${Date.now()}_${counter}`,
    event_type: "customer.updated",
    occurred_at: new Date().toISOString(),
    notification_id: `ntf_test_${counter}`,
    data: {
      id: overrides.customerId,
      name: null,
      email: overrides.email,
      marketing_consent: false,
      status: "active",
      custom_data: null,
      locale: "en",
      created_at: "2026-09-09T10:00:00Z",
      updated_at: "2026-09-09T10:00:00Z",
      import_meta: null,
    },
  };
}
```

- [x] **Step 2: Write the failing tests**

```ts
// src/test/paddle-webhook.integration.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/paddle/webhook/route";
import { db } from "@/lib/db";
import { customerPayload, signedWebhookRequest, subscriptionPayload, TEST_WEBHOOK_SECRET } from "./paddle-fixtures";

beforeEach(() => vi.stubEnv("PADDLE_NOTIFICATION_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET));
afterEach(() => vi.unstubAllEnvs());

async function creator() {
  return db.creator.create({ data: { deviceKey: `wh-${Math.random().toString(36).slice(2)}` } });
}

describe("POST /api/paddle/webhook", () => {
  it("400s without a signature header", async () => {
    const res = await POST(new NextRequest("http://localhost:3000/api/paddle/webhook", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
  });

  it("500s on a bad signature and writes nothing", async () => {
    const c = await creator();
    const res = await POST(signedWebhookRequest(subscriptionPayload({ creatorId: c.id }), "wrong-secret"));
    expect(res.status).toBe(500);
    expect((await db.creator.findUniqueOrThrow({ where: { id: c.id } })).plan).toBe("FREE");
  });

  it("500s on a stale timestamp", async () => {
    const c = await creator();
    const res = await POST(signedWebhookRequest(subscriptionPayload({ creatorId: c.id }), TEST_WEBHOOK_SECRET, { ts: Math.floor(Date.now() / 1000) - 60 }));
    expect(res.status).toBe(500);
  });

  it("sets PRO on subscription.created and records the event", async () => {
    const c = await creator();
    const payload = subscriptionPayload({ creatorId: c.id, subscriptionId: `sub_${c.id}` });
    const res = await POST(signedWebhookRequest(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, result: "applied" });
    const after = await db.creator.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.plan).toBe("PRO");
    expect(after.paddleSubscriptionId).toBe(`sub_${c.id}`);
    expect(await db.paddleEvent.findUnique({ where: { eventId: payload.event_id } })).not.toBeNull();
  });

  it("acknowledges a duplicate event without re-applying", async () => {
    const c = await creator();
    const payload = subscriptionPayload({ creatorId: c.id, subscriptionId: `sub_${c.id}` });
    await POST(signedWebhookRequest(payload));
    await db.creator.update({ where: { id: c.id }, data: { plan: "FREE" } });
    const res = await POST(signedWebhookRequest(payload));
    expect(await res.json()).toEqual({ received: true, result: "duplicate" });
    expect((await db.creator.findUniqueOrThrow({ where: { id: c.id } })).plan).toBe("FREE");
  });

  it("sets FREE on subscription.canceled", async () => {
    const c = await creator();
    await POST(signedWebhookRequest(subscriptionPayload({ creatorId: c.id, subscriptionId: `sub_${c.id}`, occurredAt: "2026-09-09T10:00:00Z" })));
    const res = await POST(signedWebhookRequest(subscriptionPayload({ eventType: "subscription.canceled", status: "canceled", creatorId: null, subscriptionId: `sub_${c.id}`, occurredAt: "2026-09-09T10:00:05Z" })));
    expect(await res.json()).toEqual({ received: true, result: "applied" });
    expect((await db.creator.findUniqueOrThrow({ where: { id: c.id } })).plan).toBe("FREE");
  });

  it("200s with unmatched for an unknown creator", async () => {
    const res = await POST(signedWebhookRequest(subscriptionPayload({ creatorId: "nope", subscriptionId: "sub_nope" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, result: "unmatched" });
  });

  it("updates email on customer.updated", async () => {
    const c = await creator();
    await POST(signedWebhookRequest(subscriptionPayload({ creatorId: c.id, subscriptionId: `sub_${c.id}`, customerId: `ctm_${c.id}` })));
    const res = await POST(signedWebhookRequest(customerPayload({ customerId: `ctm_${c.id}`, email: "changed@example.com" })));
    expect(res.status).toBe(200);
    expect((await db.creator.findUniqueOrThrow({ where: { id: c.id } })).email).toBe("changed@example.com");
  });

  it("200s and ignores an unrelated event type", async () => {
    const payload = { ...subscriptionPayload({ creatorId: null }), event_type: "transaction.completed" };
    const res = await POST(signedWebhookRequest(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, result: "ignored" });
  });
});
```

- [x] **Step 3: Run to verify failure**

Run: `npx vitest run --config vitest.integration.config.ts src/test/paddle-webhook.integration.test.ts`
Expected: FAIL, cannot find module `@/app/api/paddle/webhook/route`.

- [x] **Step 4: Implement the route**

```ts
// src/app/api/paddle/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { EventName, Paddle, type EventEntity } from "@paddle/paddle-node-sdk";
import { webhookSecret } from "@/lib/paddle/config";
import { applyCustomerEvent, applySubscriptionEvent, recordEvent } from "@/lib/paddle/apply-subscription";

const SUBSCRIPTION_EVENTS = new Set<string>([
  EventName.SubscriptionCreated,
  EventName.SubscriptionUpdated,
  EventName.SubscriptionActivated,
  EventName.SubscriptionCanceled,
  EventName.SubscriptionPastDue,
  EventName.SubscriptionPaused,
  EventName.SubscriptionResumed,
  EventName.SubscriptionTrialing,
]);

// Verification only needs the secret, not the API key, so a bare Paddle
// instance is fine here and keeps this route independent of PADDLE_API_KEY.
const verifier = new Paddle("unused-for-verification");

/**
 * Paddle delivers at least once and retries any non-2xx for up to three
 * days. Rules: 400 for a request that can never verify (no signature/body),
 * 500 for anything that throws (bad signature, DB down) so Paddle retries,
 * 200 for everything else including duplicates and events we do not use.
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("paddle-signature") ?? "";
  const rawBody = await req.text();
  if (!signature || !rawBody) {
    return NextResponse.json({ error: "Missing signature or body" }, { status: 400 });
  }

  let event: EventEntity;
  try {
    event = await verifier.webhooks.unmarshal(rawBody, webhookSecret(), signature);
  } catch (err) {
    console.error("paddle webhook: verification failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }

  try {
    const occurredAt = new Date(event.occurredAt);
    if ((await recordEvent(event.eventId, event.eventType, occurredAt)) === "duplicate") {
      return NextResponse.json({ received: true, result: "duplicate" });
    }

    if (SUBSCRIPTION_EVENTS.has(event.eventType)) {
      const sub = event.data as {
        id: string;
        status: string;
        customerId: string;
        customData: Record<string, unknown> | null;
      };
      const creatorId = typeof sub.customData?.creatorId === "string" ? sub.customData.creatorId : null;
      const result = await applySubscriptionEvent({
        occurredAt,
        subscriptionId: sub.id,
        customerId: sub.customerId,
        status: sub.status,
        creatorId,
        email: null,
      });
      if (result === "unmatched") {
        console.error("paddle webhook: no creator for subscription", sub.id, "creatorId", creatorId);
      }
      return NextResponse.json({ received: true, result });
    }

    if (event.eventType === EventName.CustomerUpdated || event.eventType === EventName.CustomerCreated) {
      const customer = event.data as { id: string; email: string };
      await applyCustomerEvent({ customerId: customer.id, email: customer.email });
      return NextResponse.json({ received: true, result: "applied" });
    }

    return NextResponse.json({ received: true, result: "ignored" });
  } catch (err) {
    console.error("paddle webhook: processing failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

Note on email: subscription events carry `customer_id` but not the email. Email arrives via `customer.created` / `customer.updated`, which Paddle sends in the same checkout flow, so subscribe to both on the notification destination (Task 8).

- [x] **Step 5: Run to verify pass**

Run: `npx vitest run --config vitest.integration.config.ts src/test/paddle-webhook.integration.test.ts`
Expected: PASS, 9 tests. If `fromJson` rejects the fixture shape, compare against `node_modules/@paddle/paddle-node-sdk/dist/types/notifications/entities/subscription/subscription-notification.d.ts` and add the missing field to `subscriptionPayload`; do not loosen the route.

- [x] **Step 6: Run the whole suite and lint**

Run: `npm run test && npm run test:integration && npx tsc --noEmit -p . && npx eslint src`
Expected: all green.

- [x] **Step 7: Commit**

```bash
git add src/app/api/paddle/webhook/route.ts src/test/paddle-fixtures.ts src/test/paddle-webhook.integration.test.ts
git commit -m "Add the Paddle webhook route with signature verification and idempotent apply"
```

---

### Task 6: Status endpoint and creator-on-page helper

**Files:**
- Modify: `src/app/api/creator/status/route.ts`
- Modify: `src/lib/creator.ts` (add `getOrCreateCreatorForPage`)
- Test: `src/test/creator-status.integration.test.ts` (extend), `src/test/creator-page.integration.test.ts` (new)

**Interfaces:**
- Produces: status JSON gains `hasSubscription: boolean` (true when `paddleSubscriptionId` is set) and `subscriptionStatus: string | null`; `getOrCreateCreatorForPage(): Promise<Creator>` for server components (reads and sets the cookie through `next/headers`).

- [x] **Step 1: Extend the status test** (append to `src/test/creator-status.integration.test.ts`)

```ts
it("reports hasSubscription and subscriptionStatus", async () => {
  const deviceKey = `status-sub-${Math.random().toString(36).slice(2)}`;
  await db.creator.create({
    data: { deviceKey, plan: "PRO", paddleSubscriptionId: `sub_${deviceKey}`, subscriptionStatus: "active" },
  });
  const res = await GET(new NextRequest("http://localhost:3000/api/creator/status", { headers: { cookie: `${COOKIE_NAME}=${deviceKey}` } }));
  const body = await res.json();
  expect(body.plan).toBe("PRO");
  expect(body.hasSubscription).toBe(true);
  expect(body.subscriptionStatus).toBe("active");
});

it("reports hasSubscription false for a cookie-less visitor", async () => {
  const res = await GET(new NextRequest("http://localhost:3000/api/creator/status"));
  expect((await res.json()).hasSubscription).toBe(false);
});
```

Check the file's existing imports; add `db`, `COOKIE_NAME`, `NextRequest` if absent.

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run --config vitest.integration.config.ts src/test/creator-status.integration.test.ts`
Expected: FAIL, `expected undefined to be true`.

- [x] **Step 3: Implement the status change**

```ts
// src/app/api/creator/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { FREE_LIMIT, getCreatorReadOnly, withRolledPeriod } from "@/lib/creator";

export async function GET(req: NextRequest) {
  const creator = await getCreatorReadOnly(req);
  if (!creator) {
    return NextResponse.json({
      plan: "FREE",
      packsGeneratedInPeriod: 0,
      limit: FREE_LIMIT,
      hasSubscription: false,
      subscriptionStatus: null,
    });
  }

  const rolled = withRolledPeriod(creator);
  return NextResponse.json({
    plan: rolled.plan,
    packsGeneratedInPeriod: rolled.packsGeneratedInPeriod,
    limit: FREE_LIMIT,
    hasSubscription: rolled.paddleSubscriptionId !== null,
    subscriptionStatus: rolled.subscriptionStatus,
  });
}
```

- [x] **Step 4: Write the page-helper test**

```ts
// src/test/creator-page.integration.test.ts
import { describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
    set: (name: string, value: string) => void store.set(name, value),
  }),
}));

import { COOKIE_NAME, getOrCreateCreatorForPage } from "@/lib/creator";
import { db } from "@/lib/db";

describe("getOrCreateCreatorForPage", () => {
  it("creates a creator and sets the cookie when none exists", async () => {
    store.clear();
    const creator = await getOrCreateCreatorForPage();
    expect(store.get(COOKIE_NAME)).toBe(creator.deviceKey);
    expect(await db.creator.findUnique({ where: { id: creator.id } })).not.toBeNull();
  });

  it("returns the existing creator for a known cookie", async () => {
    const existing = await db.creator.create({ data: { deviceKey: `page-${Math.random().toString(36).slice(2)}` } });
    store.set(COOKIE_NAME, existing.deviceKey);
    const creator = await getOrCreateCreatorForPage();
    expect(creator.id).toBe(existing.id);
  });
});
```

- [x] **Step 5: Implement the helper** (append to `src/lib/creator.ts`)

```ts
import { cookies } from "next/headers";

/**
 * Server-component twin of getOrCreateCreator for pages that must know who
 * the visitor is before any API call (the pricing page needs creatorId in
 * the checkout's customData). Setting a cookie from a server component is
 * allowed in Next 16 during a dynamic render; this page is dynamic because
 * it reads cookies.
 */
export async function getOrCreateCreatorForPage(): Promise<Creator> {
  const jar = await cookies();
  const existingKey = jar.get(COOKIE_NAME)?.value;
  if (existingKey) {
    const found = await db.creator.findUnique({ where: { deviceKey: existingKey } });
    if (found) return found;
  }
  const deviceKey = randomUUID();
  const creator = await db.creator.create({ data: { deviceKey } });
  jar.set(COOKIE_NAME, deviceKey, cookieOptions());
  return creator;
}
```

Move the `import { cookies } from "next/headers"` line to the top of the file with the other imports. `next/headers` is server-only; `src/lib/creator.ts` is already only imported from server code, so this is safe. If the unit suite (`npm run test`) fails to resolve `next/headers`, add `vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }) }))` to `src/lib/creator.test.ts`.

- [x] **Step 6: Run both tests**

Run: `npx vitest run --config vitest.integration.config.ts src/test/creator-status.integration.test.ts src/test/creator-page.integration.test.ts && npm run test`
Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add src/app/api/creator/status/route.ts src/lib/creator.ts src/test/creator-status.integration.test.ts src/test/creator-page.integration.test.ts
git commit -m "Expose subscription state on the creator status endpoint and add a page-side creator helper"
```

---

### Task 7: Pricing page with overlay checkout and portal action

**Files:**
- Create: `src/app/pricing/page.tsx`, `src/app/pricing/PricingCards.tsx`, `src/app/pricing/actions.ts`
- Test: `e2e/pricing.spec.ts`

**Interfaces:**
- Consumes: `getOrCreateCreatorForPage` (Task 6), `getPaddle` (Task 3), `getCreatorReadOnly` pattern.
- Produces: `/pricing`; server action `openCustomerPortal(): Promise<never>` (redirects).

- [x] **Step 1: Write the failing e2e test**

```ts
// e2e/pricing.spec.ts
import { test, expect } from "@playwright/test";

test("pricing page shows both plans and a checkout button each", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { level: 1, name: "Go Pro" })).toBeVisible();
  await expect(page.getByText("$5")).toBeVisible();
  await expect(page.getByText("$25")).toBeVisible();
  await expect(page.getByRole("button", { name: "Subscribe monthly" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Subscribe yearly" })).toBeVisible();
});

test("create page at the cap links to pricing", async ({ page, context }) => {
  // Seed a capped creator through the API surface: two generations are not
  // affordable in e2e, so set the cookie to a creator row inserted directly.
  const res = await page.request.post("/api/test/capped-creator");
  test.skip(res.status() === 404, "test-only route not mounted");
});
```

Delete the second test before committing; the cap link is covered by the unit-level render in Task 9 instead. (Kept here so the executor does not add a test-only route.)

- [x] **Step 2: Run to verify failure**

Run: `npx playwright test e2e/pricing.spec.ts`
Expected: FAIL, heading not found (404 page).

- [x] **Step 3: Implement the server page**

```tsx
// src/app/pricing/page.tsx
import { SiteHeader } from "@/components/SiteHeader";
import { getOrCreateCreatorForPage } from "@/lib/creator";
import { PricingCards } from "./PricingCards";
import { ManageSubscriptionButton } from "./ManageSubscriptionButton";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const creator = await getOrCreateCreatorForPage();
  const isPro = creator.plan === "PRO";

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Go Pro</h1>
        <p className="mt-2 text-muted">
          Free accounts get two AI-generated packs every 30 days. Pro removes the cap.
        </p>
        {isPro ? (
          <section className="mt-8 rounded-2xl border border-line bg-white p-6">
            <p className="font-medium">You are on Pro. Thank you.</p>
            <p className="mt-1 text-sm text-muted">Invoices, payment method and cancellation live in the billing portal.</p>
            <ManageSubscriptionButton />
          </section>
        ) : (
          <PricingCards
            creatorId={creator.id}
            env={process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox"}
            clientToken={process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? ""}
            priceMonthly={process.env.NEXT_PUBLIC_PADDLE_PRICE_MONTHLY ?? ""}
            priceAnnual={process.env.NEXT_PUBLIC_PADDLE_PRICE_ANNUAL ?? ""}
          />
        )}
      </main>
    </>
  );
}
```

- [x] **Step 4: Implement the client cards**

```tsx
// src/app/pricing/PricingCards.tsx
"use client";

import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import { useEffect, useState } from "react";

type Props = {
  creatorId: string;
  env: "sandbox" | "production";
  clientToken: string;
  priceMonthly: string;
  priceAnnual: string;
};

export function PricingCards({ creatorId, env, clientToken, priceMonthly, priceAnnual }: Props) {
  const [paddle, setPaddle] = useState<Paddle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const configured = clientToken !== "" && priceMonthly !== "" && priceAnnual !== "";

  useEffect(() => {
    if (!configured) return;
    initializePaddle({ token: clientToken, environment: env })
      .then((p) => {
        if (p) setPaddle(p);
        else setError("Checkout failed to load. Reload the page to try again.");
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Checkout failed to load."));
  }, [configured, clientToken, env]);

  function subscribe(priceId: string) {
    if (!paddle) return;
    paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customData: { creatorId },
      settings: {
        variant: "one-page",
        successUrl: `${window.location.origin}/create?upgraded=1`,
      },
    });
  }

  const cards = [
    { id: priceMonthly, name: "Monthly", amount: "$5", per: "per month", label: "Subscribe monthly" },
    { id: priceAnnual, name: "Yearly", amount: "$25", per: "per year, two months free", label: "Subscribe yearly" },
  ];

  return (
    <section className="mt-8 grid gap-5 sm:grid-cols-2">
      {cards.map((card) => (
        <div key={card.name} className="rounded-2xl border border-line bg-white p-6">
          <h2 className="text-lg font-semibold">{card.name}</h2>
          <p className="mt-3 text-3xl font-semibold">
            {card.amount} <span className="text-base font-normal text-muted">{card.per}</span>
          </p>
          <ul className="mt-4 space-y-1 text-sm text-muted">
            <li>Unlimited AI-generated packs</li>
            <li>Everything in Free</li>
            <li>Cancel any time</li>
          </ul>
          <button
            type="button"
            onClick={() => subscribe(card.id)}
            disabled={!paddle}
            className="mt-6 h-12 w-full rounded-xl bg-amber text-base font-semibold text-white hover:bg-amber-hover disabled:opacity-50"
          >
            {card.label}
          </button>
        </div>
      ))}
      {!configured ? (
        <p role="alert" className="text-sm text-red-700 sm:col-span-2">
          Checkout is not configured on this deployment (missing NEXT_PUBLIC_PADDLE values).
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700 sm:col-span-2">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-muted sm:col-span-2">
        Payments are handled by Paddle, our merchant of record. Prices exclude VAT where applicable.
      </p>
    </section>
  );
}
```

The "not configured" alert is deliberate: a missing value must be visible, never a silent dead button (global rule 5).

- [x] **Step 5: Implement the portal action and button**

```ts
// src/app/pricing/actions.ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME } from "@/lib/creator";
import { db } from "@/lib/db";
import { getPaddle } from "@/lib/paddle/client";

/** Mints a Paddle customer-portal session for the cookie's creator and
 * redirects there. Throws (surfacing Next's error boundary) rather than
 * silently returning if the creator has no Paddle customer. */
export async function openCustomerPortal(): Promise<never> {
  const deviceKey = (await cookies()).get(COOKIE_NAME)?.value;
  const creator = deviceKey ? await db.creator.findUnique({ where: { deviceKey } }) : null;
  if (!creator?.paddleCustomerId) {
    throw new Error("No subscription is attached to this browser. Use Restore Pro if you subscribed before.");
  }
  const session = await getPaddle().customerPortalSessions.create(
    creator.paddleCustomerId,
    creator.paddleSubscriptionId ? [creator.paddleSubscriptionId] : []
  );
  redirect(session.urls.general.overview);
}
```

```tsx
// src/app/pricing/ManageSubscriptionButton.tsx
"use client";

import { useTransition } from "react";
import { openCustomerPortal } from "./actions";

export function ManageSubscriptionButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => openCustomerPortal())}
      disabled={pending}
      className="mt-4 h-11 rounded-xl border border-line px-5 text-sm font-semibold hover:bg-cream disabled:opacity-50"
    >
      {pending ? "Opening…" : "Manage subscription"}
    </button>
  );
}
```

Add `ManageSubscriptionButton.tsx` to this task's file list when committing.

- [x] **Step 6: Run e2e, typecheck, lint**

Run: `npx playwright test e2e/pricing.spec.ts && npx tsc --noEmit -p . && npx eslint src e2e`
Expected: PASS (the first test; the second was deleted). The page renders with the "not configured" alert because e2e has no Paddle env, which is correct.

- [x] **Step 7: Commit**

```bash
git add src/app/pricing e2e/pricing.spec.ts
git commit -m "Add the pricing page with Paddle overlay checkout and a billing-portal action"
```

---

### Task 8: Create page — link to pricing, post-checkout polling, manage link

**Files:**
- Modify: `src/app/create/page.tsx` (lines 14–23 state/effect, 126–130 cap copy)
- Test: `e2e/create-upgrade.spec.ts`

**Interfaces:**
- Consumes: status JSON with `hasSubscription` (Task 6).

- [x] **Step 1: Write the failing e2e test**

```ts
// e2e/create-upgrade.spec.ts
import { test, expect } from "@playwright/test";

test("create page with ?upgraded=1 shows the activation notice and clears it once Pro", async ({ page }) => {
  await page.route("**/api/creator/status", async (route) => {
    await route.fulfill({
      json: { plan: "PRO", packsGeneratedInPeriod: 0, limit: 2, hasSubscription: true, subscriptionStatus: "active" },
    });
  });
  await page.goto("/create?upgraded=1");
  await expect(page.getByText("You are on Pro")).toBeVisible();
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByRole("link", { name: "Manage subscription" })).toBeVisible();
});

test("create page at the cap links to pricing", async ({ page }) => {
  await page.route("**/api/creator/status", async (route) => {
    await route.fulfill({
      json: { plan: "FREE", packsGeneratedInPeriod: 2, limit: 2, hasSubscription: false, subscriptionStatus: null },
    });
  });
  await page.goto("/create");
  await expect(page.getByRole("button", { name: "Free limit reached" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/pricing");
});
```

- [x] **Step 2: Run to verify failure**

Run: `npx playwright test e2e/create-upgrade.spec.ts`
Expected: FAIL, "You are on Pro" not found.

- [x] **Step 3: Implement**

Replace the `usage` state, the status effect, and the cap copy in `src/app/create/page.tsx`:

```tsx
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type Usage = { used: number; limit: number; plan: string; hasSubscription: boolean };

// inside CreatePage:
const searchParams = useSearchParams();
const upgraded = searchParams.get("upgraded") === "1";
const [usage, setUsage] = useState<Usage | null>(null);
const [activationSlow, setActivationSlow] = useState(false);

async function loadStatus(): Promise<Usage> {
  const res = await fetch("/api/creator/status", { cache: "no-store" });
  const data = await res.json();
  const next = { used: data.packsGeneratedInPeriod, limit: data.limit, plan: data.plan, hasSubscription: data.hasSubscription };
  setUsage(next);
  return next;
}

useEffect(() => {
  let cancelled = false;
  let attempts = 0;
  async function tick() {
    const status = await loadStatus();
    if (cancelled) return;
    if (!upgraded) return;
    if (status.plan === "PRO") {
      router.replace("/create");
      return;
    }
    attempts += 1;
    if (attempts >= 30) {
      setActivationSlow(true);
      return;
    }
    setTimeout(tick, 2000);
  }
  tick();
  return () => {
    cancelled = true;
  };
  // router is stable; upgraded is the only real dependency
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [upgraded]);
```

Wrap the page's default export in `<Suspense>` because `useSearchParams` requires it in the App Router: rename the current component to `CreatePageInner` and export

```tsx
export default function CreatePage() {
  return (
    <Suspense fallback={null}>
      <CreatePageInner />
    </Suspense>
  );
}
```

Replace the free-count paragraph (lines 77–81) with:

```tsx
{usage && usage.plan === "PRO" ? (
  <p className="mt-2 text-sm text-muted">
    You are on Pro. Unlimited packs.{" "}
    <Link href="/pricing" className="underline">
      Manage subscription
    </Link>
  </p>
) : usage ? (
  <p className="mt-2 text-sm text-muted">
    {usage.used}/{usage.limit} free packs used this month
  </p>
) : null}
{upgraded && usage && usage.plan !== "PRO" ? (
  <p role="status" className="mt-2 text-sm text-muted">
    {activationSlow
      ? "Payment received, activation is taking longer than usual. Reload in a minute."
      : "Payment received, activating Pro…"}
  </p>
) : null}
```

Replace the cap copy (lines 126–130) with:

```tsx
{usage && usage.plan !== "PRO" && usage.used >= usage.limit ? (
  <p className="text-sm text-muted">
    <Link href="/pricing" className="font-semibold underline">
      Upgrade to Pro
    </Link>{" "}
    for unlimited packs, or use the demo pack.
  </p>
) : null}
```

Also update the generate route's 403 copy in `src/app/api/packs/generate/route.ts` from "Upgrade to Pro for unlimited generation." to "Upgrade to Pro at /pricing for unlimited generation." and adjust any test asserting that string (`grep -rn "Upgrade to Pro" src`).

- [x] **Step 4: Run e2e, unit, integration, typecheck, lint**

Run: `npx playwright test e2e/create-upgrade.spec.ts && npm run test && npm run test:integration && npx tsc --noEmit -p . && npx eslint src e2e`
Expected: all PASS.

- [x] **Step 5: Commit**

```bash
git add src/app/create/page.tsx src/app/api/packs/generate/route.ts e2e/create-upgrade.spec.ts src/test
git commit -m "Link the free cap to pricing and activate Pro on return from checkout"
```

---

### Task 9: Sandbox catalog, destination, preview verification

No code beyond a seed script. This task is the sandbox gate; nothing goes live before it passes.

**Files:**
- Create: `scripts/seed-paddle-catalog.ts` (only if the MCP path fails)
- Modify: `README.md` (Paddle section), `HANDOFF.md` (status)

- [ ] **Step 1: Create sandbox product and prices**

Via the `paddle-sandbox` MCP `execute` tool, one call:

```js
async (client) => {
  const product = await client.products.create({
    name: "Pub Quiz Pro",
    tax_category: "saas",
    description: "Unlimited AI-generated quiz packs.",
  });
  const monthly = await client.prices.create({
    product_id: product.id,
    description: "Pro monthly USD",
    unit_price: { amount: "500", currency_code: "USD" },
    billing_cycle: { interval: "month", frequency: 1 },
  });
  const yearly = await client.prices.create({
    product_id: product.id,
    description: "Pro yearly USD",
    unit_price: { amount: "2500", currency_code: "USD" },
    billing_cycle: { interval: "year", frequency: 1 },
  });
  return { product_id: product.id, monthly_id: monthly.id, yearly_id: yearly.id };
};
```

If `tax_category: "saas"` is rejected, retry with `"standard"` and record the outcome in the spec's Catalog section. If `execute` returns `forbidden`, write `scripts/seed-paddle-catalog.ts` per the catalog-setup skill template with the values above and ask the owner to run it with a sandbox `PADDLE_API_KEY` in their shell (Git Bash, repo root: `PADDLE_API_KEY=... npx tsx scripts/seed-paddle-catalog.ts`). The ids are not secrets and may be pasted into chat.

- [ ] **Step 2: Create a sandbox client token**

`execute`: `async (client) => client.clientTokens.create({ name: "pub-quiz preview" })`. The token is publishable (`test_...`) and may appear in chat.

- [ ] **Step 3: Set preview env in Vercel** (Git Bash, repo root; `npx --no-install vercel`)

```bash
printf 'sandbox' | npx --no-install vercel env add NEXT_PUBLIC_PADDLE_ENV preview --force
printf '<test_token>' | npx --no-install vercel env add NEXT_PUBLIC_PADDLE_CLIENT_TOKEN preview --force
printf '<pri_monthly>' | npx --no-install vercel env add NEXT_PUBLIC_PADDLE_PRICE_MONTHLY preview --force
printf '<pri_yearly>' | npx --no-install vercel env add NEXT_PUBLIC_PADDLE_PRICE_ANNUAL preview --force
```

The owner adds `PADDLE_API_KEY` (sandbox key) for `preview` with `--sensitive` from a file, and later the webhook secret the same way. The assistant never handles these values.

- [ ] **Step 4: Deploy a preview and create the notification destination**

Push the branch; note the preview URL from `vercel ls 2>&1`. Then via `paddle-sandbox` `execute`:

```js
async (client) =>
  client.notificationSettings.create({
    description: "pub-quiz preview",
    type: "url",
    destination: "https://<preview-url>/api/paddle/webhook",
    subscribed_events: [
      "subscription.created", "subscription.updated", "subscription.activated",
      "subscription.canceled", "subscription.past_due", "subscription.paused",
      "subscription.resumed", "subscription.trialing",
      "customer.created", "customer.updated",
    ],
  });
```

The response contains `endpoint_secret_key`. Do not print it. The owner copies it from the Paddle sandbox dashboard (Developer tools > Notifications) into Vercel `preview` as `PADDLE_NOTIFICATION_WEBHOOK_SECRET --sensitive`, then redeploys.

- [ ] **Step 5: Simulator run**

`execute`: create a simulation of type `subscription_created` against the new `notification_setting_id`, then `client.simulations.runs.create(sim.id, {})`. Expect the preview's function logs (`vercel logs <preview-url>`, started before the run) to show `result: "unmatched"` (the simulator's `custom_data` has no `creatorId`), which proves signature verification and dedupe work end to end.

- [ ] **Step 6: Real sandbox checkout in the Browser pane**

Open `https://<preview-url>/pricing`, click **Subscribe monthly**, pay with `4242 4242 4242 4242`, any future expiry, any CVC, a throwaway email. Expect redirect to `/create?upgraded=1`, then "You are on Pro" within a few seconds. Confirm server-side: `curl -s -b "pq_creator=<value from DevTools>" https://<preview-url>/api/creator/status` shows `"plan":"PRO"` (or query the preview database if the preview uses a separate Turso branch). Then click **Manage subscription**, cancel immediately in the portal, and confirm status returns to `FREE`.

- [ ] **Step 7: Document**

README: new "Pro subscriptions (Paddle)" section listing the env variables, the webhook route, the status mapping, and the sandbox test procedure above. HANDOFF: "Shipped" bullet for phase 3a with the preview verification evidence; "Next" becomes live cutover (Task 10) then phase 3b.

- [ ] **Step 8: Commit**

```bash
git add README.md HANDOFF.md docs/superpowers/specs/2026-09-09-paddle-pro-design.md scripts
git commit -m "Document the Paddle Pro integration and the sandbox verification"
```

---

### Task 10: Live cutover (owner-gated)

No new code. Every step below is the global pre-"live" checklist applied to this feature.

- [ ] **Step 1: Owner actions in the Paddle live dashboard** — approve the production domain under Checkout > Website approval; set the default payment link to `https://pub-quiz-trivia-night-automation-hu.vercel.app/pricing`; grant write permission to the `paddle-live` MCP connector or create the live product and prices by hand with the same values as Task 9 Step 1.
- [ ] **Step 2: Live catalog** via `paddle-live` `execute` (same code as Task 9 Step 1) or the owner's dashboard. Record the live `pri_` ids in the handoff.
- [ ] **Step 3: Live client token** via `execute` `client.clientTokens.create({ name: "pub-quiz production" })`.
- [ ] **Step 4: Production env** — four `NEXT_PUBLIC_PADDLE_*` values as type Config with `vercel env add NAME production --force`; owner adds live `PADDLE_API_KEY` and, after Step 5, `PADDLE_NOTIFICATION_WEBHOOK_SECRET`, both `--sensitive`.
- [ ] **Step 5: Live notification destination** pointing at `https://pub-quiz-trivia-night-automation-hu.vercel.app/api/paddle/webhook`, same event list as Task 9 Step 4.
- [ ] **Step 6: Redeploy** and confirm the build did not throw from `next.config.ts`.
- [ ] **Step 7: Grep the deployed bundle**: `curl -s https://pub-quiz-trivia-night-automation-hu.vercel.app/pricing | grep -o '_next/static/chunks/app/pricing/[^"]*' | head -1`, fetch that chunk, and grep it for `live_` (client token prefix) and both live `pri_` ids. All three must appear.
- [ ] **Step 8: Walk the real path** in the Browser pane on the production domain in a fresh profile: DevTools Console clean, Network filtered to `paddle` shows `200`s; buy monthly with the owner's own card; confirm `plan === "PRO"` by querying the production database (`turso db shell <db> "select plan, subscriptionStatus from Creator where paddleSubscriptionId is not null"`); cancel **immediately** (not at period end) from the Paddle dashboard; confirm `subscription.canceled` arrived (`vercel logs`) and `plan` is `FREE` the same day; refund the transaction in the dashboard.
- [ ] **Step 9: Update docs** — HANDOFF "Shipped" bullet says live with the timestamps and evidence; README no longer says "coming soon" anywhere (`grep -rn "coming soon" src README.md` returns nothing); roadmap status block updated. Commit.

---

### Task 11 (phase 3b): Restore token library

**Files:**
- Create: `src/lib/restore/token.ts`
- Test: `src/lib/restore/token.test.ts`, `src/test/restore-token.integration.test.ts`

**Interfaces:**
- Produces: `generateToken(): { raw: string; hash: string }`; `hashToken(raw: string): string` (SHA-256 of `MAGIC_LINK_PEPPER + raw`, hex); `issueRestoreToken(creatorId: string, now?: Date): Promise<string /* raw */>`; `consumeRestoreToken(raw: string, now?: Date): Promise<{ creatorId: string; deviceKey: string } | null>`.
- Constant: `RESTORE_TOKEN_TTL_MS = 15 * 60 * 1000`.

- [ ] **Step 1: Unit test**

```ts
// src/lib/restore/token.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateToken, hashToken } from "./token";

beforeEach(() => vi.stubEnv("MAGIC_LINK_PEPPER", "pepper"));
afterEach(() => vi.unstubAllEnvs());

describe("restore token", () => {
  it("generates 43+ char url-safe tokens whose hash matches hashToken", () => {
    const { raw, hash } = generateToken();
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    expect(hash).toBe(hashToken(raw));
  });
  it("changes the hash when the pepper changes", () => {
    const { raw, hash } = generateToken();
    vi.stubEnv("MAGIC_LINK_PEPPER", "other");
    expect(hashToken(raw)).not.toBe(hash);
  });
  it("throws without a pepper", () => {
    vi.stubEnv("MAGIC_LINK_PEPPER", "");
    expect(() => hashToken("x")).toThrow("MAGIC_LINK_PEPPER");
  });
});
```

- [ ] **Step 2: Integration test**

```ts
// src/test/restore-token.integration.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { consumeRestoreToken, issueRestoreToken, RESTORE_TOKEN_TTL_MS } from "@/lib/restore/token";

beforeEach(() => vi.stubEnv("MAGIC_LINK_PEPPER", "pepper"));
afterEach(() => vi.unstubAllEnvs());

async function creator() {
  return db.creator.create({ data: { deviceKey: `restore-${Math.random().toString(36).slice(2)}` } });
}

describe("restore tokens", () => {
  it("issues a token that consumes exactly once", async () => {
    const c = await creator();
    const raw = await issueRestoreToken(c.id);
    expect(await consumeRestoreToken(raw)).toEqual({ creatorId: c.id, deviceKey: c.deviceKey });
    expect(await consumeRestoreToken(raw)).toBeNull();
  });
  it("rejects an expired token", async () => {
    const c = await creator();
    const issuedAt = new Date("2026-09-09T10:00:00Z");
    const raw = await issueRestoreToken(c.id, issuedAt);
    expect(await consumeRestoreToken(raw, new Date(issuedAt.getTime() + RESTORE_TOKEN_TTL_MS + 1))).toBeNull();
  });
  it("rejects an unknown token", async () => {
    expect(await consumeRestoreToken("nope")).toBeNull();
  });
});
```

- [ ] **Step 3: Run both to verify failure**

Run: `npx vitest run src/lib/restore && npx vitest run --config vitest.integration.config.ts src/test/restore-token.integration.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement**

```ts
// src/lib/restore/token.ts
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

export const RESTORE_TOKEN_TTL_MS = 15 * 60 * 1000;

function pepper(): string {
  const value = process.env.MAGIC_LINK_PEPPER;
  if (!value) throw new Error("MAGIC_LINK_PEPPER is not set");
  return value;
}

/** SHA-256 over pepper + raw. The pepper means a database dump alone cannot
 * be turned into working links. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(pepper()).update(raw).digest("hex");
}

export function generateToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export async function issueRestoreToken(creatorId: string, now = new Date()): Promise<string> {
  const { raw, hash } = generateToken();
  await db.restoreToken.create({
    data: { tokenHash: hash, creatorId, expiresAt: new Date(now.getTime() + RESTORE_TOKEN_TTL_MS) },
  });
  return raw;
}

/** Marks the token used and returns the creator, or null when the token is
 * unknown, expired or already used. The conditional updateMany makes the
 * single-use check race-safe (same pattern as session state transitions). */
export async function consumeRestoreToken(raw: string, now = new Date()): Promise<{ creatorId: string; deviceKey: string } | null> {
  const tokenHash = hashToken(raw);
  const claimed = await db.restoreToken.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (claimed.count !== 1) return null;
  const token = await db.restoreToken.findUniqueOrThrow({ where: { tokenHash }, include: { creator: true } });
  return { creatorId: token.creatorId, deviceKey: token.creator.deviceKey };
}
```

- [ ] **Step 5: Run to verify pass, then commit**

```bash
git add src/lib/restore src/test/restore-token.integration.test.ts
git commit -m "Add single-use peppered restore tokens for the Pro magic link"
```

---

### Task 12 (phase 3b): Restore routes, pages and email

**Files:**
- Create: `src/lib/restore/email.ts`, `src/app/api/restore/route.ts`, `src/app/restore/page.tsx`, `src/app/restore/RestoreForm.tsx`, `src/app/restore/confirm/route.ts`
- Modify: `.env.example` (add `RESEND_API_KEY`, `MAGIC_LINK_PEPPER`, `RESTORE_EMAIL_FROM`), `src/app/pricing/page.tsx` (link to `/restore` under the cards), `package.json` (`resend`)
- Test: `src/test/restore-routes.integration.test.ts`

**Interfaces:**
- Consumes: `issueRestoreToken`, `consumeRestoreToken` (Task 11); `rateLimit` (`src/lib/rate-limit.ts`); `COOKIE_NAME` and `cookieOptions` (export `cookieOptions` from `src/lib/creator.ts`).
- Produces: `sendRestoreEmail(to: string, link: string): Promise<void>` (injectable for tests via `setRestoreEmailSender`); `POST /api/restore` `{ email }` → `200 { ok: true }` always; `GET /restore/confirm?token=` → 303 to `/create` with cookie set, or 200 HTML "This link has expired or was already used".

- [ ] **Step 1: Write the failing integration tests**

```ts
// src/test/restore-routes.integration.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as requestRestore } from "@/app/api/restore/route";
import { GET as confirmRestore } from "@/app/restore/confirm/route";
import { COOKIE_NAME } from "@/lib/creator";
import { db } from "@/lib/db";
import { setRestoreEmailSender } from "@/lib/restore/email";

const sent: { to: string; link: string }[] = [];

beforeEach(() => {
  vi.stubEnv("MAGIC_LINK_PEPPER", "pepper");
  sent.length = 0;
  setRestoreEmailSender(async (to, link) => void sent.push({ to, link }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  setRestoreEmailSender(null);
});

function post(email: string, ip = "203.0.113.5") {
  return requestRestore(
    new NextRequest("http://localhost:3000/api/restore", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email }),
    })
  );
}

describe("restore flow", () => {
  it("sends a link for a known email and sets the cookie on confirm, once", async () => {
    const email = `buyer-${Math.random().toString(36).slice(2)}@example.com`;
    const c = await db.creator.create({ data: { deviceKey: `rr-${email}`, email, plan: "PRO" } });
    const res = await post(email);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(email);
    const url = new URL(sent[0].link);
    expect(url.pathname).toBe("/restore/confirm");

    const confirm = await confirmRestore(new NextRequest(url.toString()));
    expect(confirm.status).toBe(303);
    expect(confirm.headers.get("location")).toBe("http://localhost:3000/create");
    expect(confirm.headers.get("set-cookie")).toContain(`${COOKIE_NAME}=${c.deviceKey}`);

    const again = await confirmRestore(new NextRequest(url.toString()));
    expect(again.status).toBe(200);
    expect(await again.text()).toContain("expired or was already used");
  });

  it("responds identically for an unknown email and sends nothing", async () => {
    const res = await post("nobody@example.com");
    expect(await res.json()).toEqual({ ok: true });
    expect(sent).toHaveLength(0);
  });

  it("rate limits after five requests from one IP", async () => {
    const ip = "198.51.100.9";
    for (let i = 0; i < 5; i += 1) expect((await post("x@example.com", ip)).status).toBe(200);
    expect((await post("x@example.com", ip)).status).toBe(429);
  });

  it("400s on a malformed body", async () => {
    const res = await requestRestore(new NextRequest("http://localhost:3000/api/restore", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --config vitest.integration.config.ts src/test/restore-routes.integration.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Install Resend and implement the sender**

Run: `npm install resend`

```ts
// src/lib/restore/email.ts
import { Resend } from "resend";

type Sender = (to: string, link: string) => Promise<void>;
let override: Sender | null = null;

/** Tests swap the sender; production uses Resend. */
export function setRestoreEmailSender(sender: Sender | null) {
  override = sender;
}

export async function sendRestoreEmail(to: string, link: string): Promise<void> {
  if (override) return override(to, link);
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESTORE_EMAIL_FROM;
  if (!apiKey || !from) throw new Error("RESEND_API_KEY and RESTORE_EMAIL_FROM must be set");
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to,
    subject: "Your Pub Quiz Pro sign-in link",
    text: `Open this link within 15 minutes to restore Pro in this browser:\n\n${link}\n\nIf you did not ask for this, ignore this email.`,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}
```

- [ ] **Step 4: Implement the request route**

```ts
// src/app/api/restore/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { sendRestoreEmail } from "@/lib/restore/email";
import { issueRestoreToken } from "@/lib/restore/token";

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email() });

/** Always 200 with the same body so the endpoint cannot be used to test
 * which emails have subscriptions. */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, "restore:request", { limit: 5, windowMs: 10 * 60 * 1000 });
  if (!limited.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  const creator = await db.creator.findUnique({ where: { email: parsed.data.email } });
  if (creator) {
    const raw = await issueRestoreToken(creator.id);
    const link = new URL(`/restore/confirm?token=${raw}`, req.nextUrl.origin).toString();
    await sendRestoreEmail(creator.email!, link);
  }
  return NextResponse.json({ ok: true });
}
```

Check that `zod` is already a dependency (`grep zod package.json`); it is used by `src/lib/quiz-schema.ts`.

- [ ] **Step 5: Implement the confirm route**

```ts
// src/app/restore/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, cookieOptions } from "@/lib/creator";
import { consumeRestoreToken } from "@/lib/restore/token";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("token") ?? "";
  const result = raw ? await consumeRestoreToken(raw) : null;
  if (!result) {
    return new NextResponse(
      `<!doctype html><meta charset="utf-8"><title>Link expired</title>
       <main style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">
       <h1>This link has expired or was already used</h1>
       <p><a href="/restore">Request a new one</a>.</p></main>`,
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }
  const res = NextResponse.redirect(new URL("/create", req.nextUrl.origin), 303);
  res.cookies.set(COOKIE_NAME, result.deviceKey, cookieOptions());
  return res;
}
```

Export `cookieOptions` from `src/lib/creator.ts` (it is currently module-private).

- [ ] **Step 6: Implement the page and form**

```tsx
// src/app/restore/page.tsx
import { SiteHeader } from "@/components/SiteHeader";
import { RestoreForm } from "./RestoreForm";

export default function RestorePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-10">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Restore Pro</h1>
        <p className="mt-2 text-muted">
          Subscribed on another browser or cleared your cookies? Enter the email you used at checkout and we will send a sign-in link.
        </p>
        <RestoreForm />
      </main>
    </>
  );
}
```

```tsx
// src/app/restore/RestoreForm.tsx
"use client";

import { useState } from "react";

export function RestoreForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setState("busy");
    setMessage(null);
    const res = await fetch("/api/restore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      setState("sent");
      return;
    }
    const data = await res.json().catch(() => null);
    setMessage(data?.error ?? `Request failed (status ${res.status}).`);
    setState("error");
  }

  if (state === "sent") {
    return (
      <p role="status" className="mt-8 rounded-xl border border-line bg-white p-4">
        If that email has an active Pro subscription, a sign-in link is on its way. It works for 15 minutes.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-amber"
        />
      </label>
      {message ? (
        <p role="alert" className="text-sm text-red-700">
          {message}
        </p>
      ) : null}
      <button type="submit" disabled={state === "busy"} className="h-12 w-full rounded-xl bg-amber font-semibold text-white disabled:opacity-50">
        {state === "busy" ? "Sending…" : "Send sign-in link"}
      </button>
    </form>
  );
}
```

Add under the cards on `/pricing`: `<p className="mt-6 text-sm text-muted">Already subscribed on another device? <Link href="/restore" className="underline">Restore Pro</Link>.</p>`.

- [ ] **Step 7: `.env.example`** (append)

```bash
# Phase 3b, /restore magic link. RESTORE_EMAIL_FROM must be on a domain
# verified in Resend. MAGIC_LINK_PEPPER is any long random string; rotating
# it invalidates outstanding links.
RESEND_API_KEY=""
RESTORE_EMAIL_FROM="Pub Quiz <noreply@mail.yanshufapps.com>"
MAGIC_LINK_PEPPER=""
```

- [ ] **Step 8: Run everything**

Run: `npm run test && npm run test:integration && npx tsc --noEmit -p . && npx eslint src e2e`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/restore src/app/restore src/app/api/restore src/app/pricing/page.tsx src/lib/creator.ts src/test/restore-routes.integration.test.ts .env.example package.json package-lock.json
git commit -m "Add the Restore Pro magic-link flow"
```

- [ ] **Step 10: Live verification of 3b** — owner verifies the Resend domain and sets the three env values; then on production: subscribe (or use the Task 10 subscriber before refunding), open `/restore` in a fresh profile, receive the email, click, land on `/create` showing "You are on Pro". Record in HANDOFF.

---

## Self-review against the spec

- Data model: Task 1. Status mapping: Task 2. Catalog: Task 9 / 10. Checkout and `/pricing`: Task 7. Post-checkout polling and cap link: Task 8. Webhook contract (400 / 500 / 200, dedupe, out-of-order, unmatched): Tasks 4–5. Manage and cancel via portal: Task 7. Recovery magic link: Tasks 11–12. Configuration and build guard: Task 3. Tests listed in the spec: Tasks 2, 4, 5, 6, 7, 8, 11, 12. Sandbox and live procedures: Tasks 9, 10, 12 Step 10. Owner actions: Tasks 9, 10, 12.
- Deviation from the spec worth knowing: subscription events do not carry the customer email, so email comes from `customer.created` / `customer.updated` (both subscribed). The spec's "subscription events set `email`" wording is therefore implemented as "customer events set `email`". `applySubscriptionEvent` still accepts `email` for the restore flow and for tests.
- Names reused across tasks: `statusToPlan`, `isNewerEvent` (2 → 4), `recordEvent` / `applySubscriptionEvent` / `applyCustomerEvent` (4 → 5), `webhookSecret` / `getPaddle` (3 → 5, 7), `getOrCreateCreatorForPage` (6 → 7), `hasSubscription` (6 → 8), `issueRestoreToken` / `consumeRestoreToken` (11 → 12), `cookieOptions` export (12), `setRestoreEmailSender` (12).
