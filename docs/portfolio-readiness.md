# Portfolio readiness — Pub Quiz Automation Hub

**Why this file exists.** This project is the lead (currently only) case study on
yanshufstudio.com, the studio site. It is the one thing a prospective client can
click. This file is the punch list that has to clear before that link is safe to
put in front of strangers. Written 2026-09-07.

Paste this into a fresh Claude Code session in this repo and work top-down.

---

## State as found (2026-09-07)

- `HEAD` = `103dcb9` "Add live demo link to README".
- Live URL responds and renders correctly: https://pub-quiz-trivia-night-automation-hu.vercel.app
  — headline "Pub Quiz Automation Hub", three CTAs (Generate a quiz pack /
  Manage your packs / Join as a team). Not a stub, not a build-failure page.
- **Working tree is dirty.** Modified and uncommitted:
  `src/app/host/[code]/page.tsx`, `src/app/play/page.tsx`,
  `src/components/Scoreboard.tsx`, `src/components/StatusBadge.tsx`,
  `src/lib/team-session.ts`, `package-lock.json`. Untracked: `HANDOFF.md`, `claude/`.
  So the deployed build is **behind** local work, and nobody knows if local work is good.
- **The test suite does not currently run.** `npm run test` dies at startup:
  `Error: Cannot find native binding` → `Cannot find module '@rolldown/binding-wasm32-wasi'`.
  This is the known npm optional-dependency bug, not a code failure — but it means
  nothing in this repo has actually been verified recently.
- `HANDOFF.md` flags that the full suite has not been re-run since the five
  commits that landed from the parallel Cursor session (`c03ee15`, `bc0b775`,
  `571b91d`, `18f4ec8`, `47a46e8` — timer/auto-reveal, multiple-choice,
  acceptable-answers matching, host round editing, and the Turso + Upstash migration).

---

## Task 1 — Get the test suite running again (blocker)

Nothing below can be trusted until this passes.

```bash
rm -rf node_modules package-lock.json
npm install
npm run test
```

Then re-run the full set: unit (`npm run test`), then the Playwright e2e suite.
Report which specs fail rather than fixing silently — the Turso/libSQL swap in
`47a46e8` and the dual-backend rate limiter are the two most likely breakages.

Specifically re-check, per `HANDOFF.md`:
- `src/lib/rate-limit.test.ts` — written against the old in-memory-only limiter;
  may need updating for the Upstash + in-memory fallback logic.
- `prisma.config.ts` — read it fresh; confirm nothing Turso-specific is missing
  beyond what `src/lib/db.ts` does.

## Task 2 — Resolve the uncommitted work

Review the six modified files. For each: finish it and commit, or revert it.
Do not leave the tree dirty — a portfolio project whose committed state differs
from the author's working copy is the thing a reviewing engineer notices first.
Commit in coherent units with real messages, not one "wip" blob.

## Task 3 — Walk the live deployment as a stranger (highest value)

This is the actual gate. On the deployed URL, not localhost:

1. Land on `/` cold, in a private window.
2. Click **Generate a quiz pack**. Confirm it does not error.
   - Most likely failure: `ANTHROPIC_API_KEY` was never set in the Vercel project
     settings. `HANDOFF.md` records that this key had to be entered by the user
     directly in the Vercel dashboard and was still outstanding. Verify it is set.
   - If a real key is not going to be set (cost), make the seeded demo pack the
     primary path instead — see Task 4.
3. Open a pack, edit a question inline, export all three PDF types
   (questions / answers / presenter script). Confirm each downloads and renders.
4. Create a live session. Join from a phone on a different network using the
   short code. Submit an answer, confirm auto-scoring, confirm the reveal and
   scoreboard update on the host screen.
5. Confirm the host key / admin auth actually gates the host view.

Write the result of each step into this file under a "Verified" heading with the date.

## Task 4 — Make the demo survive an empty room

A visitor arriving alone at 11pm currently sees a lobby with no teams, which is
the least impressive possible view of the best feature.

- Ensure a seeded demo pack always exists on the deployed instance
  (`POST /api/packs/seed` / `npm run db:seed` against the Turso DB), so
  "Manage your packs" is never empty.
