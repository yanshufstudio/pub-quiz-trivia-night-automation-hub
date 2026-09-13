# Handoff — 2026-09-13

Live: https://pub-quiz-trivia-night-automation-hu.vercel.app
Repo: https://github.com/yanshufstudio/pub-quiz-trivia-night-automation-hub
(moved from `privlin-lgtm`; Vercel deploys `master` on push)

Supersedes the 2026-09-09 handoff. Anything not repeated here is in git
history — `git show 86069bd:HANDOFF.md` for the previous one, which still has
the full record of the 2026-09-07→09 work.

## Where things stand

`master` is at `d1b613d` and that is what production runs. **PR #3 is open and
unmerged**, and everything below lives on it.

- **PR #3** — branch `claude/youthful-knuth-clvns7`, head `eef4a77`, 11
  commits, base `master` `d1b613d`. CI green, `mergeable_state: clean`.
  https://github.com/yanshufstudio/pub-quiz-trivia-night-automation-hub/pull/3

The working tree is clean and nothing is unpushed.

## What landed this session (2026-09-13)

Three commits on top of the eight PR #3 already had.

- **`d6fc1b6` — free-tier cap is env-driven.** `FREE_LIMIT` in
  `src/lib/creator.ts` now reads `FREE_PACK_LIMIT`, defaulting to 2. Set it
  high on the **Vercel preview environment only**; production stays at 2 by
  leaving it unset. Read once at module load, so a change needs a redeploy.
  Anything that isn't a non-negative integer falls back to 2 — deliberately
  not the literal `Number(process.env.FREE_PACK_LIMIT ?? 2)` that was asked
  for, because `Number("")` is `0` and `Number("two")` is `NaN`, and `NaN`
  loses every `<` comparison in `canGenerate`, so a typo'd env var would have
  silently locked out every free creator instead of raising the cap.
- **`1bd7f6e` — media guard in the generation prompt.** The system prompt in
  `src/lib/generate-pack.ts` now requires every question to be answerable from
  its own text, states there is no audio/image/video/map, and tells the model
  to cover a picture-or-music-round brief *in words* rather than refuse it.
  Nothing downstream enforces this — validation only checks fields are
  non-empty, so "Listen to the clip. Which band is playing?" still validates
  fine. **This narrows the odds; it does not close them.**
- **`eef4a77` — the wizard's default brief no longer asks for a picture
  round.** `src/app/create/page.tsx` used to end on "a picture-round-style
  general knowledge closer", which is the brief every visitor generates from
  unless they retype it. Now a plain general-knowledge closer. Four rounds
  either way.

### Caveat on `eef4a77`

This is the commit the previous session recorded as `872c880`, handed over as
a `.patch` that **did not survive the move to this repo** — no patch file
anywhere on disk, and `git cat-file 872c880` is not a valid object. It was
**reconstructed from its description, not applied.** The wording chosen is
mine. The tree was swept for anything else the original may have touched (no
test or e2e spec asserts the brief text); the two other copies of the old
wording, in this file's predecessor and `docs/portfolio-readiness.md`, were
left alone on purpose as dated records of a past bug. If the real patch turns
up, diff it against `eef4a77`.

## Verified, and not

Run against `eef4a77`, all green:

| | |
|---|---|
| `npx tsc --noEmit -p .` | clean |
| `npx eslint src e2e scripts` | clean |
| `npm test` | 117 passed |
| `npm run test:integration` | 112 passed |
| `npm run test:e2e` | 6/6 passed |
| CI on `eef4a77` | green |

**Nothing in PR #3 has been checked against production or the live model.**
No `ANTHROPIC_API_KEY` has been available in any session that worked on it.
The 502 fix reproduces-then-resolves locally, but the truncation was induced,
not observed from the real model. The media guard is the weakest of the three
in this respect: whether the model actually obeys a prompt instruction is
precisely the thing a test suite cannot tell you.

This bug has been closed twice on a green suite and reopened twice. **Do not
call it fixed without a browser on a real deployment.**

## Open items

- **Production verification of PR #3.** The gate, in order: (1) default brief
  from `/create` in a browser on a deployment, expect 201 in 20-30s and 4
  rounds / ~40 questions; (2) an oversized brief — "eight rounds of fifteen
  questions each" — expect a 201 with a salvaged short pack *or* a 422 that
  says the brief is too big; a bare 502 saying "Please try again" is the
  original bug; (3) read every generated question and count how many need
  media they can't be shown. Generate at least three packs for (3) — one
  clean run is weak evidence for a probabilistic guard.
- **Test the PR #3 *preview*, not production.** Production is `master`, which
  has none of these fixes. Testing production and finding it fine means
  nothing.
