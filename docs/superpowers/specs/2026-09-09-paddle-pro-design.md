# Paddle Pro subscription — design

Date: 2026-09-09. Status: approved in chat, awaiting implementation plan.
Build-order step 3 in `claude/monetization-buildout-plan.md`.

## Goal

Let a visitor who has hit the free cap (`FREE_LIMIT`, 2 packs per 30 days)
buy a Pro subscription and generate without limit. Pro is granted and revoked
by Paddle webhooks; the app never asks Paddle whether someone is Pro at
request time.

## Decisions already made

- **Provider: Paddle Billing, integrated directly.** Not RevenueCat wrapping
  Paddle (HebCal's setup) and not Supabase accounts. Reasoning recorded in the
  2026-09-09 chat and summarised here: this app has no native client, so
  RevenueCat is an extra hop with no benefit; identity is a cookie, so
  accounts would reopen step 2; the HebCal postmortem traced its outage to
  the number of soft-failing parts, and this design has two vendor
  touchpoints instead of four.
- **Seller account: reuse the HebCal Paddle seller account.** It is verified
  (business review and Payoneer KYC cleared 2026-09-08) and pays out. A
  separate account would repeat both queues. Consequences: refund and
  chargeback ratio is shared across both apps; checkout branding, approved
  domains and default payment link are account-wide; revenue is separated by
  product, not by account. Paddle does not move subscriptions between seller
  accounts, so a later split would be a dual-run migration.
- **Pricing: monthly and annual.** One product, two prices, USD base, no
  regional overrides, no trial.
- **Recovery after cookie loss: email magic link.** Paddle collects the
  buyer's email at checkout, so the app can offer a "Restore Pro" page
  without introducing passwords or accounts.
- **App reads only its own database.** `Creator.plan` is the single gate.
  Paddle identifiers live on `Creator` and nowhere else in the UI.

## Portability rules

These keep the vendor swappable and are requirements, not suggestions:

1. The webhook handler is idempotent, keyed on Paddle's `event_id`.
2. Vendor ids are stored on `Creator` only.
3. Every plan gate reads `Creator.plan`. No route or component calls Paddle
   to decide access.

## Data model

Additions to `Creator` (all nullable, all set by the webhook or the restore
flow, never by the browser):

| Column                  | Type      | Source                                   |
| ----------------------- | --------- | ---------------------------------------- |
| `email`                 | String    | `customer.email` on subscription events  |
| `paddleCustomerId`      | String    | `customer_id`                            |
| `paddleSubscriptionId`  | String    | subscription `id`                        |
| `subscriptionStatus`    | String    | subscription `status`                    |
| `subscriptionUpdatedAt` | DateTime  | event `occurred_at`                      |

`email` and `paddleSubscriptionId` get unique indexes. `plan` stays a string
(`FREE` | `PRO`) and is derived from `subscriptionStatus`:

| Paddle status                     | `plan` |
| --------------------------------- | ------ |
| `active`, `trialing`, `past_due`  | `PRO`  |
| `canceled`, `paused`, `deleted`   | `FREE` |

`past_due` keeps Pro because Paddle is still dunning; it becomes `canceled`
or `paused` when dunning ends and the webhook downgrades then.

New table `PaddleEvent`:

| Column       | Type     |
| ------------ | -------- |
| `eventId`    | String, primary key |
| `type`       | String   |
| `occurredAt` | DateTime |
| `receivedAt` | DateTime, default now |

New table `RestoreToken` for the magic link:

| Column      | Type     |
| ----------- | -------- |
| `tokenHash` | String, primary key (SHA-256 of the token) |
| `creatorId` | String   |
| `expiresAt` | DateTime |
| `usedAt`    | DateTime, nullable |

One Prisma migration adds all three.

## Catalog

Under the HebCal seller account, in sandbox first and then live:

- Product **Pub Quiz Pro** in sandbox (pre-rename, left as is) and
  **Triviafoundry Pro** in the live catalog — the name shows at checkout.
  Tax category `saas`. If the account rejects
  `saas` ("tax category not approved", as it did for `digital-goods` on
  HebCal), fall back to `standard` and record that in this file.
- Price **Pro monthly USD**: `500` cents, `billing_cycle` month, frequency 1.
- Price **Pro yearly USD**: `2500` cents, `billing_cycle` year, frequency 1.

Created via the `paddle-sandbox` and `paddle-live` MCP servers where they have
write permission, otherwise via a one-off `scripts/seed-paddle-catalog.ts`
using `@paddle/paddle-node-sdk`. Price ids go into environment variables,
never into source.

Sandbox outcome (2026-09-15): `saas` was accepted, no fallback needed.
Product `pro_01m2jk3ybnyqd6q2hpdkw54q02`, prices
`pri_01m2jk5fegkn69k0qc2x50yk89` (monthly) and
`pri_01m2jk677htx11xpytrr1tgc8e` (yearly). Created by hand in the sandbox
dashboard; the MCP path was not available. Two dashboard prerequisites the
overlay needs before it will open, both per-domain: the host on an approved
checkout domain list, and a default payment link set under Checkout
settings. Live equivalents are part of the cutover.

## Checkout

New page `/pricing`:

- Two cards, monthly and annual, each with a button that opens the Paddle
  overlay checkout (`@paddle/paddle-js`, `Paddle.Checkout.open`) for that
  price with `customData: { creatorId }`.
- The page is a server component that resolves the visitor's `Creator`
  through the `pq_creator` cookie. A visitor with no cookie gets one on this
  page (extend `getOrCreateCreator` use to this page; today only the generate
  and import routes create Creators). The page passes `creatorId` and the
  two price ids to a client component.
- If the visitor is already Pro, the page says so and shows "Manage
  subscription" instead of buy buttons.
- Success URL: `/create?upgraded=1`. `/create` polls `/api/creator/status`
  every two seconds for up to sixty seconds until `plan === "PRO"`, then
  drops the query parameter. If still `FREE` after sixty seconds it shows
  "Payment received, activation is taking longer than usual, reload in a
  minute" and stops polling.
- The free-cap message on `/create` ("Upgrade to Pro for unlimited packs —
  coming soon") becomes a link to `/pricing`.

`NEXT_PUBLIC_PADDLE_ENV` selects sandbox or production in Paddle.js.

## Webhook

New route `POST /api/paddle/webhook`:

1. Read the raw body and the `paddle-signature` header. Missing either
   returns 400.
2. `paddle.webhooks.unmarshal(rawBody, secret, signature)` from
   `@paddle/paddle-node-sdk`. A throw returns 500 so Paddle retries; the
   handler does not try to distinguish a forged request from a rotated
   secret.
3. Insert into `PaddleEvent`. A unique-constraint failure means a retry of an
   event already processed: return 200 without further work.
4. Dispatch on `event_type`:
   - `subscription.created`, `subscription.updated`, `subscription.activated`,
     `subscription.canceled`, `subscription.past_due`, `subscription.paused`,
     `subscription.resumed`: find the `Creator` by `custom_data.creatorId`,
     falling back to `paddleSubscriptionId`. If neither matches, log and
     return 200 (an unknown creator is not something a retry fixes). If the
     event's `occurred_at` is older than the stored `subscriptionUpdatedAt`,
     return 200 without writing (out-of-order retry). Otherwise write the
     five columns and the derived `plan` in one update.
   - `customer.updated`: update `email` on the Creator with that
     `paddleCustomerId`, if any.
   - Anything else: 200, no-op.
5. Respond within Paddle's five-second window. The handler does one or two
   database round-trips and nothing else.

Notification destination: one for the sandbox (pointing at a Vercel preview
deployment) and one for production, each with its own secret, created for
this app. HebCal's destinations and keys are not reused.

## Manage and cancel

For a Pro visitor, `/create` and `/pricing` show "Manage subscription". A
server action mints `paddle.customerPortalSessions.create(customerId,
[subscriptionId])` and redirects to `session.urls.general.overview`. Paddle's
portal handles cancel, payment-method change and invoices. Cancellation
reaches the app as `subscription.updated` with a `scheduled_change` (Pro
continues) and then `subscription.canceled` at period end (Pro ends). No
custom cancel UI.

## Recovery: magic link

New page `/restore` with one email field, and route
`POST /api/restore` behind the existing per-IP rate limiter:

1. Look up `Creator` by `email`. Whether or not one exists, respond
   `{"ok":true}` with the same copy: "If that email has an active Pro
   subscription, a sign-in link is on its way."
2. If one exists, generate 32 random bytes, store the SHA-256 in
   `RestoreToken` with a fifteen-minute expiry, and email
   `/restore/confirm?token=<raw>` via Resend.
3. `GET /restore/confirm` looks up the hash; if unexpired and unused, marks
   it used, sets the `pq_creator` cookie to that Creator's `deviceKey`, and
   redirects to `/create`. Otherwise it renders "This link has expired or
   was already used" with a link back to `/restore`.

The visitor's previous cookie identity is orphaned. Its packs stay in the
database under the old Creator and are no longer listed; that is the same
outcome as today's cookie loss, so nothing is lost that was not already lost.

Sending domain: a subdomain of `yanshufapps.com` verified in Resend. This
needs DNS records only the owner can add, so the work ships in two phases:

- **3a**: catalog, checkout, webhook, gating, portal link. Pro lives on the
  cookie only.
- **3b**: `/restore` once the sending domain verifies.

## Configuration

Publishable, Vercel type **Config** (never legacy Secret):

```
NEXT_PUBLIC_PADDLE_ENV=sandbox|production
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=test_... | live_...
NEXT_PUBLIC_PADDLE_PRICE_MONTHLY=pri_...
NEXT_PUBLIC_PADDLE_PRICE_ANNUAL=pri_...
```

Server-only, added with `vercel env add ... --sensitive`:

```
PADDLE_API_KEY=pdl_sdbx_apikey_... | pdl_live_apikey_...
PADDLE_NOTIFICATION_WEBHOOK_SECRET=pdl_ntfset_...
RESEND_API_KEY=re_...            (phase 3b)
MAGIC_LINK_PEPPER=<random>       (phase 3b, mixed into the token hash)
```

`next.config.ts` throws at build time when `NODE_ENV === "production"` and
any `NEXT_PUBLIC_PADDLE_*` value is empty, so a mis-typed Vercel variable
fails the deploy instead of shipping a dead button. `.env.example` documents
every variable. This app has no Content-Security-Policy header today, so
Paddle.js needs no CSP change; adding a CSP is a separate task and, when it
happens, must allow the Paddle hosts under `script-src`, `frame-src` and
`connect-src` with a test per host.

Preview deployments run with sandbox values; production with live values.
Sandbox and live ids never mix.

## Tests

Unit (`vitest`):

- `statusToPlan` mapping for every status above.
- Restore token: hash round-trip, expiry, single use.
- Out-of-order guard: older `occurred_at` does not overwrite.

Integration (`vitest.integration.config.ts`, real SQLite):

- Webhook route with fixtures signed by a test secret using Paddle's
  `ts` + `h1` HMAC scheme: valid `subscription.created` sets PRO and stores
  ids; duplicate `event_id` returns 200 and writes nothing; bad signature
  returns 500 and writes nothing; `subscription.canceled` sets FREE;
  unknown `creatorId` returns 200 and writes nothing.
- `/api/restore` with a known email creates one token; confirm sets the
  cookie and second use fails.
- Generate route: a PRO creator past `FREE_LIMIT` is not blocked (already
  covered by `canGenerate`, keep the test).

End-to-end (Playwright): `/pricing` renders both prices and buttons;
`/create` at the cap shows the link to `/pricing`. No real checkout in e2e.

Sandbox, before any live step: webhook simulator scenarios
`subscription_created` and `subscription_canceled` against a preview
deployment's destination; one real sandbox checkout with card
`4242 4242 4242 4242` from `/pricing` on the preview URL, observing
`plan` flip to PRO in the preview database; cancel through the portal and
observe FREE.

Live, per `~/.claude/CLAUDE.md`: walk `/pricing` on the production domain as
a new visitor with DevTools Console and Network (filter `paddle`) open; buy
monthly with the owner's own card; confirm `plan === "PRO"` by querying the
production database; cancel immediately from the Paddle dashboard (not
"at period end"); confirm `subscription.canceled` arrives and `plan` is
FREE the same day; then refund the transaction in the dashboard so no money
moves. Grep the deployed bundle for the client token prefix and both price
ids. Confirm Vercel shows the four `NEXT_PUBLIC_PADDLE_*` values as type
Config. Only after all of that does the README or handoff say "live".

## Owner actions (cannot be done by the assistant)

- Paddle live dashboard: approve
  `triviafoundry.com` (production since 2026-09-16; the old
  `pub-quiz-trivia-night-automation-hu.vercel.app` host is an alias) under
  Checkout > Website approval. The default payment link is account-wide and
  stays `https://orzarua.app`.
- Grant write permission to the `paddle-live` MCP connector under
  Paddle > Connectors > MCP if catalog creation returns `forbidden`;
  otherwise create the live product and prices in the dashboard and paste
  the `pri_` ids.
- DNS records for the Resend sending domain (phase 3b).
- Enter every secret through `vercel env add --sensitive` or the Vercel UI,
  never in chat.

## Out of scope

Ad slots (step 4). Content-Security-Policy. Trials. Regional prices.
Custom cancel or upgrade UI. Migrating packs between Creators on restore.
Invoices and billing history inside the app.