- Consider a read-only "example session" showing a completed scoreboard.
- Regenerate `docs/screenshots/` with `npm run screenshots` after Task 1 and 2,
  so the images match current UI. These screenshots are going on the studio site
  as proof that works without a second person present.

## Task 5 — Repo presentation

Assume a prospective client's technical friend will open the repo.

- Confirm the repo's public/private state is what you intend. A "live demo" link
  with a 404 repo behind it is fine; a broken link is not.
- README: make sure the live link is above the fold and the screenshots render
  on GitHub.
- Remove or gitignore `claude/` and any scratch files if they are not meant to ship.
- Check `.env.example` does not carry anything real.

---

## Definition of done

- [x] `npm run test` and the Playwright suite both pass on a clean install (see "Closed 2026-09-07 evening"; one known e2e flake)
- [x] Working tree clean, everything pushed
- [x] All five steps of Task 3 walked on the live URL and recorded here
- [x] Demo is non-empty for a lone visitor ("Friday Night Demo Pack" is seeded on the live instance)
- [x] Screenshots regenerated and matching current UI

Only then does the live link go on yanshufstudio.com as the lead case study.

---

# Verified 2026-09-07 — Task 3 walked on the live deployment

Walked against `https://pub-quiz-trivia-night-automation-hu.vercel.app` by an agent
driving a real browser. All test data created during the walk has been deleted; the
deployed instance is back to holding only "Friday Night Demo Pack", with its Q1
`acceptableAnswers` restored to null.

## Corrections to "State as found" above

That section is stale. The six modified source files it lists were committed; `HEAD`
is still `103dcb9`, but the only modification in the working tree is
`package-lock.json`, with `HANDOFF.md`, `PORTFOLIO-READINESS.md` and `claude/`
untracked. **Task 2 is effectively done.** Task 1 (the test suite) remains untouched
and unverified.

## Results

| Step | Result |
|---|---|
| 1. Cold landing on `/` | **Pass.** Real homepage, headline and three CTA cards. Every request 200, no console errors. Renders correctly at 375px. |
| 2. Host auth gate | **Pass.** `POST /api/sessions/<code>/advance` with a wrong `hostToken` returns `401 {"error":"Invalid host key"}`. |
| 3. Generate a quiz pack | **FAIL, intermittently and reproducibly. See below.** |
| 4a. Inline question editing | **Pass.** Editing a field and blurring fires `PATCH /api/questions/<id>` → 200, and the value survives a reload. |
| 4b. PDF export, all three types | **Pass.** `questions`, `answers` and `script` each return 200, `application/pdf`, a real `%PDF-` header (3.2 KB / 3.5 KB / 5.3 KB) and a correct `Content-Disposition` filename. |
| 4c. Print preview page | **Pass.** `/packs/<id>/print` renders the full presenter script with per-question answers and points. |
| 5. Live session end to end | **Pass.** Created a session from the editor, two teams joined by short code, both submitted, host revealed. Auto-scoring is correct and case-insensitive: `"canberra"` scored 1 point against the answer "Canberra"; `"Sydney"` scored 0. Scoreboard reflected both on reveal. Advancing through to `ENDED` works. |

## The generation failure — the one blocker

`POST /api/packs/generate` returns `502 {"error":"Couldn't generate a quiz pack right
now. Please try again."}` for some prompts, every time, while other prompts succeed
every time.

Six attempts:

| Prompt | Attempts | Result |
|---|---|---|
| "...one round on world capitals, one round on 1980s film. Three questions per round." | 2 | 201 both times, 6.1 s and 7.0 s |
| "...one round on rivers, one round on 1990s pop music. Three questions per round." | 4 | 502 all four times, 4.8–5.3 s |

This is **not** a transient upstream error and **not** a missing key:

- `ANTHROPIC_API_KEY` is set. A missing key takes the `MissingApiKeyError` branch in
  `src/app/api/packs/generate/route.ts` and returns 503 with a different message. We
  get 502, which is the generic `catch`.
- It is not a Vercel function timeout — failures return *faster* (~5 s) than successes
  (~6–7 s), and no `maxDuration` is configured anywhere.
- It is deterministic per prompt, so it is content-dependent. Nothing about rate
  limiting, cold starts or Anthropic availability correlates with prompt text.

**Most likely cause**, unconfirmed: the Zod validation at the end of `generateQuizPack`
in `src/lib/generate-pack.ts`:

