# Pub Quiz / Trivia Night Automation Hub

Generate a complete pub quiz pack with AI, print presenter scripts and PDF
question/answer sheets, and run the night live with teams submitting answers
from their phones.

**Live demo**: https://pub-quiz-trivia-night-automation-hu.vercel.app

## Screenshots

Real, in-browser captures from `npm run screenshots` (Playwright drives an
actual live session end-to-end — nothing here is mocked or hand-edited).

| | |
|---|---|
| ![Landing page](docs/screenshots/01-landing.png) Landing page | ![Generate wizard](docs/screenshots/02-create-wizard.png) AI generation wizard |
| ![Pack editor](docs/screenshots/03-pack-editor.png) Pack editor | ![Print preview](docs/screenshots/04-print-preview.png) Presenter script / print preview |
| ![Host lobby](docs/screenshots/05-host-lobby.png) Host desk — lobby, with a scannable join link | ![Team join](docs/screenshots/06-team-join.png) Team portal — join screen |
| ![Host: question live](docs/screenshots/07-host-question-live.png) Host desk — question live | ![Team: answering](docs/screenshots/08-team-answer.png) Team portal — answering |
| ![Host: live submission](docs/screenshots/09-host-live-submission.png) Host desk — live submission, auto-scored | ![Host: reveal + scoreboard](docs/screenshots/10-host-reveal-scoreboard.png) Host desk — revealed, scoreboard updated |
| ![Team: reveal](docs/screenshots/11-team-reveal.png) Team portal — reveal, correct + score | |

Regenerate these anytime with `npm run screenshots` (spins up its own
throwaway DB and dev server, so it never touches `prisma/dev.db`).

## Stack

- Next.js (TypeScript, App Router, Tailwind)
- Prisma + SQLite/libSQL (local file for dev, Turso for a real deploy — same
  code either way, see Deployment below)
- Anthropic (Claude) API for quiz generation (structured tool-use output)
- `@react-pdf/renderer` for PDF export
- Vitest for unit tests
- Live team portal via polling (no websockets)
- Installable as a PWA (`src/app/manifest.ts` + the icon set in `public/`);
  no service worker on purpose, since the live session is polling and an
  offline shell would only look alive

## Setup

```bash
npm install
cp .env.example .env   # then fill in ANTHROPIC_API_KEY
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment

The default `.env` setup (a local SQLite file, an in-memory rate limiter) is
right for local dev or a single long-running process, but not for a
serverless host — an ephemeral/read-only filesystem has nowhere to write a
SQLite file, and each invocation can be a fresh cold instance with its own
memory, so neither survives past one request. Both pieces are swappable
purely through environment variables — no code changes:

- **Database**: Prisma connects via a libSQL driver adapter
  (`prisma.config.ts` for the CLI, `src/lib/db.ts` for the app itself), which
  speaks the same protocol against a local file or a real hosted database.
  Create one with [Turso](https://turso.tech) (`turso db create <name>`),
  then set `DATABASE_URL` to its `libsql://...` URL and `DATABASE_AUTH_TOKEN`
  to a token from `turso db tokens create <name>`. Run
  `npx prisma migrate deploy` once against that URL before first traffic.
