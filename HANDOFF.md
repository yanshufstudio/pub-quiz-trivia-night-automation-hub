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

- **PR #3** — branch `claude/youthful-knuth-clvns7`, base `master` `d1b613d`.
  CI green, `mergeable_state: clean`.
  https://github.com/yanshufstudio/pub-quiz-trivia-night-automation-hub/pull/3

The working tree is clean and nothing is unpushed.

## What landed in the first 2026-09-13 session

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

## What landed in the second 2026-09-13 session

**Media support, phase 1** — schema, upload/serve routes, validator, owner
auth. Backend only; no UI, no PDF, no export changes. Phases 2-4 are
untouched.

- **`QuestionMedia`** (`prisma/schema.prisma`, migration
  `20260913190000_add_question_media`) — one optional image per question, in
  its own table so a pack read never carries image bytes. As designed, plus
  an `updatedAt` the design didn't call for: replacing an image reuses the
  row, so without it a cached copy could never be told from a fresh one.
- **`src/lib/media.ts`** — the one validator every image passes through,
  whichever door it arrives by. Works on the bytes only: the request's
  `Content-Type` and any filename are ignored. JPEG and PNG, sniffed by
  magic number; SVG explicitly refused; dimensions parsed from the header
  (PNG IHDR, a JPEG marker walk that steps over EXIF blocks) and capped
  before anything could decode them. `toDataUri` is the PDF path's half of
  the invariant.
- **`POST`/`GET`/`DELETE /api/questions/[id]/media`.** Upload and delete are
  owner-gated on `requirePackOwner` — the same `pq_creator` rule as every
  other edit — and rate-limited (40 per 10 min per IP), the limiter ahead of
  everything else so a flood is refused before 2 MB is read. `GET` is open,
  matching every other read by id here: the team's phone and the print sheet
  have no owner cookie and still have to render the image. It serves with
  `nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, and an
  ETag so a 40-image pack reloads as 40 cheap 304s.
- **`hasMedia`** on the question view (`toQuestionView`) and on
  `GET /api/packs/[id]`. The relation is *consumed* there rather than passed
  through, so bytes cannot ride along in a pack payload even if a future
  caller selects them.

### The size cap: 2 MB, and why

The one open question that arguably blocked phase 1. 2 MB per image, 4096px
per side. Nothing re-encodes uploads (that question is still open), so 2 MB
is both the upload and the stored size — a phone photo lands well inside it,
and it is a number that can stay put if `sharp` is added later and the stored
size drops beneath it. The dimension cap is the one that does security work:
a 300-byte PNG can declare 50000x50000, so the header is checked and the file
refused before any decoder sees it.

### The test that matters most, written

`src/test/pdf-media-offline.integration.test.ts`. Renders all three PDFs for
a pack **with media attached** while `fetch` is replaced, and fails if the
render reaches the network.

Two things this turned up that the design did not anticipate:

- **A blanket "fetch was never called" assertion cannot pass.** `yoga-layout`
  loads its WASM through `fetch` on a `data:` URI. The stub therefore serves
  `data:` URIs (no network by definition) and throws on everything else.
- **The test needs a control, or it proves nothing.** PDFs don't render
  images until phase 3, so the route case passes today no matter what the
  stub does. Two controls keep it honest: one renders an image from a `data:`
  URI and pins that the mechanism phase 3 must use really works with the
  installed `@react-pdf/renderer`; the other renders `<Image src="http://...">`
  and asserts the stub *does* see the fetch. If that second one ever stops
  recording a call, every other assertion in the file has quietly become
  worthless.

## Verified, and not

Run against the media phase-1 commit, all green:

| | |
|---|---|
| `npx tsc --noEmit -p .` | clean |
| `npx eslint src e2e scripts` | clean |
| `npm test` | 143 passed (was 117) |
| `npm run test:integration` | 139 passed (was 112) |
| `npm run test:e2e` | 6/6 passed, read from the report |
| CI on `eef4a77` | green |

The e2e run needed the sandbox Chromium workaround from Gotchas below
(`@playwright/test` 1.62.1 wants build 1234; this sandbox has 1194). The
throwaway config was deleted, not committed.

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
- **Previews are building again.** The Vercel bot comment on PR #3
  (`issuecomment-5620965612`, the one it keeps rewriting in place) went
  Building → **Ready** at 18:51 UTC on 2026-09-13, against `d0ced34`. The
  integration did not need reconnecting after all. The branch-alias preview
  is
  `https://pub-quiz-trivia-night-automation-hub-git-claude-7f580a-privlin.vercel.app`.
  Two caveats: the bot comment carries no commit SHA and GitHub commit
  statuses for the head are empty, so "it built the head" is inference from
  the timing, not a fact read off the deployment; and **no session here has
  been able to open it** — the sandbox egress proxy blocks `*.vercel.app`, so
  every verification below is still a human-with-a-browser job.
- **Media support: phase 1 is built, phases 2-4 are not.** See below.
- **Paywall copy** — the free-cap screen still says "Upgrade to Pro for
  unlimited packs, coming soon". Goes away with the Paddle work.
- **`npm audit`** — 3 high findings in the dev-only
  `prisma` → `@prisma/config` → `deepmerge-ts` chain; no fix without a
  `prisma@8` RC.