```
const parsed = generatedPackSchema.safeParse(toolUse.input);
if (!parsed.success) {
  throw new Error(`Generated quiz pack failed validation: ${parsed.error.message}`);
}
```

The prime suspect within that schema is the `MULTIPLE_CHOICE` refine in
`src/lib/quiz-schema.ts`, which requires `isValidOptionSet(options, answer)` — at least
two distinct options, one of which **exactly equals** `answer`. Note that
`isValidOptionSet` trims each option but does not trim `answer`, so `"Nirvana"` against
an answer of `"Nirvana "` fails. A music round is exactly where the model is most likely
to reach for multiple choice, which fits the observed prompt split.

Whatever the specific cause, the failure mode is bad in itself: **one malformed question
discards the entire generated pack**, and the user-facing message is "Please try again",
which is actively misleading for a deterministic failure — retrying cannot help.

### To confirm

Open the Vercel deployment's runtime logs and read the line written by
`console.error("Quiz pack generation failed:", err)` in
`src/app/api/packs/generate/route.ts` for one of the failing requests. That message
names the real cause exactly. Reproduce with the rivers/1990s-pop prompt above.

### Worth fixing regardless of cause

- Do not discard a whole pack for one bad question. Drop or repair the offending
  question and keep the rest.
- Trim `answer` in `isValidOptionSet`, symmetrically with the options.
- Fall back to `TEXT` when a `MULTIPLE_CHOICE` question's option set is invalid — the
  answer is still known, so the question is still usable.
- Do not tell the user "please try again" for an error that will recur identically.

## Second blocker — `ADMIN_TOKEN` is not set on Vercel

`DELETE /api/packs/<id>` with no `x-admin-token` header returned `200 {"ok":true}`.

`isAuthorizedAdmin` in `src/lib/admin-auth.ts` returns `true` when `ADMIN_TOKEN` is
unset — documented as the intended solo-local-dev default, with the comment noting it is
"the operator's job to set this before a shared/public deploy". That has not been done.
Anyone who knows the URL can delete the seeded demo pack, which is the only content on
the instance the studio site points at.

Fix: set `ADMIN_TOKEN` in the Vercel project's environment variables and redeploy.

Two smaller things seen alongside it: the route answers 200 for an id that does not
exist, so deletion is not distinguishable from a no-op; and rate limiting is applied to
`packs:generate` but not to the delete route.

## Note on existing state

The deployed instance still holds an earlier session `RBA4W` with a team named
"Test Team", from a manual test predating this walk. Harmless, but it is real data on a
public demo.

## Still open (as of the morning walk)

- Task 1 (test suite) — untouched. `npm run test` has not been run.
- Screenshots in `docs/screenshots/` — not regenerated.
- Task 5 (repo presentation) — not reviewed.

---

# Closed 2026-09-07 evening

Everything above is resolved. Summary of what was done and verified, in order.

## Test suite (Task 1)

- `npm run test`: 69/69. `npm run test:integration`: 65/65. `tsc --noEmit`, `eslint`,
  `next build` all clean.
- Playwright: `quiz-flow.spec.ts` passes. `tie-ending.spec.ts` timed out roughly one
  run in four: it clicked through all six questions in three browsers, and every step
  waited on a 3-second poll, so a clean run took ~23s against the 30s cap. Fixed after
  this walk by driving the answers and host transitions through the API and keeping
  the browsers only for join and the ENDED screens under test. Now ~5s, 10/10 green
  with `--repeat-each 5`.

## Generation 502 — root cause and fix

Confirmed as predicted: the `MULTIPLE_CHOICE` refine in `quiz-schema.ts`. Fixed in
`101a4c7`:

- `isValidOptionSet` trims `answer` symmetrically with the options.
- `generatedQuestionSchema` transforms a `MULTIPLE_CHOICE` question with an invalid
  option set into `TEXT` (options dropped) instead of rejecting it, so one bad question
  no longer discards the whole pack.

Verified on the live deployment: the rivers + 1990s pop prompt that returned 502 four
out of four times now returns `201` (6 questions: 4 TEXT, 2 MULTIPLE_CHOICE). The test
pack was deleted afterwards.

## Deployment pipeline (found while closing Task 1)