- **Rate limiting**: set `UPSTASH_REDIS_REST_URL` and
  `UPSTASH_REDIS_REST_TOKEN` (from a free database at
  [Upstash](https://console.upstash.com)) and `src/lib/rate-limit.ts`
  automatically switches from its in-memory fallback to a real shared store,
  so the limit is enforced across every instance instead of resetting per
  cold start.

Leaving either pair of env vars unset keeps today's local-dev behavior
(a `prisma/dev.db` file, an in-process limiter) — both are additive, not a
breaking config change.

- **Function timeout**: a four-round generation takes 20–30s end to end,
  well past the 10s default a serverless host gives a function.
  `src/app/api/packs/generate/route.ts` exports `maxDuration = 60` for that
  reason; if your host caps functions lower than that (or you raise the
  default pack size), the request dies as a gateway 504 before the pack is
  saved. The `/create` page shows that as a plain "server returned status
  504" message rather than a JSON-parse error.

No API key yet? `POST /api/packs/seed` creates a small static demo pack so you
can exercise the editor, PDF export, and live session flow without calling
Claude. There's also a CLI seed script: `npm run db:seed`.

## Core flow

1. **Generate** — `/create` sends a free-text brief to
   `POST /api/packs/generate`, which calls Claude (via a forced tool call, so
   the response is schema-validated JSON) and persists the pack via Prisma.
   Validation degrades rather than rejects where the fix is obvious: a
   multiple-choice question with an unusable option set becomes free-text,
   and a missing pack title is derived from the round titles
   (`src/lib/quiz-schema.ts`) — both were observed in real model output and
   each used to throw away an otherwise good 40-question pack. When strict
   parsing still fails, `salvageGeneratedPack` keeps every question that
   stands on its own and drops only what doesn't, so a response truncated at
   `max_tokens` yields the 33 questions that arrived intact instead of a 502.
   Failures that remain are told apart rather than collapsed into one status:
   **422** when the brief asked for a bigger pack than one generation holds
   (retrying can't help — the message says what to change), **503** when the
   model API is rate-limiting or down, **502** for anything else.
2. **Edit** — `/packs/[id]` lists rounds/questions for inline editing
   (`PATCH /api/questions/[id]`), optionally with an image per question
   (`POST`/`GET`/`DELETE /api/questions/[id]/media` — see Security notes),
   and links to PDF exports
   (`GET /api/packs/[id]/pdf?type=questions|answers|script`). A pack can
   also be exported as a portable JSON file (`GET /api/packs/[id]/export`,
   format `pub-quiz-pack` v1, ids stripped, host-approved alternate answers
   kept) and re-imported from the packs list (`POST /api/packs/import`) —
   on the same deployment or a different one — without spending an AI call.
3. **Host** — `POST /api/sessions` creates a live session with a short join
   code **and a separate, unguessable host key** (returned once, stored in
   the host's browser). The host dashboard polls
   `GET /api/sessions/[code]?as=host&hostToken=...` and drives the state
   machine via `POST /api/sessions/[code]/advance` (`start` → `reveal` →
   `next`), both requiring that key.
4. **Play** — Teams join with `POST /api/sessions/[code]/join` (returns a
   token), then poll `GET /api/sessions/[code]?token=...` and submit answers
   via `POST /api/sessions/[code]/answers`. Answers are auto-scored by
   normalized exact match; the host can override via
   `PATCH /api/sessions/[code]/answers/[answerId]` (also host-key gated).

Session states: `LOBBY → QUESTION_ACTIVE → REVEAL → (next question or ENDED)`.
Every state transition is an atomic conditional update (`updateMany` guarded
by the exact state it read), so two concurrent advance calls — a double-tap,
a retried request on flaky venue wifi — can't both apply; the loser gets a
409 instead of silently skipping a question.

## Security notes

- **Join code vs. host key**: the join code is handed to every team by
  design, so it can't double as proof of host authority. Session creation
  also returns a separate host key, required on every session-control
  endpoint (`advance`, the answer-score override, and the host view) and
  compared with a constant-time check (`src/lib/host-auth.ts`). The host
  dashboard stores it in `localStorage`; if that's lost (different device,
  cleared storage), `/host/[code]` offers a "paste your host key" recovery
  form rather than a hard lockout.
- **Rate limiting**: every unauthenticated write is bounded. `POST
  /api/packs/generate` (spends real Anthropic API credit),
  `POST /api/packs/seed`, `POST /api/packs/import`, `POST /api/sessions`
  (writes a row and consumes one of a finite pool of 5-character join codes)
  and `POST /api/sessions/[code]/join` are throttled per-IP
  (`src/lib/rate-limit.ts`) — backed by Upstash Redis when
  `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are set (see
  Deployment above), or an in-memory, single-instance Map otherwise, which
  is fine for local dev but not a real multi-instance deployment target. It
  keys on `x-forwarded-for`/`x-real-ip`, which a direct caller can set to
  anything — this assumes a trusted reverse proxy in front (e.g. Vercel's
  edge network) that sets those headers itself and doesn't pass through a
  client-supplied value. If this is ever exposed with no such proxy in
  front, the limiter
  offers no real protection; that's a deployment-topology assumption worth
  confirming before going further than this app's current single-operator
  scale.
- **Team cap per session**: the join code is printed on the table QR and
  read out to the room, so joining cannot be authenticated — anyone holding
  the code may join, by design. It is bounded instead: a session accepts at
  most 60 teams (`src/app/api/sessions/[code]/join/route.ts`), well above a
  real venue's 5-25, so one person with the code can't fill a host's
  scoreboard with junk teams mid-quiz. The cap is per session, so it holds
  against a caller rotating IPs past the rate limiter.
- **Pack ownership** (`src/lib/pack-access.ts`): the same httpOnly
  `pq_creator` cookie that scopes the free-tier cap also owns packs. `/packs`
  and `GET /api/packs` list shared packs (no owner — the seeded demo pack)
  plus the visitor's own; every edit route (`POST /api/questions`,
  `PATCH`/`DELETE /api/questions/[id]`, `DELETE /api/rounds/[id]`,
  `POST /api/rounds/[id]/move`) returns 403 unless the cookie matches the
  pack's `creatorId`. Shared packs are read-only for everyone; Export JSON
  then Import gives a visitor their own editable copy. Reads by id stay open
  (unlisted, cuid ids) so sessions, PDF and export keep working for the demo
  path. Losing the cookie loses edit access — the accepted trade-off of
  cookie identity over accounts, see `claude/monetization-buildout-plan.md`.
- **Question images are stored, never linked** (`src/lib/media.ts`): a
  question may carry one image, uploaded by the pack's owner to
  `POST /api/questions/[id]/media` and served back from the same path. The
  bytes are stored in the database and no surface ever renders an image from
  a URL. That is a security property, not a storage preference:
  `@react-pdf/renderer` resolves `<Image src>` server-side during render
  with a bare `fetch` — no scheme restriction, host allowlist, timeout or
  size limit, redirects followed — and `GET /api/packs/[id]/pdf` is
  deliberately unauthenticated, so a question image held as a URL would let
  any visitor make the server fetch an address of their choosing and read
  the result out of the returned PDF. The PDF path is handed `data:` URIs,
  which are decoded in-process. `src/test/pdf-media-offline.integration.test.ts`
  renders with `fetch` stubbed and fails if a render reaches the network.
  Uploads are validated on their bytes, never on the request's
  `Content-Type` or a filename: JPEG and PNG only (SVG is refused — it can
  reference external resources and is a parser attack surface), 2 MB and
  4096x4096 maximum, with the dimensions read from the header so nothing
  ever decodes a decompression bomb. Upload and delete are owner-gated and
  rate-limited; `GET` is open, like every other read by id here.
- **`ADMIN_TOKEN`** (optional, see `.env.example`): an operator override for
  `DELETE /api/packs/[id]`, supplied via an `x-admin-token` header. Without
  it, that route accepts only the pack's own creator cookie. The gate fails
  **closed**: with no `ADMIN_TOKEN` configured there is no operator, so no
  request is treated as one and ownership alone decides
  (`src/lib/admin-auth.ts`). A deployment that forgets to set the variable
  therefore loses the override, not the protection. Nothing in the UI calls
  this route today; it exists to be reachable safely once something does.
- These are proportionate to this app's actual trust model — one host
  running one venue's quiz for a room of teams — not a multi-tenant SaaS
  auth system. See [PROMPTS.md](./PROMPTS.md) history / commit messages for
  the fuller threat-model reasoning.

## Testing

```bash
npm run test              # unit tests (scoring, scoreboard, session state machine)
npm run test:integration  # full session-lifecycle tests against a real (throwaway) SQLite DB
npm run test:e2e          # Playwright: real browser, host + team tabs, full UI flow
npx tsc --noEmit          # typecheck
npm run lint
```

`test:integration` spins up `prisma/test.db` (migrated fresh each run, gitignored)
and drives the actual route handlers — create pack → create session → join →
answer → auto-score → reveal → host override → advance through every question
to `ENDED` — plus edge cases like duplicate team names, answering before the
quiz has started, a second answer after the host has revealed, joining
mid-game vs. joining a session that's already ended, and the wizard's
input-validation and unconfigured-API-key paths (`src/test/edge-cases.integration.test.ts`).

Unit tests also cover input-boundary regressions directly — e.g. a
whitespace-only prompt or team name passing a naive `.min(1)` check
(`quiz-schema.test.ts`) and the rate limiter's window/isolation behavior
(`rate-limit.test.ts`).

`test:e2e` runs against `prisma/e2e.db` (own throwaway DB, migrated fresh
by a Playwright global setup) and a dedicated `next dev` on port 4517 that
Playwright starts itself. It drives two real browser contexts (host + team)
through the actual UI: seed a pack via API, open the pack editor, click
"Start live session", join as a team on `/play`, submit an answer, reveal,
and assert the scoreboard updates on both sides.

### Load test

```bash
npm run build && PORT=4933 npm run start        # production build, in one terminal
npm run load-test -- --teams=20 --base=http://localhost:4933   # in another
```

Simulates N teams joining a fresh session and polling every ~3s (like real
phones) while a host driver advances the quiz to completion, printing
latency stats for polls, answer submissions, and host advance calls. Run
against a **production build** (`next start`, not `next dev`) — dev mode's
Turbopack JIT-compiles each route on first hit, so its numbers swing wildly
with cache state and aren't a meaningful baseline either way.

A 20-team run against a production build, after host-key auth and
per-IP rate limiting landed in the request path, completed in ~26s with
p95 poll latency ~118ms and p95 join latency ~496ms — comfortably fine at
this app's target scale. (An earlier dev-mode run had cited p95 poll
latency around 2s; that number was never a fair baseline and shouldn't be
compared against this one — different mode, different warm/cold cache
state, not a real before/after.)

`409 This question is no longer accepting answers` errors are expected — a
team's submit racing the host's reveal — and the UI already surfaces them
as a normal inline error rather than crashing. The *count* of these errors
scales with how fast the server responds relative to the load-test
script's fixed timing constants (`THINK_TIME_MS`, `REVEAL_PAUSE_MS`): a
faster server finishes the simulated night faster, so a fixed-duration
"think time" eats a bigger share of a shorter game, and more teams get
caught mid-answer at reveal. That's an artifact of the simulator's pacing,
not a real-world degradation — real hosts don't reveal on a clock keyed to
server response time.

## CI

`.github/workflows/ci.yml` runs typecheck, lint, unit tests, integration
tests, and the Playwright E2E test on every push/PR — no secrets required
(nothing in the suite calls the real Claude API).

## Pro subscriptions (Paddle)

A visitor who hits the free cap (`FREE_PACK_LIMIT`, default 2 packs per 30
days) can buy Pro — monthly or annual — on `/pricing`. Paddle Billing is
integrated directly (overlay checkout + one webhook); the app never asks
Paddle at request time. `Creator.plan` is the single gate.

- **Checkout:** `/pricing` opens the Paddle overlay with
  `customData.creatorId`. A first-time visitor gets an identity from
  `POST /api/creator/ensure` before the buttons enable (a server component
  can't set cookies in Next 16, so the page can't do it during render).
  Success returns to `/create?upgraded=1`, which polls
  `/api/creator/status` every 2 s for up to 60 s until `plan === "PRO"`.
- **Webhook:** `POST /api/paddle/webhook`. Signature-verified with the SDK
  (`400` no signature, `500` bad signature so Paddle retries), idempotent
  on `event_id` via the `PaddleEvent` table, refuses out-of-order retries
  by `occurred_at`. Subscription status → plan: `active`, `trialing`,
  `past_due` → `PRO`; anything else → `FREE`. Subscribe the notification
  destination to `subscription.*` and `customer.created`/`customer.updated`
  (the latter carry the email).
- **Manage/cancel:** "Manage subscription" mints a Paddle customer-portal
  session (server action) and redirects there. No custom cancel UI.
- **Env:** `NEXT_PUBLIC_PADDLE_ENV`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`,
  `NEXT_PUBLIC_PADDLE_PRICE_MONTHLY`, `NEXT_PUBLIC_PADDLE_PRICE_ANNUAL`
  (publishable — Vercel type Config; a production build aborts if any is
  empty), plus secrets `PADDLE_API_KEY` and
  `PADDLE_NOTIFICATION_WEBHOOK_SECRET`. Sandbox values on previews, live in
  production; see `.env.example`.
- **Not yet done:** the sandbox catalog, notification destination and a real
  sandbox checkout (plan Task 9), then live cutover (Task 10) and the
  email magic-link restore flow (phase 3b). Until Task 9 passes, `/pricing`
  on a deploy without the env values shows a visible "not configured" alert
  rather than a dead button.

Design: `docs/superpowers/specs/2026-09-09-paddle-pro-design.md`. Plan:
`docs/superpowers/plans/2026-09-09-paddle-pro.md`.

## Known limitations

- SQLite (or Turso/libSQL — see Deployment) is single-writer; fine at this
  app's target scale (tens of teams, one session at a time) but would need
  to move to Postgres for a multi-tenant deployment (low-effort swap via
  Prisma).
- The `hostToken`/`ADMIN_TOKEN` model assumes one operator per deployment,
  not a distributed multi-tenant service — that's unchanged regardless of
  which database/rate-limiter backend is configured.
- `npm audit` reports 3 high-severity findings, all from the same
  dev-time-only chain (`prisma` CLI → `@prisma/config` → `deepmerge-ts`, a
  stack-exhaustion issue). Not reachable by the running app; no fix is
  available yet without moving to an unstable `prisma@8` release candidate.

## Project docs

See [PROMPTS.md](./PROMPTS.md) for the phase-by-phase build playbook,
including which tasks are better suited to Claude Code vs. Cursor.