## Media support — scoped 2026-09-13, phase 1 built the same day

The problem: a question like "Listen to the clip. Which band is playing?"
passes every validation check and reaches the table unanswerable. `1bd7f6e`
asks the model not to write them; nothing stops one getting through.

Everything below is the original scoping, kept because it is still the design
being built to. What has actually been written is in "What landed in the
second 2026-09-13 session" above.

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

**One more end of the same rope, found while building phase 1.** `fetch` is
not the only thing `<Image src>` reaches for. `getAbsoluteLocalPath`
(`index.js:152`) falls through to `path.resolve(src)` for anything without a
URL scheme, and `fetchLocalFile` then `fs.readFile`s it. So a `src` of
`/etc/passwd` — or a `file:` URL — is a **local file read** inside the
function, on the same unauthenticated PDF route, with the bytes returned in
the PDF if they parse as an image. Nothing stores such a string today and
nothing should; it is recorded here because "only URLs are dangerous" is the
wrong mental model to carry into phase 3. The invariant is narrower than "no
URLs": **the only thing ever passed to `<Image src>` is a `data:` URI built
from bytes we hold.**

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

1. ~~Schema + upload/serve routes + validator + owner auth (backend only,
   fully testable)~~ — **done, 2026-09-13.**
2. Editor UI + player/host rendering. The pieces are waiting: questions carry
   `hasMedia`, and `/api/questions/[id]/media` serves the bytes same-origin.
3. PDF and print. Read the bytes in the same query as the pack and pass
   `toDataUri(media)` — never a URL, never a path. The test that fails if you
   don't is already written.
4. Export/import v2. The format-version trap above is still unsprung:
   `PACK_FILE_VERSION` is still `1` and `pack-file.ts` is untouched. Imported
   base64 must go through `validateImageBytes` — the same function the upload
   route calls, not a second copy of it.

### The test that matters most

Written: `src/test/pdf-media-offline.integration.test.ts`. See the notes on
it above — in particular the `yoga-layout` WASM fetch, and why it carries two
control cases.

### Still undecided

1. ~~Size cap~~ — **decided in code: 2 MB, 4096px per side**
   (`MAX_MEDIA_BYTES` / `MAX_MEDIA_DIMENSION` in `src/lib/media.ts`). Change
   the constants if you want different numbers; nothing else reads them.
2. Re-encode with `sharp` (strips EXIF location data from uploaded photos,
   neutralises polyglot files) vs sniff-only (lighter, weaker)? **Still
   open — phase 1 shipped sniff-only.** Worth knowing what that means
   concretely: an uploaded phone photo keeps its EXIF, GPS coordinates
   included, and `GET /api/questions/[id]/media` is open to anyone holding
   the question id. If a pack ever holds someone's personal photos, this is
   the one of the five that matters most.
3. Which PDFs get images — question sheet yes, presenter script probably,
   answer sheet probably not. Blocks phase 3, not before.
4. Media cap per pack, so one pack can't put 40 × 2 MB into Turso. **Not
   implemented.** What bounds it today is the rate limiter (40 uploads per
   10 min per IP) and one-image-per-question uniqueness — a determined owner
   can still fill a pack. Cheap to add once the number is chosen.
5. Does the free tier limit media, or is the per-pack cap enough?

Only the size cap arguably blocked phase 1, and it is now decided. The rest
block phases 2-4 or nothing.

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

New in the second 2026-09-13 session:

- **Anything that asserts "`fetch` was never called" during a react-pdf
  render will fail.** `yoga-layout` loads its WASM through `fetch` on a
  `data:` URI, so the assertion has to be "no *network* fetch" — serve
  `data:` through, throw on everything else. See
  `src/test/pdf-media-offline.integration.test.ts`.
- **`prisma migrate diff` cannot use a shadow database here.** With the
  libSQL adapter in `prisma.config.ts` both `--shadow-database-url` and
  `--from-migrations` fail (`SQLITE_ERROR: no such table`). To generate a
  migration: diff **datamodel to datamodel** (`git show HEAD:prisma/schema.prisma`
  against the working copy, both via `--from-schema-datamodel` /
  `--to-schema-datamodel`), write the SQL by hand into
  `prisma/migrations/<stamp>_<name>/migration.sql`, then apply it to a
  throwaway `DATABASE_URL=file:...` and read `sqlite_master` back.
- **`*.vercel.app` is blocked by the sandbox egress proxy** — both `curl`
  and `WebFetch`. A preview deployment's *existence* can be read off the
  Vercel bot's PR comment; its *behaviour* cannot be checked from here at
  all.

Still new from the first 2026-09-13 session:

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
   (above). Unchanged and still the blocker: a preview now exists, but no
   session here can reach it. Merge is the owner's call and nothing has been
   merged or approved.
2. Media support phase 2 (editor UI, player/host rendering), then 3 (PDF and
   print) and 4 (export/import v2). Open questions 2-5 above; only 3 blocks
   phase 3.
3. Then the plan's step 3: Paddle checkout, webhook, `/pricing`
   (`claude/monetization-buildout-plan.md`). Two questions there have been
   asked twice and never answered: reuse the HebCal Paddle seller account or
   a separate one, and monthly / annual / both at launch.