- The Vercel build of `b0c396a` had failed: Vercel restored the build cache, npm 11
  blocked `@prisma/client`'s postinstall script, and the generated client was stale
  (no `Creator`). Fixed in `638cb1e`: `build` runs `prisma generate` first.
- After that deployed, `/packs` and `/api/packs` returned 500 with
  `no such column: main.QuizPack.creatorId` — the `add_creator` migration had never been
  applied to Turso. Fixed in `cdefb6f`: `build` also runs `prisma migrate deploy`, so
  schema and code deploy together from Vercel's own env vars.

## `ADMIN_TOKEN`

Set to a real value in Vercel and redeployed. `DELETE /api/packs/<id>` without a header
now returns `401 {"error":"Invalid admin token"}`; with the wrong header, `401`; with
the right header, `200`.

## Repo presentation (Task 5)

- `HANDOFF.md` deleted (the deployment it described is finished).
- This file moved from the repo root to `docs/portfolio-readiness.md`.
- `claude/` planning documents committed alongside the design doc already tracked there.
- `.env.example` checked: placeholders only.
- Screenshots regenerated with `npm run screenshots`; the create-wizard capture now
  waits for the free-tier usage line so it shows the current UI.

## Live smoke, final

| Probe | Result |
|---|---|
| `GET /` | 200 |
| `GET /api/packs` | 200, "Friday Night Demo Pack" only |
| `GET /packs` | 200 |
| `GET /api/creator/status` | 200 `{"plan":"FREE","packsGeneratedInPeriod":0,"limit":2}` |
| `POST /api/packs/generate` (previously failing prompt) | 201 |
| `DELETE /api/packs/<id>` without token | 401 |

---

# Cross-checked from the studio-site session, 2026-09-08

`Projects/Yanshuf/HANDOFF.md` (the yanshufstudio.com marketing site) still
described this project's card with the live-demo button removed and status
"Shipped", pending the two blockers above. Re-read this file from that session
and confirmed both are closed here: the 502 fix (`101a4c7`) and `ADMIN_TOKEN`
being set are both recorded above under "Closed 2026-09-07 evening".

Live homepage re-checked directly: `https://pub-quiz-trivia-night-automation-hu.vercel.app`
renders the three CTA cards (Generate a quiz pack / Manage your packs / Join
as a team), no errors.

**Action for whoever next touches the studio site:** it's clear to restore the
live-demo button and change the status tag back from "Shipped" to "Live" on
the Pub Quiz card.

---

# Reopened 2026-09-08 — generation 504s on the default brief

Closed prematurely. The 502 fix in `101a4c7` is real and holds, but a **second,
separate failure** was never exercised, and it is the one a visitor hits first.

## What happens

1. Open `/create` on the live deployment.
2. Leave the **pre-filled default brief** as it is — "A Friday-night pub quiz:
   four rounds covering 90s music, UK geography, movie quotes, and a
   picture-round-style general knowledge closer. Keep answers short and
   pub-friendly."
3. Click **Generate pack**.

Result: browser console logs `Failed to load resource: the server responded with
a status of 504`. The page shows:

```
Unexpected token 'A', "An error o"... is not valid JSON
```

Reproduced in a real browser on 2026-09-08. `/api/creator/status` still reports
`{"plan":"FREE","packsGeneratedInPeriod":0,"limit":2}` afterwards, so the request
dies before the pack is recorded and no quota is consumed.

## Why the 2026-09-07 verification missed it

The closing tests used deliberately small prompts — "one round on rivers, one
round on 1990s pop music, **three questions per round**". Those finish inside
Vercel's execution limit and return 201, which is what was recorded as proof.

The wizard's own default brief asks for **four rounds**. That generation takes
long enough to exceed the function's timeout. So the single most likely action a
first-time visitor takes is the one that fails, and every test run so far avoided
it by using a smaller prompt than the UI suggests.

## Two separate defects

**1. The timeout.** `POST /api/packs/generate` exceeds the serverless execution
limit for realistically-sized briefs. Options, roughly in order of effort:

- Set `export const maxDuration = 60` (or higher, per plan) on the route segment.
  Cheapest, and may be sufficient on its own — worth measuring how long a
  four-round generation actually takes before assuming.
- Stream the response so the connection stays alive.
- Move generation to a background job and have the client poll, which is the only
  option that scales past any fixed ceiling.