- **No Vercel preview has built for `d6fc1b6`, `1bd7f6e` or `eef4a77`.** The
  last preview deployment recorded against this repo is `3bec323` from
  2026-09-10 (`https://pub-quiz-trivia-night-automation-lm5s7afol-privlin.vercel.app`).
  The GitHub→Vercel integration may need reconnecting after the repo moved to
  the `yanshufstudio` org. Check before planning any verification session.
- **Media support is scoped but not started.** See below.
- **Paywall copy** — the free-cap screen still says "Upgrade to Pro for
  unlimited packs, coming soon". Goes away with the Paddle work.
- **`npm audit`** — 3 high findings in the dev-only
  `prisma` → `@prisma/config` → `deepmerge-ts` chain; no fix without a
  `prisma@8` RC.

## Media support — scoped 2026-09-13, no code written

The problem: a question like "Listen to the clip. Which band is playing?"
passes every validation check and reaches the table unanswerable. `1bd7f6e`
asks the model not to write them; nothing stops one getting through.

### The SSRF trap, for whoever builds this

`@react-pdf/renderer` resolves `<Image src>` **server-side during render**,
inside the Vercel function. `node_modules/@react-pdf/image/lib/index.js:188`:

```js
const fetchRemoteFile = async (src) => {
  const response = await fetch(src.uri, { method, headers, body, credentials });
  ...
```

Bare `fetch`. No scheme restriction, no host allowlist, no timeout, no size
limit, `redirect` defaulted to `follow`. Both ends of the chain are already
unauthenticated: `POST /api/packs/import` (rate-limited 20 per 10 min, no
auth) and `GET /api/packs/[id]/pdf` (**no ownership check** — reads by id are
deliberately open so the demo pack, print and PDF work). So storing a remote
image URL on a question would let anyone make the server fetch a URL of their
choosing, and get the bytes back embedded in the returned PDF if they are a
valid image — not blind SSRF. Invalid bytes still give a boolean oracle for
internal port scanning, and the missing timeout burns the 60s `maxDuration`.

`redirect: "follow"` is why a hostname allowlist does not work: an allowlisted
host that 302s to a link-local address sails through.

`data:` URIs are decoded locally (`index.js:152, 235`), no network at all.
That is the escape hatch the design below is built on.

### Decisions taken (by the repo owner, 2026-09-13)

1. **Upload and store the bytes.** Not URL-paste-and-store-the-URL. (Note the
   two converge: the safe version of URL paste is "fetch once at paste time,
   validate, store the bytes" — the storage question is unavoidable either
   way, so paste can be added later as a second ingest button into the same
   pipeline.)
2. **Pack owner only** — gated on the existing `pq_creator` ownership rule in
   `src/lib/pack-access.ts`. Not Pro-gated, not open to anonymous visitors.
3. **Pack file v2 embeds images as base64**, keeping files self-contained and
   keeping the unauthenticated import route free of any network fetch.

### Design

Bytes in a **separate table**, so `GET /api/packs` and the editor don't carry
image data in every payload — pack JSON carries `hasMedia`, nothing more:

```
model QuestionMedia {
  id         String   @id @default(cuid())
  question   Question @relation(fields: [questionId], references: [id], onDelete: Cascade)
  questionId String   @unique
  mime       String   // "image/jpeg" | "image/png"
  bytes      Bytes
  byteSize   Int
  width      Int
  height     Int
  createdAt  DateTime @default(now())
}
```

**The invariant: no surface ever fetches the network to render an image.**

| Surface | Source |
|---|---|
| Player / host / print | `<img src="/api/questions/[id]/media">`, same-origin |
| PDF | bytes read from the DB in the same query, passed as a `data:` URI |
| Export | base64-inlined into the v2 file |

Upload (`POST /api/questions/[id]/media`, owner-gated, rate-limited):
size cap first, then **sniff magic bytes** — never trust `content-type` or the
filename — **JPEG and PNG only, SVG rejected**. `isValidFormat` accepts SVG
but it can reference external resources and is a parser attack surface; a pub
quiz does not need it. Dimension cap.

**Format-version trap:** `src/lib/pack-file.ts` has
`version: z.literal(PACK_FILE_VERSION)` and a comment about refusing
mismatched files. Bumping to 2 naively **refuses every pack file already
exported**. v2 must accept `1 | 2`, reading v1 as "no images". And imported
base64 must go through the *identical* validator as upload — that is the
boundary a hostile pack file walks in through.

### Phasing

1. Schema + upload/serve routes + validator + owner auth (backend only, fully
   testable)
2. Editor UI + player/host rendering
3. PDF and print
4. Export/import v2

### The test that matters most

Render a PDF for a pack with media with `globalThis.fetch` stubbed to throw;
**fail the test if the render touches the network**. That pins the invariant
permanently rather than trusting nobody later swaps a `data:` URI for a URL.

### Still undecided