**2. The client parses every response as JSON.** It calls `JSON.parse` on
whatever comes back, so an HTML gateway-error page surfaces to the user as
`Unexpected token 'A'`. Check `res.ok` and the content type first, and show a
real message. This is worth fixing regardless of the timeout, because it turns
every infrastructure-level failure into gibberish.

## Consequence elsewhere

The live-demo link was restored on yanshufstudio.com this morning on the strength
of this document, then reverted within the hour once tested. The Pub Quiz card is
back to status "Shipped" with no link.

**The link goes back only when generating from the wizard's default brief
succeeds in a browser.** Not on a passing test suite, and not on this document
saying so — that is exactly the mistake that was made once already.

---

# Closed 2026-09-08 afternoon — default brief generates in a browser

Two commits, both verified on production after deploy.

## `9565e01` — the timeout and the JSON-parse crash

`export const maxDuration = 60` on the generate route; the client checks
`content-type` before `res.json()` and shows a status-bearing message
otherwise. Measured on production with the default brief via curl: 201 in
20.8s, 21.2s, 27.8s. Cause confirmed as the platform's 10s default — before
the fix every attempt died at ~11.6s with a `text/plain` 504. A four-round
generation runs 20–28s, so 60s (the ceiling without Fluid compute) has
headroom.

## A third defect, found while verifying — `4e0ee66`

Two of the five verification runs on `9565e01` (one curl, one real browser
click) still failed, now with a JSON 502 and the runtime log line:

```
Generated quiz pack failed validation: path ["title"] expected string, received undefined
```

The model omits the top-level pack `title` roughly two runs in five, on the
default brief and on one-round prompts alike, and `generatedPackSchema`
rejected the whole 40-question pack for it. Same failure class as the
`MULTIPLE_CHOICE` one in `101a4c7`: a cosmetic field sinking the pack. The
schema now accepts a missing or blank title and derives one from the round
titles (`"90s Music · UK Geography …"`). Unit tests cover missing, blank, and
provided titles.

## Verification on `4e0ee66` (deployment `2b1sizfft`, 13:43)

- curl, default brief, four runs: 201 at 27.2s, 20.4s, 24.1s, 23.6s; every
  pack 4 rounds / 40 questions with a model-provided title.