1. Size cap — suggest 2 MB upload / ~1 MB stored.
2. Re-encode with `sharp` (strips EXIF location data from uploaded photos,
   neutralises polyglot files) vs sniff-only (lighter, weaker)?
3. Which PDFs get images — question sheet yes, presenter script probably,
   answer sheet probably not.
4. Media cap per pack, so one pack can't put 40 × 1 MB into Turso.
5. Does the free tier limit media, or is the per-pack cap enough?

None of these block phase 1 except arguably the size cap.

**`1bd7f6e` stays either way.** The model cannot upload images, so generated
questions must still stand on their own text. Media is a human-editor feature
layered on top, not a replacement for that rule.

## How to verify

```bash
npx next typegen                       # REQUIRED before tsc on a fresh checkout
npx tsc --noEmit -p . && npx eslint src e2e scripts
npm run test                           # unit, 117
npm run test:integration               # 112, throwaway prisma/test.db
npm run test:e2e                       # 6 specs, dev server on 4517
```

Production smoke (no cookie = the stranger's view):

```bash
B=https://pub-quiz-trivia-night-automation-hu.vercel.app
curl -s -o /dev/null -w "%{http_code}\n" $B/
curl -s $B/api/packs                                               # only "Friday Night Demo Pack"
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE $B/api/packs/x  # expect 401
```

A generation costs real Anthropic credit. **429** = the per-IP limiter
(5 per 10 min on `POST /api/packs/generate`, nothing bypasses it).
**403** = the free-tier cap (`FREE_PACK_LIMIT`, default 2, per `pq_creator`
cookie per 30 days). They are different things; don't conflate them.

## Gotchas

New this session:

- **`npx tsc` fails on a fresh checkout** with
  `error TS2304: Cannot find name 'LayoutProps'` in `src/app/layout.tsx`.
  `LayoutProps` is a Next-generated global that doesn't exist until
  `.next/types` is written. Fix: **`npx next typegen`** (generates route types
  without a full build). Costs an hour if you don't know it.
- **Playwright's pinned browser may not match the sandbox.** `@playwright/test`
  here wants Chromium build 1234; a cloud sandbox may only have 1194, and all
  6 specs then fail with `Executable doesn't exist at .../chrome-headless-shell`
  — an environment failure that looks exactly like a broken suite. Run against
  the installed binary with a throwaway config setting
  `launchOptions.executablePath`, and **do not commit it**.
- **`cmd > log 2>&1; echo $?` in a backgrounded shell reports the wrapper's
  exit code, not the command's.** This caused a false "e2e baseline passed"
  in this session when all 6 were failing. Read the log, not the exit code.
- **`e2e/tie-ending.spec.ts` ran in 5.8s** here (whole suite 38-54s). The
  2026-09-09 handoff lists it as exceeding the 30s timeout on every run —
  that was specific to that machine, not the repo. Don't go hunting for it.
- **GitHub App repo scope vs permissions are different things.** Writes 403'd
  from both git (`Claude doesn't have GitHub access...`) and the API
  (`Resource not accessible by integration`) while *reads worked fine*. The
  App's permissions were already Contents/PRs read-write; what was missing was
  this repo being in the installation's **repository access** set. Fixed by
  setting the `yanshufstudio` installation to **All repositories**.
  `list_repos` reporting `can_push: true` is the *user's* access, not the
  App's — it is not evidence the App can write.

Still true from before:

- **`next dev` refuses a second instance** in the same project directory, even
  on a different port. Playwright's e2e server (4517) and a browser-pane
  preview (3000) cannot both run.
- **Playwright reuses any server already on 4517** outside CI, so a stray dev
  server silently tests old code.
- **`ANTHROPIC_API_KEY` is empty locally and cannot be pulled** — every Vercel
  secret here was added `--sensitive`, and `vercel env pull` writes a
  placeholder. Anything needing a real generation runs against a deployment.
- **Local `.env` `DATABASE_URL` resolves against the process cwd.** If `/packs`
  500s with `no such table`, run `npx prisma migrate deploy`.
- **`vercel ls` prints its table to stderr** — use `2>&1`, not `2>/dev/null`.
- **`vercel logs <url>` streams only from the moment it starts** — open it
  before firing the request you want to see fail.
- **Vitest excludes `**/.claude/**`** so worktree spec files don't leak in.

## Next

1. Verify PR #3 on a preview deployment, in a browser, against the live model
   (above). Merge is the owner's call and nothing has been merged or approved.
2. Media support phase 1, once the five open questions are answered.
3. Then the plan's step 3: Paddle checkout, webhook, `/pricing`
   (`claude/monetization-buildout-plan.md`). Two questions there have been
   asked twice and never answered: reuse the HebCal Paddle seller account or
   a separate one, and monthly / annual / both at launch.