- **Real browser:** opened `/create`, left the default brief, clicked
  **Generate pack**. "Generating…" for ~25s, then redirected to
  `/packs/cmtsk06in002k04k5j8ofr37w` — "Friday Night Lights: The Ultimate
  Pub Quiz", 4 rounds · 40 questions. Network log: `POST /api/packs/generate
  → 201`.
- `npm run test` 85/85, `npm run test:integration` 70/70, `tsc`, `eslint` clean.

The studio-site gate above is met. Restore the live-demo link on
yanshufstudio.com and set the Pub Quiz card back to "Live".

## Closed again 2026-09-08 — verified by hand this time

The 504 is fixed. Confirmed the way the reopening asked for, not from a test
suite and not from a claim:

- Opened `/create` in a real browser.
- Left the pre-filled four-round default brief exactly as it comes.
- Clicked **Generate pack**.
- Result: "Friday Night Lights: Pub Quiz Edition" — 4 rounds, 40 questions, a mix
  of free-text and multiple-choice, landing in the editor in under 20 seconds.
  No timeout, no error.

### The free-tier counter is per-visitor, and that matters

Recorded because it looks like a blocker and is not. After two generations the
browser shows `2/2 free packs used this month` and the form is replaced by:

> Free limit reached — Upgrade to Pro for unlimited packs, coming soon. Use the
> demo pack instead for now.

At the same moment, a cookie-less client hitting `/api/creator/status` returns
`{"plan":"FREE","packsGeneratedInPeriod":0,"limit":2}`. So the cap is scoped to
the visitor, every new arrival gets their own two, and the public demo cannot
exhaust itself. Anyone testing repeatedly from one browser will hit 2/2 and may
mistake it for a global limit — it is not.

One cosmetic note for later: "Upgrade to Pro — coming soon" on the paywall is a
small tell that this is a portfolio piece rather than a running business. Fine
for now; worth revisiting if the product is ever sold.

### Consequence elsewhere

The live-demo link is back on yanshufstudio.com, tag "Live". It came off and went
back on twice in one day, and the rule that survived is in the Yanshuf
`HANDOFF.md`: **restore it only after generating from the wizard's default brief
succeeds in a browser.** A green test suite is not sufficient evidence, because
the suite used smaller prompts than the UI itself suggests.

---

# Production-readiness pass, 2026-09-10 — PR #3

A second full walk of the quizmaster flow, on `d1b613d`. Seven commits on
`claude/youthful-knuth-clvns7`; CI green on `f342325` (every step, e2e
included). **Not verified on production or against the live model** — see
"The verification gap" below, which is the most important part of this
section.

## What was walked

Describe a night → generate → edit → print → run it live → score it.

| Step | Result |
|---|---|
| Wizard, real browser, default four-round brief | **Pass.** 201, redirect to the editor, "4 rounds · 40 questions", no console errors, no failed requests. |
| Print preview, three PDFs, JSON export | **Pass**, all 200, real `%PDF-` payloads. (But see the layout defect below.) |
| Live session, two teams, join by code | **Pass.** |
| Auto-scoring | **Pass.** Case-insensitive match scored, wrong answer scored 0. |
| Host score override | **Pass**, and 401 with a wrong `hostToken`. |
| Multiple choice | **Pass.** Off-list submission 400, valid option 201. |
| Answer after reveal | **Pass**, 409. |
| Per-question timer | **Pass.** Auto-revealed on the next poll; the late answer 409'd. |
| Advance 40 questions to `ENDED` | **Pass**, 76 host actions, correct final scoreboard. |

## The 502 — the fourth and last cause

`101a4c7` (bad multiple-choice option set) and `4e0ee66` (missing pack
title) each fixed a real cause. Both were real; neither was the whole
thing, because the shape of the bug was never addressed: **one `try/catch`
in the generate route flattened every possible failure into the same 502
saying "Please try again"**, so each fix removed one cause from a category
nobody had enumerated.

There were four. Reproduced by pointing the SDK at a local stand-in for the
Messages API and driving each in turn:

| Trigger | Before |
|---|---|
| `stop_reason: max_tokens` — response truncated mid-tool-call | 502 |
| Unusable tool input | 502 |
| Model answers in prose, no tool call | 502 |
| Anthropic API 429/5xx | 502 |

The first is the one that was never diagnosed, and the only deterministic
one. `max_tokens` was 8000. A four-round/40-question pack fits, which is
exactly why the default brief works and why every verification run to date
passed. But the brief is a free-text box: "eight rounds of fifteen
questions" is an ordinary thing to ask a quiz wizard for, and it runs the
model out of budget every single time. Strict validation then threw away
the thirty-nine intact questions along with the half-written one.

"Please try again" was therefore not just unhelpful, it was **wrong** — the
same brief truncates identically on every retry.

Fixed in `4fc4ab4`:

- `max_tokens` 8000 → 16000, well inside the model's ceiling. The real
  limit on pack size is the route's 60s `maxDuration`, not this number.
- `salvageGeneratedPack` (`src/lib/quiz-schema.ts`): when strict parsing
  fails, validate question by question and keep everything that stands on
  its own. The same degrade-don't-reject principle behind `101a4c7` and
  `4e0ee66`, applied to the pack as a whole instead of one field at a time.
  The truncation case now returns 201 with the 33 questions that arrived.
- Failures past salvage are told apart rather than collapsed: **422** brief
  too big (with what to change), **503** model API busy, **502** everything
  else. Dropped content is logged server-side.

## Authorization

The unauthenticated pack delete was already closed by `5eb1eba` / `c0f23d2`.
Verified rather than assumed: all six pack-editing endpoints probed as an
anonymous stranger and as a wrong user holding a valid cookie of their own —
401/403 on all twelve.

Two gaps remained:

- **`d99ac02`** — `isAuthorizedAdmin` returned `true` for *every* request
  when `ADMIN_TOKEN` was unset. The delete route was safe only because it
  remembered to gate on `isAdminTokenConfigured()` first. That is a gate
  which is safe only while its callers are careful, which is not a gate. It
  now fails closed. Added the two missing delete tests: a different creator
  with a valid cookie, and a cookie matching no `Creator` row.
- **`b301d04`** — the two writes that *cannot* be authenticated had no
  ceiling. `POST /api/sessions` created 30 sessions from 30 anonymous
  requests, each consuming one of a finite pool of 5-character join codes.
  `POST /api/sessions/[code]/join` took **60 junk teams into a live quiz
  from a single loop** — and the join code is printed on the table QR, so
  the attacker is anyone in the room. Both rate-limited; joining also has a
  hard 60-team-per-session cap, which is the part that survives an attacker
  rotating IPs past the limiter.

Nothing destructive is reachable without auth.

## Three regressions nobody had flagged

- **`b88d153`** — the app served **no `theme-color` meta tag at all**.
  `be4967e` (the visual redesign) deleted the `viewport` export from
  `layout.tsx` along with `applicationName` and the Apple web-app metadata.
  `e2e/pwa.spec.ts` catches it and has been red on `master` ever since, so
  that commit shipped without the e2e suite being run. The unit test reads
  `manifest.ts`, which was never touched, so nothing else noticed. Restored,
  now reading the colour from the manifest so the two cannot drift again —
  the spec asserts against the manifest too, instead of a literal.
- **`a763086`** — every PDF render of a full-size pack logged `VIEW ...
  bigger than available page height`, four times. Each round was declared
  unbreakable (`wrap={false}`) to keep it on one page; that holds for the
  five-question demo pack and cannot hold for the ten-question rounds the
  default brief produces. Rounds now flow across pages, individual
  questions and answer rows do not split, `minPresenceAhead` keeps a round
  heading off the foot of a page. Page counts unchanged for the question
  sheet and script; demo pack still one page.
- **`d9454f9`** — `npm run db:seed`, which the README offers as the
  no-API-key path, crashed on **every** run since the libSQL adapter
  migration: `prisma/seed.ts` built a bare `PrismaClient`, which now throws
  "Missing configured driver adapter" at startup.

## Test-suite findings

- `src/test/edge-cases.integration.test.ts` asserted the 503-when-no-key
  path by *assuming* `ANTHROPIC_API_KEY` was absent from the ambient
  environment. On a machine that has one set it failed — and spent a real
  API call doing so. Now stubbed per-test.
- **`e2e/tie-ending.spec.ts` did not reproduce the timeout** recorded in the
  2026-09-09 handoff as happening "every run". It passed in 7.1s locally and
  in CI, whole suite 37s. Whatever that was, it was specific to that machine.
- New coverage: `generate-failures` (the four 502 triggers and the salvage
  path), `session-limits` (both ceilings), `pdf-layout` (all three documents
  at the size the default brief generates — no existing PDF test used a pack
  bigger than the demo one). 96 unit, 112 integration, 6 e2e.

## The verification gap — read this before believing the above

Everything was verified against a **local** build. The session had no
`ANTHROPIC_API_KEY`, and its network policy blocked the Vercel hostname, so
generation was driven through a local stand-in for the Messages API. The
failure shapes are real and the code paths are proven; the live model's
actual output was never sampled.

This project's 502 has been declared closed twice on the strength of a
green suite and reopened twice. **A green suite is not evidence here.** The
branch has a Vercel preview deploy with real env vars — verify there:

1. `/create`, default four-round brief, real browser, click Generate.
2. Then the case the fix targets and which has **never** been tested: a
   deliberately oversized brief ("eight rounds of fifteen questions"). A
   full pack, a short pack (look for the `Quiz pack salvaged: dropped N
   question(s)` log line), or a 422 are all correct. A 502 is not.

Free cap is 2 per `pq_creator` cookie and the route is 5 per 10 min per IP,
so use a fresh profile if the form says "Free limit reached".

## Still open, deliberately not fixed

- **The free-tier cap is bypassable by clearing a cookie**, and every
  generation spends real credit. The per-IP limit is the only real ceiling
  and a proxy pool walks past it. Needs accounts — the Paddle work already
  next in the plan.
- **The rate limiter trusts `x-forwarded-for`.** Correct behind Vercel,
  worth nothing without a proxy that sets it. Already noted in the README;
  it is a deployment-topology assumption, not a code bug.
- **No e2e covers generation** — the most failure-prone path in the app,
  and the reason it broke three times in production. It needs a mockable
  seam at the model boundary (`src/lib/anthropic.ts`), which is a design
  change worth making deliberately rather than as a side effect of this pass.
