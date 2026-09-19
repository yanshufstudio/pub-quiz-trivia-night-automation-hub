# Handoff — 2026-09-13 (sessions appended through 2026-09-19)

Product name: **TriviaFoundry** (since 2026-09-16; was "Pub Quiz Hub" —
pubquizhub.app is a live competitor). Repo slug and package name unchanged.
Live: https://triviafoundry.com (bought at Vercel 2026-09-16 and set as the
production domain; https://pub-quiz-trivia-night-automation-hu.vercel.app
stays as an alias)
Repo: https://github.com/yanshufstudio/pub-quiz-trivia-night-automation-hub
(moved from `privlin-lgtm`; Vercel deploys `master` on push)

Supersedes the 2026-09-09 handoff. Anything not repeated here is in git
history — `git show 86069bd:HANDOFF.md` for the previous one, which still has
the full record of the 2026-09-07→09 work.

## Where things stand

> **State correction, 2026-09-19. Nothing from this session has merged, and
> `master` has not moved.** It is **`2263a4b`** (PR #20, the previous
> handoff) and that is what production runs. The 2026-09-18 note below says
> `3bca366`, which was true when it was written and stopped being true the
> moment it merged — read this one.
>
> Four PRs are open from the 19th, all green on `test` and on the `Vercel`
> commit status, none merged:
>
> - **PR #21** (`claude/function-duration`, head `d5f66c0`) — `maxDuration`
>   300 on generate, PDF and export.
> - **PR #22** (`claude/accounts`, head `3879ecf`) — **host accounts**. This
>   is the big one and it changes who may do what across the whole app. It
>   has had a **second round** (three more commits, 19th, evening): sign-in
>   by emailed six-digit code instead of a magic link, pack reads made
>   owner-only, and the legal pages committed. Read that subsection before
>   reading the first one — it replaces the sign-in mechanism entirely.
> - **PR #24** (`claude/practical-babbage-r02d8b`) — the question-media
>   route. **Its base is `claude/accounts`, not `master`**: it needs
>   `canReadPack`, which does not exist on master. Merge #22 first and
>   GitHub retargets this one.
> - **PR #23** (`claude/handoff-2026-09-19`) — this file.
>
> **Two things wait on the owner and are written into PR #22's body**: the
> environment variables and the Google OAuth client, and the list of what
> PR #4 must change. Do not action either without the owner. The legal
> drafts were the third; the owner approved them on the 19th and they are
> committed, so /privacy and /terms are current again and the README's
> "out of date" note is gone.
>
> **PR #4** (`claude/paddle-pro-3a`) is still open, still the owner's call,
> and now needs work it did not need before — see the 2026-09-19 session
> section.
>
> The corrections below are the record of their own days and are all
> superseded by this one.

> **State correction, 2026-09-18.** `master` is **`3bca366`** and that is what
> production runs. It carries PRs **#17**, **#19** and **#18**, merged in that
> order overnight on the 18th: cross-script scoring, the scoreboard oracle,
> the Answer index, the host desk, the generation bill ceiling and the
> model-decline path. See "What landed in the 2026-09-18 session" below.
>
> **Read Open items before doing anything else.** One thing a merge does not
> settle is still unverified, and it decides whether the Anthropic bill is
> actually capped.
>
> **PR #4** (`claude/paddle-pro-3a`, head `cd9f552`) is still open and still
> the owner's call.
>
> The two corrections below are the record of their own days and are both
> superseded by this one.

> **State correction, 2026-09-15.** The paragraph below is the 2026-09-13
> picture and is kept as the record of that day. Current state: PR #3 merged
> as `5982f76`; `master` is **`80ca6fd`** and that is what production runs;
> **PR #4** (`claude/paddle-pro-3a`, head `d16a99f`, 9 commits, CI green,
> `mergeable_state: clean`) is open and marked **DO NOT MERGE YET** — Task 9
> of `docs/superpowers/plans/2026-09-09-paddle-pro.md` has not been run, so
> nothing about Pro is verified against Paddle itself.
> https://github.com/yanshufstudio/pub-quiz-trivia-night-automation-hub/pull/4

`master` is at `d1b613d` and that is what production runs. **PR #3 is open and
unmerged**, and everything below lives on it.

- **PR #3** — branch `claude/youthful-knuth-clvns7`, base `master` `d1b613d`.
  CI green (as of `0f3dcd3`), `mergeable_state: clean`.
  https://github.com/yanshufstudio/pub-quiz-trivia-night-automation-hub/pull/3

**All five media commits are on `origin` as of the fourth 2026-09-13
session**: `e685124`, `2677222`, `7126412`, `eaa6fa1`, `66b4539` (phases 2-4,
two handoff updates), fast-forwarded onto `0f3dcd3`, pushed by the repo owner
from his own machine from the delivered bundle (`0f3dcd3..66b4539`, verified
by fetching origin afterwards). PR #3 is now 18 commits; Vercel built the
`66b4539` preview and it is what the branch URL serves (read off the
deployments list). See "What landed in the fourth 2026-09-13 session" for
the live verification of phases 2-4 and the one bug it found.

**Pushing from a Claude sandbox session WORKS — re-verified 2026-09-15.**
The repeated 403 recorded here through 2026-09-13 was fixed that same day by
setting the Claude GitHub App's repository access on the `yanshufstudio` org
to **All repositories**; a session pushed four commits directly straight
afterwards, and the 2026-09-15 session re-confirmed access with
`git push --dry-run -u origin <branch>` (exit 0, `* [new branch]`), no bundle
involved.

**Test the push yourself early in a session — a dry-run is enough — rather
than assuming it works or that it doesn't.** The failure it used to give,
kept here so it is recognisable if it ever returns:

```
remote: access denied by the git proxy: yanshufstudio/pub-quiz-trivia-night-automation-hub
is not in this session's authorized repository set, so the proxy will not
inject a credential for it. To fix, add the repository to the session's sources.
```

If that does come back, the repo is missing from the session's authorized
set — add it (`add_repo` with `access: "push"`, where that tool exists)
rather than working around it. **Do not reach for the bundle/patch handover
unless a real push has actually failed**: it is lossy in practice — one
commit's patch (`872c880`) did not survive the handover to this repo and had
to be reconstructed from its description (see the caveat on `eef4a77`
below).

**Unrelated stray branch, ignore it**: `claude/post-verification-pass`
(head `b0b8b9c`) exists locally in this environment from an entirely
different, earlier task, built on the stale `d0ced34` — it does **not**
contain the `0f3dcd3` media phase-1 commit or anything in this handoff. Its
last commit corrects a *false* "verified live against the real model" claim
that an even earlier session was working from with no browser or API access.
That correction does not apply here: the live-model verification recorded in
"What landed in the third 2026-09-13 session" below was done for real, via
the browser bridge, confirmed against Vercel's own deployment list (not
inferred from timing). Don't let that old branch's corrective commit message
cast doubt on this session's verification — they're unrelated events; just
don't touch or build on that branch.

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

## What landed in the third 2026-09-13 session

**Live verification against the real model**, via the built-in browser routed
through the user's own linked computer (the sandbox's egress proxy still
blocks `*.vercel.app` directly — this is what got past it). Confirmed the
preview at `https://pub-quiz-trivia-night-automation-hub-git-claude-7f580a-privlin.vercel.app`
was actually serving `0f3dcd3` (read off Vercel's own deployments list, not
inferred from timing) before generating against it. Default brief, an
oversized 8-round/15-question-per-round brief, and an explicit
picture/music-round brief all generated cleanly with no console errors and no
media-dependent questions reaching the table. The oversized brief in
particular fully succeeded (120 questions, ~35s) where an earlier, unpushed
session's `SAFE_QUESTION_ESTIMATE = 60` constant (on a different, stale
branch) assumed it would fail or need salvaging — that constant is too
conservative and worth revisiting, but no further credit was spent finding
the actual breaking point without asking first. `FREE_PACK_LIMIT` was already
raised on Preview by an earlier session; left as is, production untouched.

**The five "still undecided" items below were put to the repo owner and
answered**, then built as **media phases 2-4**, each shipped as its own
commit on `claude/youthful-knuth-clvns7`:

- `e685124` — **phase 2.** Re-encode with `sharp` (item 2, decided yes):
  `prepareImageForStorage` in `src/lib/media.ts` now sniffs *and* decodes —
  `rotate()` applies EXIF orientation, then re-encoding without
  `withMetadata()` strips EXIF/GPS and neutralises polyglot files. Same
  function for an upload and (phase 4) an imported pack file's base64, so
  neither gets a weaker check. **Per-pack cap** (item 4, decided yes):
  `MAX_MEDIA_PER_PACK = 40`, enforced on a *new* image only — replacing one
  is exempt, so it can't be blocked by the pack's own cap. Item 5 (does the
  free tier separately limit media) was decided **no** — the per-pack cap is
  enough. Also: `hasMedia` now flows through the live session state
  (`session-state.ts`, `api-types.ts`, `sessions/[code]/route.ts`), the pack
  editor got attach/replace/remove, and the host dashboard / team portal
  render a question's image via a same-origin `<img>`.
- `2677222` — **phase 3.** Item 3 (which PDFs get images) was decided **all
  three** (question sheet, answer sheet, presenter script), plus the browser
  print preview. Images render as a fixed `data:` URI box
  (`toDataUri`, never a URL) inside `src/lib/pdf/documents.tsx`, sized so a
  tall or wide photo can't push a question block off the page.
  `pdf-media-offline.integration.test.ts` — written in phase 1 before any of
  this existed, passing vacuously — now exercises the real render and still
  passes with zero network calls.
- `7126412` — **phase 4.** `PACK_FILE_VERSION` is 2; the schema reads `1 | 2`
  so every already-exported file still imports. A v2 file's optional
  per-question `image` (base64) goes through the identical
  `prepareImageForStorage` as a direct upload on `POST /api/packs/import` —
  that route is unauthenticated, so an embedded image is exactly as hostile
  as an upload body. An image that fails validation is dropped, not a reason
  to fail the whole import ("degrade, don't reject", matching
  `degradeInvalidMultipleChoice`'s existing choice for a bad option set).

**Full suite green before every commit**: `next typegen` → `tsc` → `eslint`
(0 errors; one pre-existing `jsx-a11y/alt-text` warning on `@react-pdf`'s
`Image`, not an HTML `<img>`) → 153 unit tests → 145 integration tests → 6/6
Playwright e2e (needed a **local-only**, never-committed config override to
point at this sandbox's installed `chromium` binary instead of the
`chromium_headless_shell` build the pinned `@playwright/test` version
expects and that isn't installed here — a known sandbox/browser-build
mismatch, not a suite problem; deleted before finishing).

**Push access re-checked four times total this session, still 403 every
time** — see "Where things stand" at the top for the full detail (exact
error text, why it reads as a proxy-level block rather than a GitHub
App-permissions one, the scratch-ref attempt, and the unrelated stale branch
whose corrective commit does not apply to this session's verification). The
four phase/handoff commits are local-only; a git bundle and a
`git format-patch` series covering them (based on `0f3dcd3`, PR #3's current
head) were handed to the user directly as the delivery mechanism, confirmed
delivered.

## What landed in the fourth 2026-09-13 session

One fix, found by driving media phases 2-4 on the `66b4539` preview for real
(built-in browser via the owner's linked computer, same route as the earlier
live-model check).

- **The print preview never showed images.** `src/app/packs/[id]/print/page.tsx`
  loaded questions without `include: { media: { select: { id: true } } }`,
  so `toQuestionView` — which turns the relation into the `hasMedia` flag
  and, as its own doc comment warns, reports `false` when the relation isn't
  included — hid every image from `PrintPreview`. The three PDFs load their
  own rows through `session-state.ts` and were unaffected, which is why a
  green suite didn't catch it: nothing exercises the print *page's* query.
  Fixed with the one-line include. `tsc` and `eslint` clean.

**Live verification of phases 2-4, on the `66b4539` preview** (pack
"Landmarks of the World · Classic Rock", question 1; the upload was sent as
raw bytes to `POST /api/questions/[id]/media` from the page via `fetch`,
same-origin with the creator cookie — the native file chooser can't be driven
from the browser bridge, so the `<input type=file>` wrapper itself is the one
thing here not exercised by hand):

| | |
|---|---|
| Upload 600x400 canvas PNG (11,015 B) | 201; stored as 4,015 B PNG 600x400 — sharp re-encode confirmed |
| Editor after reload | thumbnail renders, "Replace image" + "Remove" appear, other 15 say "No image attached", no console errors |
| Host dashboard, Q1 live | image renders under the question, no console errors |
| Team portal, Q1 live | image renders, no console errors |
| `pdf?type=script` / `questions` / `answers` | 200 each, each carries `/Subtype /Image` XObjects |
| Print preview (before the fix) | **no image** — the bug above |
| Replace with 800x300 JPEG (9,549 B) | 201, same media row id, GET returns 5,990 B `image/jpeg` |
| Export | v2 file, `image: { mime, data }` on the one question |
| Import of that file | 201, new pack has 16 questions, 1 with media, GET returns the JPEG |
| Import with JPEG magic bytes corrupted | 201, image dropped, pack kept — the documented "degrade, don't reject" |
| DELETE media | 200; GET → 404 "No image for this question"; second DELETE → 404 |
| Editor after delete | back to 16 x "No image attached" |

Both imported test packs were deleted afterwards; the test image was removed;
session `6BPF4` was left in its natural state. **The print-preview fix itself
has not been seen on a preview** — it was written after the run above and
needs a push (from the owner's machine, see "Where things stand") and a
reload of `/packs/<id>/print` with an image attached to confirm.

## What landed in the 2026-09-15 session

No production or Paddle access from this sandbox (see "Blocked by egress"
below), so the one verification that could be done for real was done for
real, and the rest is reported as not done rather than substituted.

### EXIF/GPS strip — VERIFIED, locally, end to end

The open worry was that `src/lib/media.ts` *reads* correct (omits
`withMetadata()`, calls `.rotate()` first) but had never met a real file.
It has now. Run against a local `next dev` on the sqlite dev database, over
the real HTTP routes, with `exiftool` 12.76.

The test file: a 600x400 JPEG carrying a full phone-style metadata set
written with `exiftool` — `GPSLatitude`/`GPSLongitude` (51°30'2.52"N,
0°7'28.56"W, plus altitude, speed, image direction, GPS date/time stamps),
`Make=Apple`, `Model=iPhone 14 Pro`, `LensModel`, `Software`,
`BodySerialNumber`, `OwnerName`, `DateTimeOriginal`, an embedded 160x120
IFD1 thumbnail, and `Orientation=6` (Rotate 90 CW). **It is not literally a
photo off a phone** — none was available in this sandbox — but every EXIF
structure a phone photo would carry is present and readable, which is what
the stripping code has to deal with. If a genuine phone photo is ever put
through this, nothing here predicts a different result, but say so honestly.

| | |
|---|---|
| `POST /api/questions/[id]/media` (raw bytes, owner cookie) | 201, stored 5,327 B, **400x600** |
| `GET /api/questions/[id]/media` (no cookie — the open route) | 200, 5,327 B, `image/jpeg` |
| `exiftool -G1 -a -s` on the served bytes | **no `[IFD0]`, no `[ExifIFD]`, no `[GPS]`, no `[IFD1]`** — only `[File]`/`[Composite]` structural fields derived from the JPEG itself |
| GPS / Make / Model / serial / owner / thumbnail | all gone |
| JPEG segments in the served file | `DQT DQT SOF2 DHT DHT SOS` — **no APP1 at all**, so there is nowhere for EXIF to live |
| Byte scan for `Exif`/`Apple`/`iPhone`/`GPS`/owner name/serial/`http` | 0 occurrences of each |
| Orientation | 600x400 source + `Orientation=6` → served **400x600**, and the four quadrant colours land in exactly the 90° CW positions (green TL, red TR, yellow BL, blue BR) — `.rotate()` really is applied, not just a dimension swap |

The other two doors into the same function were checked too:

- **PNG.** A 500x300 PNG given `GPSLatitude`/`GPSLongitude`, `Make=Google`,
  `Model=Pixel 8 Pro`, `Artist`, `Comment`, `Description`. Served back with
  chunks `IHDR pHYs IDAT IEND` only — no `eXIf`, no `tEXt`, no `iTXt`; every
  tag gone.
- **Pack import.** A v2 pack file with the same GPS JPEG embedded as base64
  through `POST /api/packs/import` (unauthenticated) produced a **byte-identical
  5,327 B** stripped 400x600 result, confirming import and upload really do
  share `prepareImageForStorage` rather than having drifted apart.

So the live privacy concern on that open `GET` route is closed for JPEG and
PNG, on this code, at commit `80ca6fd`. **It was verified locally, not on
production** — production runs the same `src/lib/media.ts`, but nobody has
put a file through the deployed instance.

### Blocked by egress, not attempted

This sandbox's egress policy refuses `CONNECT` with a 403 for
`*.vercel.app`, `sandbox-api.paddle.com` and `sandbox-vendors.paddle.com`
(confirmed at `$HTTPS_PROXY/__agentproxy/status`, which logs each denial,
and independently through `WebFetch`, which returns `EGRESS_BLOCKED`). There
is also **no `paddle-sandbox` MCP server** in the session, no Vercel CLI, no
`PADDLE_*` env, and no `ANTHROPIC_API_KEY`. Consequently:

- **Paddle Task 9 — not started.** Sandbox catalog, client token,
  notification destination, simulator run and the real sandbox checkout all
  need the Paddle API/dashboard and a browser on a preview URL. Nothing was
  mocked or half-done. **PR #4 remains DO NOT MERGE YET for exactly the
  reason it already said.**
- **Generation against the real model — not done.** Needs
  `https://pub-quiz-trivia-night-automation-hu.vercel.app`; no key locally
  either, so there was no second route to the real model. The default-brief
  / oversized-brief / count-the-media-questions gate is still open, and is
  still the thing that has been closed on a green suite and reopened twice.

### Housekeeping note

`git config --unset gc.auto && git gc` is still worth running **on the
owner's machine** once the repo is out of OneDrive. It was not run here:
`gc.auto` lives in `.git/config`, which is per-clone, and this sandbox clone
is ephemeral and was never in OneDrive — unsetting it here would have
changed nothing on the machine that has the problem.

## Verified, and not

*This section is the 2026-09-13 record and its numbers are of that date. The
current gate counts are in the 2026-09-18 session section.*

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

The same pattern caught the model-decline path on 2026-09-18: two versions of
it passed a green suite while being wrong, because the tests mocked the very
function whose behaviour was in question. One real brief against the live
model settled it in a minute. The lesson generalises — where the question is
"what will the model do", a stub cannot answer it.

## Open items

*Entries added 2026-09-19 come first. Everything below them was re-checked
on the 18th and still holds — `master` has not moved since, because nothing
from the 19th merged.*

- **The owner has two decisions waiting, both written into PR #22's body.**
  Nothing should be actioned without them. (1) The environment variables and
  the Google OAuth client — `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  `GOOGLE_CLIENT_ID`/`_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, each
  documented in `.env.example` with its reasoning. (2) The list of what PR #4
  must change. *(The legal drafts were the third and are now approved and
  committed — /privacy and /terms are current.)*

- **`SIGN_IN_LINK_CAPTURE` was renamed to `SIGN_IN_EMAIL_CAPTURE`** in the
  second round, along with `/api/test/sign-in-links` → `/api/test/sign-in-emails`.
  Both are test-only and the suites set them for themselves, so there is
  nothing to change on Vercel — but if the old name was ever set anywhere,
  unset it, because the new gate does not read it.

- **`GET /api/questions/[id]/media` is the only open read left, and it is
  open by design rather than by omission.** Anyone holding a question id can
  fetch its image. Narrowing it means scoping the read to a live session and
  its team token, which changes what a team's browser sends — a team-facing
  change, so it needs the owner. Until then: nothing private should be
  uploaded as a question image.

- **PR #4 cannot ship as written once accounts land, and the reason is a
  security one.** `customData.creatorId` comes from `POST /api/creator/ensure`,
  which mints a `Creator` for whatever cookie the browser sent. A cookie is
  attacker-controlled, so that is a checkout that can be pointed at someone
  else's creator. It must come from the session. `ensure` then has no reason
  to exist, and `RestoreToken`//restore/phase 3b become unnecessary —
  restoring Pro on a new device is now "sign in". Full file-by-file list in
  PR #22's body.

- **Google sign-in cannot work on preview deployments, by design.** A redirect
  URI must be registered in Google Cloud ahead of time and `*.vercel.app`
  changes on every push. Previews use the email link. Both `.env.example` and
  `src/lib/auth.ts` say so at the point of use — this is not a bug to fix.

- **Nothing sweeps an expired sign-in link nobody followed, or an expired
  `authSession` row.** A link is deleted atomically when it *is* followed
  (`consumeVerificationValue` deletes before it checks expiry, so even a stale
  link cleans itself up). Both stop working on time; neither is removed. This
  is why the drafted retention clause promises only that they stop working. A
  real "and then it is deleted" promise needs a cleanup job first, and the
  policy must not get ahead of the code.

- **`/api/test/sign-in-links` is distinguishable from a path that does not
  exist.** It answers `404 {"error":"Not found"}` where a missing path answers
  Next's HTML 404. It leaks no links and names nothing, but it confirms the
  path resolves to something. Three fixes were tried and measured, all worse —
  see the 2026-09-19 session section before attempting a fourth.

- **The header's tap targets are 36px.** "Sign in" and "Sign out" are 68x36
  and 69x36, under the 44px iOS / 48px Material minimum. They match the four
  existing nav links exactly, so this is the header's house style rather than
  something accounts regressed — but it now applies to the two controls a host
  taps most on a phone. Changing it means restyling the existing links too,
  which is why it was left alone.

*The entries below were re-checked 2026-09-18 against `master` `3bca366`. The entries added that day
are first; the older ones below them still hold except where struck through.
The 2026-09-15 note that used to open this section said it was trued up
against `master` `80ca6fd` and PR #4 `d16a99f` — both SHAs have moved since.*

- **Is Upstash configured on production? Nobody has checked, and it decides
  whether the bill is capped.** `src/lib/daily-ceiling.ts` uses Upstash when
  `UPSTASH_REDIS_REST_URL`/`_TOKEN` are set and an in-process `Map` otherwise
  — the same arrangement as `rate-limit.ts`, but the consequence is worse
  here. Without Upstash each serverless instance keeps its own counter, so a
  ceiling of 20 a day is really 20 a day *per instance* and bounds the
  Anthropic bill by an unknown multiple. Everything else about the ceiling was
  tested; this was not, because a sandbox cannot see the Vercel dashboard.
  **Check this before believing the bill is capped.**

- **The two ceilings add up, and the arithmetic is worth a second look.**
  Free and Pro are independent buckets, so worst-case daily exposure is
  `20 + 50` generations. At roughly $0.18 for a pack that runs to the full 16k
  `max_tokens` that is about **$12.60 a day, ~$380 a month**. The owner set
  these against a stated $50 API budget; if that figure is monthly rather than
  daily, the ceilings do not enforce it — that would need roughly 9 a day
  across both buckets. Raised at the time and the numbers were confirmed
  anyway, so this is a note, not a blocker.

- **`GET /api/packs` and `GET /api/packs/[id]` return full answer text for
  ownerless packs (e.g. the demo pack), unauthenticated.** Found during the
  PR #17 work and **deliberately deferred until after launch** on the owner's
  instruction. It is a real exposure — anyone with the URL can read a shared
  pack's answers — but it predates this session and is not what the pre-launch
  fixes were for.

- **`rate-limit.ts` and `daily-ceiling.ts` duplicate the Upstash-or-memory
  counter.** The client construction, the `Map`, and the INCR/EXPIRE
  fixed-window body are the same in both, so two Redis clients are built per
  process against one instance and every fix to the shared mechanism has to be
  made twice. It was deferred while PRs #17 and #18 were both open, because
  #17 also modified `rate-limit.ts` and the refactor would have manufactured a
  conflict. **Both have merged, so this is now available to do.**

- **The host payload's pre-reveal exposure is closed; the host's own
  `currentAnswer` after the reveal is unchanged.** Noted so nobody re-opens
  PR #19's decision: withholding it *before* REVEAL was the fix, and the host
  needs all of it *from* REVEAL to adjudicate.

- **~~Paddle Task 9~~ — passed 2026-09-15**, by the owner, off-sandbox. The
  entry below was written before that and is superseded; PR #4 is no longer
  blocked on it. What remains for Pro is **Task 10, the live cutover**
  (`docs/superpowers/plans/2026-09-09-paddle-pro.md`), whose gate is Paddle's
  Website approval for the production domain — and *that* prerequisite, the
  public terms/privacy/refund pages, landed with PR #6. Note PR #4's own
  build guard: a production build **fails** if any `NEXT_PUBLIC_PADDLE_*`
  value is empty, so set the live values before merging it, or merge only
  once they exist. The Paddle dashboard and a browser on a deployment are
  still needed for Task 10, and a Claude sandbox has neither (egress 403s
  `*.vercel.app` and `*.paddle.com`, and there is no `paddle-sandbox` MCP
  server), so it stays a human-with-a-browser job.

- **Generation fixes have never been checked against the real model, and
  they are now live in production.** This is the bug that has been closed
  twice on a green suite and reopened twice. The gate, against
  `https://triviafoundry.com` (production *is*
  the thing to test now — `master` carries the fixes):
  1. Default brief from `/create` — expect 201, ~20-30s, 4 rounds / ~40
     questions.
  2. An oversized brief ("Eight rounds of fifteen questions each, covering
     history, science, music, film, sport, food, literature and geography")
     — a 201 with a short salvaged pack **or** a 422 saying the brief is too
     big are both correct; a bare 502 "Please try again" is the original bug.
  3. Read every question across **3+ packs** and count any needing media the
     app cannot show. Report the number even if zero — one clean run is weak
     evidence for a probabilistic guard.

  Operational cautions: **do not set `FREE_PACK_LIMIT` on production** — it
  is deliberately unset so the cap stays at 2. Use a fresh incognito profile
  per 2 generations. A **403** is the free cap; a **429** is the per-IP
  limiter (5 per 10 min) — different things. Every generation spends real
  credit, and any pack or session created is real data: note the ids and
  clean up with `DELETE /api/packs/[id]` + `x-admin-token`.

- **EXIF/GPS strip: verified locally 2026-09-15, not on production.** The
  full result is in "What landed in the 2026-09-15 session" — no EXIF
  survives, no APP1 segment, rotation correctly applied, for JPEG, PNG and
  the import path. What remains open is only that nobody has put a file
  through the *deployed* instance, and that the test file was a JPEG with a
  phone-style EXIF set written by `exiftool` rather than a photo off an
  actual phone.

- **The print-preview fix (`7850f8d`) has never been seen rendering.** It is
  in `master` and therefore in production. It was written after the
  2026-09-13 live run that found the bug, so confirming it needs a reload of
  `/packs/<id>/print` for a pack with an image attached. Nothing in the
  suite exercises the print *page's* query, which is why a green suite
  missed the bug in the first place.

- **Paywall copy** — `src/app/create/page.tsx:133` still reads "Upgrade to
  Pro for unlimited packs — coming soon. Use the demo pack instead for now."
  on `master`, so that is what production shows. PR #4 replaces it with a
  link to `/pricing`, so this clears when PR #4 merges — which is gated on
  Task 9 above.

- **Paddle Task 10 — two corrections to Step 1, drafted 2026-09-15, not yet
  applied to the plan.** (1) The *default payment link* is account-wide and
  currently `https://orzarua.app` — the Paddle seller account is shared with
  Or Zarua — so **leave it alone** and only add our host under Website
  approval. (2) Checkout *branding* is likewise account-wide, currently
  "OrZarua", and cannot be renamed without affecting Or Zarua. Buyers will
  see "OrZarua" at checkout; decide whether that is acceptable, and note it
  may not match what `/terms` says about who is selling.

- **`/privacy` needs revising before PR #4 merges.** The page (from PR #6)
  already names Paddle and the email address received when a subscription
  starts, but it says nothing about the Paddle customer and subscription
  ids, the stored `subscriptionStatus`, or the `PaddleEvent` webhook table
  that PR #4 adds to the schema. Merging PR #4 without that edit makes the
  live privacy policy inaccurate. Draft exists off-repo; not committed.

- **One sandbox-origin creator row sits in the production Turso DB**:
  `cmu2qdlry000004kwpuii81g5`, carrying real *sandbox* Paddle identifiers
  (`sub_01m2kac7e3nxnmnz959dypqrbd`, `txn_01m2kaa12cck2hn8brerkjst8k`) from
  the 2026-09-15 refund/cancel walk. It reads FREE, so it is functionally
  inert, but production data and sandbox billing ids are now mixed in one
  table. Decide (delete, or leave and document) before the live cutover.

- **`npm audit`** — still 3 high, all one dev-only chain:
  `prisma@6.19.3` → `@prisma/config@6.19.3` → `deepmerge-ts@7.1.5`
  (GHSA-ggr8-5vv4-36mx, fixed in `deepmerge-ts@8`). The only fix npm offers
  is `--force` down to `prisma@6.12.0`, which it flags as breaking, so this
  stays open rather than being worth taking.

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
2. ~~Editor UI + player/host rendering~~ — **done, 2026-09-13** (`e685124`).
3. ~~PDF and print~~ — **done, 2026-09-13** (`2677222`).
4. ~~Export/import v2~~ — **done, 2026-09-13** (`7126412`). `PACK_FILE_VERSION`
   is 2, the schema still reads 1, and imported base64 goes through
   `prepareImageForStorage` — the same function the upload route calls.

All four phases are built. See "What landed in the third 2026-09-13 session"
above for the detail; the local commits are not yet on `origin` (still the
session's authorized-repo-set 403 — a bundle/patch series was handed to the
user directly).

### The test that matters most

Written: `src/test/pdf-media-offline.integration.test.ts`. See the notes on
it above — in particular the `yoga-layout` WASM fetch, and why it carries two
control cases.

### Formerly undecided — all five resolved 2026-09-13

1. ~~Size cap~~ — **decided in code: 2 MB, 4096px per side**
   (`MAX_MEDIA_BYTES` / `MAX_MEDIA_DIMENSION` in `src/lib/media.ts`). Change
   the constants if you want different numbers; nothing else reads them.
2. ~~Re-encode with `sharp` vs sniff-only?~~ — **decided: re-encode.** Built in
   phase 2 (`prepareImageForStorage`). An uploaded phone photo's EXIF/GPS is
   now stripped before storage; a polyglot doesn't survive the decode/encode
   round trip either.
3. ~~Which PDFs get images?~~ — **decided: all three** (question sheet, answer
   sheet, presenter script), plus the print preview. Built in phase 3.
4. ~~Per-pack media cap?~~ — **decided: yes, 40** (`MAX_MEDIA_PER_PACK` in
   `src/lib/media.ts`). Built in phase 2, enforced on upload and on import.
5. ~~Does the free tier separately limit media?~~ — **decided: no**, the
   per-pack cap is enough.

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

New in the 2026-09-19 session, second round:

- **A GET that signs you in is a GET a scanner signs itself in with.**
  Corporate mail filters fetch every link in incoming mail before the person
  clicks, so any emailed link that consumes on GET is consumed by the filter
  first. The emailed link must open a page that does nothing; only a button's
  POST may spend anything. This is why `magicLink` was replaced by
  `emailOTP` — the plugin was not at fault, the GET-consumes shape was.
- **`page.getByRole("alert")` is ambiguous on every Next App Router page, and
  only *sometimes* fails.** Next hydrates `<div
  id="__next-route-announcer__" role="alert">` about 200ms after the HTML, so
  a bare alert locator resolves to one element inside that window and two
  after it, and Playwright's strict mode rejects two. An assertion that polls
  inside the window passes on a quiet machine and fails on a busy one. Scope
  it: `page.getByRole("main").getByRole("alert")`, or the `pageAlert()`
  helper in `e2e/sign-in-helper.ts`.
- **Playwright applies a test's `use` options to a direct
  `browser.newContext()` too** (`runBeforeCreateBrowserContext`). So a
  file-level `test.use({ extraHTTPHeaders })` silently reaches every context
  in the file — which is the opposite of the assumption that makes people
  think a manually-created context is unattributed. Corollary: a file-level
  `test.use` that calls a counter function evaluates it **once at module
  load**, so every test in that file shares the one value.
- **Better Auth's `getIP` falls back to a single `127.0.0.1` in dev and
  test** when no `x-forwarded-for` arrives, and its limiter keys on
  `ip|path`. So any test context without an address shares a bucket with
  every other such context in the run, across spec files. Give each one its
  own valid IPv4 — a malformed one is silently dropped and lands back in the
  shared bucket.
- **Two functions stating one rule will drift.** `visiblePacksWhere` (a
  Prisma `where` for the list) and `canReadPack` (a predicate for one row)
  disagreed the moment reads were gated, because the filter still had a
  signed-out branch that could no longer be reached. A test that evaluates
  the filter by hand against every shape of row and compares it to the
  predicate is cheap and would have caught it.
- **A page that prints a query parameter back is a way to render text on your
  domain.** `/sign-in/confirm?email=<a sentence>` showed it under the site
  header next to a Sign in button. Shape-check and cap anything reflected,
  even when nothing can be *done* with the page.

New in the 2026-09-19 session:

- **A green narrow-viewport suite does not mean the layout is still.** It
  measured horizontal overflow and never measured *movement*, so two separate
  layout shifts shipped through it — 36px on 380-500px, then 28px on
  520-639px from the first fix. If a widget resolves client-side, the thing to
  assert is that the header's height is the same before and after, with the
  request **held open** so "pending" is observed rather than raced.
- **Reserving a height does not stop a wrap; only reserving a width does.**
  And an *empty* placeholder has zero **intrinsic** width, so it can change an
  outer flex container's wrap even when its own line is fixed. Any element
  whose content size depends on async state needs a footprint that does not.
- **`notFound()` in a Route Handler does not render the 404 page.** That
  happens for *page* routes. From a route handler it yields a bodiless 404 (0
  bytes, no content-type), which is more anomalous than an ordinary JSON 404,
  not less. It throws `NEXT_HTTP_ERROR_FALLBACK;404` as both `message` and
  `digest`, so a direct handler call in a test gets a throw, not a `Response`.
- **`NextResponse.rewrite` always emits `x-middleware-rewrite`, and it is
  load-bearing.** Deleting the header does not hide the rewrite; it cancels
  it, and the response becomes `200 OK` with an empty body.
- **Better Auth's rate limiter shares one bucket in dev.** `getIP` falls back
  to a single localhost key when no `x-forwarded-for` is present, so every
  browser request from a local suite counts against the same 5-per-minute
  allowance and specs throttle each other. Give each context its own
  `x-forwarded-for` — and a **syntactically valid IPv4**, because a malformed
  one is dropped and silently falls back to that shared key.
- **`next dev` guards on a lockfile in `.next/dev`, not on the port.** A
  leftover dev server refuses the next one with "Another next dev server is
  already running" even when `ss` shows the port free. Kill the PID it names,
  then `rm -rf .next/dev`. This happened twice; `pkill -f` from inside the
  agent's own shell also kills the shell (exit 144), which is how the strays
  survived in the first place.
- **The build logs six `BetterAuthError: You are using the default secret`
  lines, and that is correct.** `next build` evaluates `src/lib/auth.ts`
  without `BETTER_AUTH_SECRET`, which is exactly the arrangement that keeps
  the secret out of the build environment. Noise, not a defect.

New in the 2026-09-18 session:

- **Under forced tool use the model does not refuse — it complies wrongly.**
  `generateQuizPack` sends `tool_choice: { type: "tool", name: ... }`, and a
  model handed a brief it will not write satisfies that contract rather than
  breaking it: it called the tool with a substituted quiz and its refusal
  written as the text of question one. No `stop_reason` says anything. If you
  need a model to be able to decline under forced tool use, **give the tool a
  field to decline with** — `decline_reason` on `emit_quiz_pack` — and say so
  in the system prompt. Checking `stop_reason` is a backstop, not the
  mechanism.
- **A path tested only against a stubbed transport is not tested.** The
  decline path was built twice and both versions passed a green suite while
  being wrong, because every test mocked `generateQuizPack` itself and
  constructed the error by hand, so the detection never ran. It took one real
  brief against the live model to find it. See the 2026-09-18 session section.
- **`npx next typegen` is the fast fix for `Cannot find name 'LayoutProps'`.**
  On a fresh clone `npx tsc --noEmit` fails in `layout.tsx` because that type
  is generated into `.next/types`, which does not exist until a build has run.
  `next typegen` generates it in seconds without a full build; CI already does
  this, and it belongs first in any local gate.
- **Playwright wants Chromium 1234 where the sandbox has 1194**, so all specs
  fail identically until `launchOptions.executablePath` points at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. A throwaway config
  that spreads `playwright.config.ts` and overrides only that field works —
  delete it before `git add`, and note `prisma/gate.db` is not gitignored
  either.

New in the 2026-09-15 sessions (recovered from `claude/zen-feynman-xtoljd`,
which was never merged):

- **`prisma generate` runs only in `build`, never on `install`**
  (`package.json`: `"build": "prisma generate && prisma migrate deploy &&
  next build"`, no `postinstall`). A fresh checkout of `claude/paddle-pro-3a`
  therefore gives ~17 bogus integration failures and 8 tsc errors
  (`Property 'paddleEvent' does not exist`) until you run `npx prisma
  generate`. Not a branch defect.
- **`.next` route types survive a branch switch.** After moving between
  `master` and `paddle-pro-3a`, tsc fails on `validator.ts` referencing the
  *other* branch's routes. `rm -rf .next` before `npx next typegen`.
- **`cmd | tail -n 20 && echo CLEAN` tests `tail`'s exit code, not the
  command's.** It printed "CLEAN" directly under 8 real tsc errors. Same
  class as the `echo $?` false green below. Read the errors, not the banner.
- **`next.config.ts:14` (on `claude/paddle-pro-3a`) gates the Paddle build
  guard on `VERCEL_ENV === "production"`**, so CI and Preview builds pass
  regardless of whether the `NEXT_PUBLIC_PADDLE_*` values are set. Green CI
  on PR #4 is **not** evidence the production build will succeed.
- **The print page hangs Playwright if you emulate print media before
  clicking a tab.** `/packs/<id>/print` has ONE `.paper-sheet` whose contents
  depend on a tab defaulting to `"script"`; the tab buttons are labelled
  "Presenter script", "Answer sheet", "Question sheet"; and they live inside
  `.print-chrome`, which `@media print` sets to `display: none` — so with
  print media emulated every click waits forever on actionability. Click
  first, emulate print afterwards.

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

## What landed in the 2026-09-17 session — rename merged, PR #4 rebased

**PR #7 merged as `efb982c`.** `master` now carries the Triviafoundry rename
and the "Lit pub sign" redesign, and production is deployed from it. Checked
on the preview before merging, then again on the real domain after: `/` 200
with the new title, `og:image` and `og:image:alt` both present, `/og.png` 200
`image/png`, manifest `short_name` "Triviafoundry", and `/terms`, `/privacy`,
`/refunds` all 200.

`https://triviafoundry.com/og.png` **404'd before the merge and serves the
card after it** — the image only ever existed on the branch, so the domain
was fine all along. That was the one thing worth checking, because the share
card URL is absolute (`metadataBase`) and points at the real domain rather
than at whatever host is serving. Re-scrape LinkedIn Post Inspector before
posting a link anywhere.

**PR #4 brought up to date, still not merged** (`cd9f552` on
`claude/paddle-pro-3a`). `master` merged in; conflicts were in `HANDOFF.md`
and `README.md` only — `layout.tsx` and the Paddle plan auto-merged, which
the 2026-09-16 note had expected to clash. Master's rename-era wording won
where the two sides disagreed; both sides were kept where they were
complementary, so the branch now carries its own Task 9 record and Refund
procedure alongside master's EXIF/GPS verification, and the README has both
"Pro subscriptions (Paddle)" and "Legal pages".

Also on that branch: the **live** Paddle catalog is now named
**"TriviaFoundry Pro"** in Task 10 Step 2, the live client token is
"triviafoundry production", and the phase 3b magic-link email subject drops
the old product name. The product name is what a buyer reads at checkout, and
following the plan verbatim would have created a live product called "Pub Quiz
Pro". The **sandbox** catalog keeps its old name on purpose. The pricing and
create pages needed no copy change — neither carried the old product name.

Gate re-run on the merged branch, in the sandbox: tsc clean, eslint 0 errors
(the one pre-existing `alt` warning in `documents.tsx`), `next build` clean,
**unit 168, integration 169, e2e 14/14**.

**PR #4 remains owner-gated and must not be merged** until the live
`NEXT_PUBLIC_PADDLE_*` values exist: `next.config.ts` fails a production build
without them, and CI cannot catch that because the guard only fires when
`VERCEL_ENV === "production"`.

Two gotchas re-confirmed the hard way, both already on record below and both
worth believing: `next lint` does not exist in Next 16 (it tries to lint a
directory called `lint`), and piping it to `tail` swallowed the failure so a
`|| npm run lint` fallback never fired. And Playwright still wants Chromium
1234 where the sandbox has 1194 — all 14 specs "fail" identically until you
point `launchOptions.executablePath` at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` from a throwaway config.

### Palette lift and the two-tone wordmark — PR #9

Owner's reaction to the new theme: "really really dark", and the name should
be camel-cased "TriviaFoundry". The first was right, the second was answered
a different way. Branch `claude/stage-lift`, PR #9, **open, not merged**.

The stage greens sat at roughly L\* 5 / 8 / 16 (deep, stage, panel), which was
wrong twice over. Hue stops being perceptible below about L\* 15, so a
42%-saturated bottle green at L\* 8 renders as plain black — the colour was
specified and never seen. And the ladder spanned only 11 points, so panels
barely lifted off the ground and the stage read as one flat slab. The gradient
in `.bg-stage` made it worse by fading the bottom of every stage page down to
the darkest of the three. Now roughly **L\* 10 / 16 / 25**, same hues.

**Contrast was never the problem and is not the fix.** Every stage foreground
cleared AA at the old values and still does, now 5.0-15.7:1. Darkness here is
a stylistic choice, never an accessibility one, and there is headroom to go
lighter still if it wants it.

The wordmark is **two-tone** — cream "Trivia", neon amber "foundry" — rather
than camel-cased. The complaint behind wanting a medial capital is real:
fourteen characters under one capital and the seam vanishes. But Alfa Slab One
is a very heavy slab, so a capital F mid-word plants a second thick vertical
with two horizontal arms right against the T; and the share card sets the
wordmark directly above `triviafoundry.com`, so a second casing would read as
two different names. Colour separates the compound just as well, keeps one
spelling everywhere, and needs no metadata change or LinkedIn re-scrape. The
card follows suit. **If the owner still wants CamelCase it is cheap** — the
spelling lives in `Wordmark.tsx` plus the metadata strings, and the card and
icons rebuild from their scripts.

`src/app/stage-palette.test.ts` guards the thing that actually broke: the
perceptual floor and the gaps between the three surfaces, **not** contrast.
Verified to fail on the old values before being committed — two assertions go
red while the AA assertion stays green, which is exactly why a contrast check
would have waved the broken palette through.

Gate: tsc clean, eslint 0 errors, `next build` clean, **unit 157, integration
145, e2e 11/11**. Icons, share card and README screenshots regenerated from
their own scripts.

## What landed in the 2026-09-16 session — rename and redesign

Branch `claude/triviafoundry`, cut from `master` `6ea006f`. One PR, two
things that had to move together because the wordmark is in both:

**Rename to Triviafoundry.** Every user-facing string, the metadata
(`layout.tsx` title/description/`applicationName`/`appleWebApp`),
`manifest.ts` (name, short_name, description; `background_color` now the
stage token too, so the installed app doesn't flash cream before the dark
stage — `manifest.test.ts` updated to match), the three legal pages, the
site footer, the README, and every `pub-quiz-trivia-night-automation-hu.vercel.app`
reference in the Paddle plan's **Task 10** and the Paddle spec now point at
`triviafoundry.com` (Website approval, webhook destination, the bundle
grep). Task 10 Step 1 also stops saying "set the default payment link" —
the link is account-wide, shared with Or Zarua, and stays
`https://orzarua.app` (see `claude/refund-revoke-walk-2026-09-15.md` in the
project). Tagline everywhere carries both "pub quiz" and "trivia night" on
purpose: to a US reader "quiz" is a school test. The wordmark is one word,
capital T; `src/components/Wordmark.tsx` is the only place it is spelled.

**Redesign — Direction B, "Lit pub sign"** (chosen by the owner 2026-09-16
from the three directions on the planning canvas). Bottle green stage,
neon amber (`--gold`) for anything that acts, mint (`--mint`) for anything
live or correct, brass (`--brass`) rules, cream paper for the desk. Alfa
Slab One for the display face, Nunito Sans for body, IBM Plex Mono kept
for codes. The two-world structure (dark stage for `/`, `/host`, `/play`;
cream desk for create/packs/editor/print) is unchanged — the homepage is
now *entirely* on the stage (the three steps are brass-edged panels, no
hand-off to a cream section), and `SiteHeader`/`SiteFooter` are dark on
every desk page so the cream reads as a sheet on a bar. `globals.css` is
still the single file that carries the palette; the token *names* did not
change, so nothing outside the files below needed touching.

- **Fonts are now self-hosted** (`src/fonts/*.woff2`, OFL, via
  `next/font/local`) — the build no longer fetches from Google Fonts. The
  sandbox that did this work cannot reach fonts.googleapis.com (egress
  policy), and a production build should not depend on it either. Fontsource
  5.3.0 builds, latin subset, unmodified; licences in `src/fonts/README.md`.
- `scripts/render-icons.ts` (`npm run icons`) renders the whole favicon /
  PWA icon set from the mark and the CSS tokens, so the icons can't drift
  from the palette again. All six icon files regenerated.
- `scripts/capture-screenshots.ts` honours `PW_CHROMIUM_PATH` (a sandbox
  with a preinstalled Chromium but no `playwright install`); the README
  screenshots were regenerated with it and show the new UI.
- Fixed in passing: the host desk's `min-h-full` never filled the viewport
  inside the flex-column body, so a cream slab showed under the stage on a
  TV. Now `min-h-dvh`, like the team portal always was. The old Generate /
  Manage / Play vs Create / Packs / Join nav nit is gone too — the homepage
  uses the header's labels.
- **Social share card** (second commit on the branch): `public/og.png`,
  1200x630, rendered by `scripts/render-og.ts` (`npm run og`) from the same
  tokens and fonts. `layout.tsx` now sets `metadataBase`
  (`https://triviafoundry.com`), `openGraph` and `twitter` with the card and
  its alt text. Deliberately *not* the `app/opengraph-image.png` file
  convention: Turbopack ignores the companion `.alt.txt`, so the card would
  ship with no alt text (checked against a real `next build` + `next start`).
  Before this the app had no share image at all, so a pasted link showed no
  preview. After deploy, re-scrape on LinkedIn Post Inspector before posting.
- **Not changed:** `package.json` name, the repo slug, `src/lib/pdf/*`
  (the printed PDFs never carried the product name), the Paddle product
  name "Pub Quiz Pro" in the sandbox catalog (Task 10 creates the *live*
  catalog fresh — name it "TriviaFoundry Pro" there), the seller display
  name "OrZarua" (account-wide, still to fix before live).

Definition of done, run in the sandbox: `next typegen` + `tsc` clean,
`eslint` clean (one pre-existing `alt` warning in `documents.tsx`),
`next build` clean, unit 153/153, integration 145/145, screenshots of
every major page reviewed by eye. Playwright e2e not run here (no
`playwright install`); `e2e/pwa.spec.ts` was updated for the new
`short_name` and should be run on the device before merge.

**Merge order matters:** PR #4 (`claude/paddle-pro-3a`) also edits
`layout.tsx`, `create/page.tsx` and the Paddle plan/spec docs. Merge this
branch first, then merge `master` into `claude/paddle-pro-3a` and resolve —
expect small conflicts in `layout.tsx` (the font imports) and the plan's
Task 10 block; keep this branch's version of both. PR #4's pricing page
copy should say "TriviaFoundry Pro", not "Pub Quiz Pro", when it lands.

## What landed in the 2026-09-15 legal-pages session

Branch `claude/legal-pages`, cut from `master` `80ca6fd`. Three public policy
pages and the footer that makes them reachable — the prerequisite Task 10 is
waiting on.

- **`/terms`, `/privacy`, `/refunds`** — server components on the paper-toned
  chrome (`SiteHeader`, centred column, serif h1) that `/pricing` and the
  other ordinary pages share, built on a small `LegalPage` shell in
  `src/components/LegalPage.tsx` so the three cannot drift apart and carry one
  shared `LEGAL_LAST_UPDATED` date.
- **`SiteFooter`**, rendered from the root layout so every page gets the links
  without having to remember. It removes itself on `/play`, `/host/<code>` and
  `/packs/<id>/print` — the live-night surfaces and the print sheet, none of
  which carry a `SiteHeader` either.
- **`e2e/legal-pages.spec.ts`** — each page 200s with its own heading and the
  shared date, the footer reaches all three from an ordinary page, and the
  three excluded surfaces have no footer, with a control asserting the same
  locator *does* find one on a normal page so the test cannot pass vacuously.

**Why it matters:** Paddle's Website approval gates the live cutover, and it
wants the production domain to *serve* terms, privacy and refund policies and
to have them *reachable from the site* — two separate claims, which is why the
footer is part of the work rather than a nicety.

**This satisfies the prerequisite recorded in PR #4's own "Next" item 3**
("requires public terms / privacy / refund pages, which the app does not have
yet — that is a prerequisite task"). That sentence lives on
`claude/paddle-pro-3a`, not on `master`, so it could not be ticked from this
branch; strike it when both branches are on `master`.

**Two things deliberately not done here**, because `/pricing` ships with PR #4
and does not exist on `master`:

- The footer links Terms, Privacy and Refunds but **not Pricing**. A footer
  link 404ing for the Paddle reviewer would work directly against the approval
  these pages exist to win. Adding it is one entry in the `links` array in
  `src/components/SiteFooter.tsx` once `/pricing` is on `master`.
- The README section is its own `## Legal pages` rather than a paragraph under
  "Pro subscriptions (Paddle)", which arrives with PR #4. Worth merging the two
  when it lands.

## What landed in the 2026-09-18 session — game integrity, the bill, the desk

Three PRs, all merged to `master` overnight on the 18th. `master` went
`c429f12` -> `c6fa263` (#17) -> `542151c` (#19) -> `3bca366` (#18).

### PR #17 — scoring, the scoreboard oracle, the Answer index

**A Hebrew quiz scored every team correct.** `normalizeAnswer` ended with
`.replace(/[^a-z0-9\s]/g, "")`, an ASCII-only class that deleted every other
character rather than just punctuation. "ירושלים", "!!!" and "" all normalised
to `""` and matched each other — so **an empty answer box scored correct**
against any Hebrew answer. "תל אביב" and "באר שבע" both became a single space.
Latin was damaged more quietly: "café" became "caf", so a team typing "cafe"
was marked wrong. It now NFKD-decomposes, strips `\p{M}` (which also folds
Hebrew niqqud, so a pointed answer matches an unpointed one) and keeps
`\p{L}\p{N}`. An answer that normalises to nothing now matches nothing, which
is what closes the blank-box case for good.

Same commit, **M14**: the leading-article strip ran *before* the punctuation
strip, so a quoted `"The Beatles"` kept its article and stopped matching a bare
`Beatles`.

**The live scoreboard was an answer oracle.** `computeScoreboard` summed every
answer with no filter and the route spread it into both payloads. Answers are
scored at submit time and a team could resubmit without limit, so: submit,
poll, watch your own total, repeat until it moves. The route already withheld
`myAnswer.isCorrect` before the reveal and then leaked the same fact through
the total. The current question is now excluded until REVEAL/ENDED, **for the
host payload too** — the desk is on the pub TV. `computeScoreboard` takes the
question in play as a *required* argument, so the next caller cannot forget.

**Submissions capped at 5 per team per question**, counted against the team id.
`rateLimit` gained an optional `identity` that replaces the client IP, because
every team in a pub arrives from the venue's single NAT address and an
IP-keyed allowance would have the first team to answer throttle the room.

**H8**: `Answer` carried only the unique on `(teamId, roundIndex,
questionIndex)`, which leads on `teamId` and could not serve `WHERE sessionId
= ?` — the lookup every 3-second poll makes. SQLite answered with `SCAN
Answer`: every row ever written, for every host and team, every 3 seconds.
`@@index([sessionId, roundIndex, questionIndex])` makes it `SEARCH ... USING
INDEX`, confirmed with `EXPLAIN QUERY PLAN` both ways.

### PR #19 — the host desk stops showing the answers to the room

The desk is not a private admin view: it goes on a TV or projector and is laid
out to be read from about four metres (`b138bde`). During QUESTION_ACTIVE it
rendered every team's answer text, a green `+1` or red `0`, and the
Correct/Wrong buttons — so the first team to answer correctly published the
answer to the room, and with 5 resubmissions the rest could copy it off the
wall. It now shows only "Answered" or "Waiting…" until the reveal.

**Gated server-side as well, and that is the gate that matters**: the host
branch of `GET /api/sessions/[code]` nulls the answer's `text`, `isCorrect`,
`pointsAwarded` and `id` before REVEAL, exactly as `myAnswer` is nulled for
teams. A screen cannot show what it was never sent.

Two things worth keeping:

`e2e/quiz-flow.spec.ts` had asserted the leak **as a feature** — its comment
read "Host sees the live submission, auto-scored as correct, before revealing".
That is why a green suite sat on top of it.

The host page's DOM *does* contain answers, but only as inert RSC payload left
behind by `/packs/<id>` — the editor, which legitimately shows answers to the
pack's owner — carried across the client-side navigation. It is never
rendered, so it is not on the TV. The e2e reloads before asserting so it tests
the right document. Do not re-raise this as a leak.

### PR #18 — the generation bill, the M12 race, the decline path

**The free tier was voluntary and the bill had no ceiling.**
`getOrCreateCreator` mints a Creator with a full allowance for any request
without a `pq_creator` cookie, so deleting the cookie reset the allowance and
never sending one skipped it entirely. A cookie-less `curl` loop was an
unlimited generator, bounded only by the per-IP throttle (5 per 10 min,
~720/day/address). **Signing the cookie would not have closed this — the
attack is having no cookie at all.**

What closes it is a hard global ceiling per UTC day, checked before the model
call, with **no identity in the key**, so rotating or dropping cookies cannot
move it. `FREE_DAILY_PACK_CEILING` (default 20) and `PRO_DAILY_PACK_CEILING`
(default 50), separate buckets, read per request. Pro keeps **no per-user
cap** — that is what makes "as many quiz packs as you want" on /pricing true —
and its ceiling is a runaway backstop. Upstash-backed where configured, with
the caveat that is now Next item 1.

**M12**: the free-cap check and the increment straddled the multi-second model
call, so two concurrent requests on one cookie both passed on the same stale
read. `reserveFreeGeneration` claims the slot up front in one conditional
`updateMany`. The test fires `FREE_LIMIT x 2` requests at one cookie at once:
against the old shape all four returned 201, now exactly two do.

**The decline path took three attempts, and only the third was real.**

1. First version watched `stop_reason === "end_turn"`. Wrong branch.
2. A code review caught that the SDK's `StopReason` union includes `"refusal"`,
   and that a forced-tool request makes `end_turn` the *unlikely* shape. Fixed
   to read both, preferring `stop_details.explanation`.
3. **A real run on the 18th showed neither fires.** Asked for a round on
   private individuals' home addresses and phone numbers, the model satisfied
   the tool contract instead of refusing: it called the tool with a substituted
   general-knowledge round titled "Know Your Trivia Limits" and wrote its
   refusal as the text of question one — "I can't create a round that doxxes
   real private individuals... Instead, here's a...". **That saved as a
   successful pack and spent a free generation.**

The fix is to give the tool an explicit way to say no: `emit_quiz_pack` takes
an optional top-level `decline_reason`, `rounds` is no longer required, and
the system prompt says to use it and to never substitute a quiz or put a
refusal inside a question or answer. A non-empty `decline_reason` is checked
*before* the pack parse and regardless of what arrives with it — a response
carrying both a reason and rounds is a decline that also substituted a quiz,
and the quiz is the part to discard.

**VERIFIED against the real model, 2026-09-18**, by the owner, off-sandbox: the
same doxxing brief now returns **422, shows the model's refusal, and saves no
pack**. This is the first real-model confirmation this path has ever had, and
the reason it is worth writing down is that two earlier versions of it passed
a green suite while being wrong — both were only ever tested against a stub.

A code review of PR #18 also found twelve issues, two of which meant the PR did
not do what it claimed; the fixes are in `12cfeb8`. The one worth remembering:
**the daily ceiling was refunding itself after billed calls.** A brief that
runs to the full 16k `max_tokens` and then fails validation is the most
expensive call this app can make, and refunding its unit left a loop of exactly
those bounded by nothing. The two reservations now refund on different terms —
the creator's free pack always comes back (fairness), the ceiling only when
nothing can have been generated (no client, or an `Anthropic.APIError`, which
produces no completion).

Also in #18: model refusals return 422 rather than a retryable 502; the
paywall line links to /pricing instead of promising "coming soon"; the period
wording is aligned to 30 days; and `NAV_LINKS` is exported from `SiteHeader`
so the homepage cannot drift a fourth link again.

### Decisions taken by the repo owner, 2026-09-18

- **5** answer resubmissions per team per question.
- **400** characters of a model decline shown to the user.
- An `Anthropic.APIError` refunds the daily ceiling; unusable model output does
  not, because the tokens were billed either way.
- Daily ceilings **20 free / 50 Pro**, set as env vars *and* as the code
  defaults, so a deploy that forgets the variables is still inside budget.
- `GET /api/packs` answer exposure: **left until after launch** (see Open
  items).
- The `rate-limit.ts` / `daily-ceiling.ts` duplication: **follow-up**, once
  both PRs had merged. They now have, so it is available to do.

### Gate, for the record

Master baseline before this session was unit 191, integration 153, e2e 39.
PR #17 left it at 210/160/39, PR #19 at 191/155/40, PR #18 at 217/170/40. All
three were green on both the `test` check run and the `Vercel` commit status
before merge.

**The baseline on merged `master` `3bca366` is unit 236, integration 179, e2e
41** — measured after the merges, so it is the number a fresh clone should
reproduce. Run `npx next typegen` before `tsc`, and see Gotchas for the
Chromium override the e2e run needs in a sandbox.

## What was built in the 2026-09-19 session — host accounts, the function ceiling

**Nothing merged.** Two PRs opened, both green, both left for the owner.
`master` is still `2263a4b`. This section is written as "built", not
"landed", because none of it is in production.

### PR #21 — `maxDuration` 300, because the account is on Pro

`POST /api/packs/generate` had carried `maxDuration = 60` since 2026-09-08,
and the comment above it read as though 60 were the platform's ceiling. It is
not: the Vercel account is on **Pro**, where functions default to 300s and can
go to 800s. That was not a free mistake — **a generation killed at 60s has
already spent the Anthropic tokens it burned getting there**, so the caller
got a 504 and the project got the bill. Large briefs were the ones paying.

`[id]/pdf` and `[id]/export` had **no** `maxDuration` at all and ran on the
platform default. The QA sweep measured **231s** for a large pack's PDF.
Both now 300; export inlines media as base64 and scales the same way.

Observable artifact, since nothing local enforces a wall-clock ceiling —
`.next/server/functions-config-manifest.json`, built both ways:

```
before (master)            after (#21)
/api/packs/generate  60    /api/packs/generate     300
                           /api/packs/[id]/pdf     300
                           /api/packs/[id]/export  300
```

The two routes being *absent* from the "before" manifest is the confirmation
they had no declared ceiling. Whether Vercel honours 300 is Vercel's to
demonstrate; it cannot be shown off-platform.

`docs/portfolio-readiness.md` still says 60 in places and was **deliberately
left alone** — those sit inside dated entries recording what was measured
that day. `src/lib/generate-pack.ts` and the README said it as current fact
and were corrected.

*One correction to the brief that set this up*: it described the route's
comment as calling 60 "the Hobby maximum". It did not — the word "Hobby"
appears nowhere in the repo. The comment said "the platform's default
function timeout", which was misleading by omission rather than wrong.

### PR #22 — host accounts

Identity was an unsigned `pq_creator` cookie. Clearing cookies handed a
visitor a fresh free allowance, lost them every pack they had written, and —
once Paddle goes live — would lose a buyer their Pro. **Better Auth 1.7.5**
with the Prisma adapter over the existing libSQL client; Google, or a link
mailed to the address; no passwords. 92 files.

**Teams never sign in, and that is load-bearing.** `/play`, joining,
answering, the team portal, `GET /api/sessions/[code]` and
`GET /api/questions/[id]/media` all stay open — a pub full of strangers
cannot be asked to make an account to answer question three, and a team's
phone holds nothing that could authenticate it.

**The surfaces that carry the answers changed, and this is the one behaviour
change worth knowing about.** The PDF, print and export routes did **not**
need an account before. They do now.

**Schema.** Four Better Auth tables plus `Creator.userId String? @unique`.
`Session` is already the *game* session — the row behind a five-character
join code — so Better Auth's live in **`authSession`**;
`src/lib/auth-config.test.ts` fails if that ever changes, because the failure
mode is a corrupted quiz night rather than a broken login. The migration is
hand-written, as they all are here: `prisma migrate diff` wanted to
`DROP TABLE "Creator"` and rebuild it to add one nullable column, and SQLite
does not need that. **Purely additive** — verified by applying it and dumping
`sqlite_master`; `Creator` keeps its original DDL with the column appended.

**Claiming.** `pq_creator` is no longer identity and **nothing sets it any
more** — it is read in exactly one place, `legacyDeviceKey` in
`src/lib/auth-guard.ts`. A browser still carrying one hands it over once, on
sign-in, so the packs and used allowance behind it move onto the account. A
Creator belonging to another user is never taken, and a merge keeps the
**higher** of the two counts — the alternative makes claiming itself the way
to refund an allowance.

**The proxy is not the defence.** `src/proxy.ts` (Next 16's renamed
`middleware.ts`) redirects on a missing session cookie, but `auth-guard.ts`
running `auth.api.getSession` is what actually decides. `src/proxy.test.ts`
forges a cookie and walks straight through the proxy to prove the point.

### Two bugs caught by re-reading and re-measuring, not by the suite

Both were self-inflicted and both were found *after* the code looked right:

- **The production secret check had to move.** Throwing at module load made
  `next build` itself depend on `BETTER_AUTH_SECRET`, which forces the secret
  into the build environment and stops `npm run build` working locally. It is
  now `assertAuthConfigured()`, per request. Verified on a real `next start`:
  with no secret, `/` and `/pricing` still serve, every auth endpoint 500s,
  and `/packs` **with a forged cookie** 500s rather than letting it in.

- **The claim's merge transaction re-read only the orphan.** It used the
  account's own row as read *before* the transaction, so a sign-in racing a
  generation could write a **lower** used count back — the exact failure the
  whole design exists to prevent, arriving through the one path meant to
  guarantee it cannot. Both rows are now read inside the transaction. There
  is no test that provokes that interleaving deterministically; this is a
  code fix and a comment, not a test claim.

### A layout shift that took two goes

The account corner resolves client-side, so for a moment the header does not
know which of three differently-sized things it will show. The placeholder
reserved a **height** and nothing else, and **width** is what decides a wrap:
on a 390px phone the nav row has 107px left after the four links, the 64px
placeholder and 68px "Sign in" fitted, and the signed-in 217px did not. A
host's email arriving wrapped the corner to a new line and shoved the page
down **36px**, at **380-500px** — iPhone 13/14, Pixel 5/7, iPhone 14 Pro Max.

Giving it its own line below `sm` fixed that band and **broke 520-639px**,
because an empty placeholder also has zero *intrinsic* width: the header's
outer row sized the nav at 243px pending and 459px resolved and wrapped
differently, shifting 28px — now for **signed-out** visitors, who never had a
shift at all. Only re-running the same sweep caught it.

The slot is now a fixed width in every state at every viewport. Re-measured
320-1280px signed out, signed in, and signed in with a 76-character address:
**worst movement 0px, worst overflow 0px**. Tablets and landscape phones came
out 28px *shorter* than before.

`e2e/sign-in.spec.ts` now holds the `get-session` request open so "pending"
is observed rather than raced. Checked against the previous component: those
tests fail at exactly 390px and 430px signed in and pass at 320/560/1280, so
they pin the bug rather than the implementation.

**The suite measured horizontal overflow and never measured movement**, which
is why neither shift was caught. Worth remembering before trusting a green
narrow-viewport run.

### The e2e sign-in capture, and its one residual weakness

A browser cannot open an email, so the suite reads the link back from
`GET /api/test/sign-in-links`. That route needs **all three** of
`NODE_ENV !== "production"`, `SIGN_IN_LINK_CAPTURE === "1"`, and no
`RESEND_API_KEY`. Verified on a production server with the flag *deliberately
set*: 404 on GET and DELETE, before and after a real sign-in, nothing
captured, and the send failing loudly with `SignInEmailNotConfiguredError`.

**It is not indistinguishable from a path that does not exist, and three
attempts to make it so all failed.** Recorded so nobody re-treads it:

1. `notFound()` from `next/navigation` renders the 404 *page* only for page
   routes; from a route handler it yields a **bodiless** 404 (0 bytes), which
   is *more* anomalous than the JSON, not less.
2. A proxy rewrite to a nonexistent path produced a byte-identical body
   (19,621 bytes) and identical headers — except `x-middleware-rewrite`,
   which announces the rewrite and leaks an internal path.
3. Deleting that header breaks the rewrite outright: `200 OK`, empty body.
   The header is what performs it.

So the JSON 404 stays. What leaks is that the path resolves to *something
that declines* — no links, no status, no hint what it is.

### Verification

Driven in a browser rather than re-run as tests: signed-out redirects with
the query string preserved, the sign-in journey by **tap** on nine device
profiles (iPhone SE through iPad Mini, plus two landscape), sign-out, a
re-used link refused in a second browser, a team playing a full question with
**zero cookies**, and the 401 sweep over every host route by raw HTTP.

Hostile `?next=` values — `//evil.test`, `https://evil.test/steal`,
`/\evil.test` — all rewrote to `/packs`; the browser never left the origin.
Better Auth's own `trustedOrigins` refuses a hostile `callbackURL` posted
straight at the API with `403 INVALID_CALLBACK_URL`, so `safeNextPath` is the
second line, not the only one.

Gate at the first round's final commit (`e8967bd`): typegen, tsc, eslint (1
known alt warning), **unit 275**, **integration 234**, **e2e 69**,
`next build`. Baselines were 236 / 179 / 41. The second round's numbers are
at the end of the next section.

### Second round on PR #22 — the sign-in a mail filter cannot spend

Three commits on the evening of the 19th, after the owner reviewed the
first round: `4f3e367`, `2e5b541`, `3879ecf`. Head is `3879ecf`.

**The magic link was broken for anyone behind a corporate mail filter, and
not subtly.** `GET /api/auth/magic-link/verify` is GET-only and consumes the
token on the first GET. Microsoft 365 Safe Links, Defender and Proofpoint
fetch every link in incoming mail *before* the person clicks. So for those
hosts the link was spent by the filter and their first click said "already
been used". **A GET that signs you in is a GET a scanner signs itself in
with** — worth holding on to as a rule, because it is not specific to this
app.

`magicLink` is gone; `emailOTP` replaces it. One email carries **one secret,
two ways to use it**: six digits to type on `/sign-in`, and a link to
`/sign-in/confirm?email=…&code=…` carrying the same digits. That page reads
nothing, writes nothing and submits nothing on its own — no database call, no
session lookup, no `useEffect` that fires on mount — so a scan costs nothing.
Only its button's `POST /api/auth/sign-in/email-otp` spends the code.

One secret rather than a link token *plus* a code, deliberately. Two
independent tokens buy nothing once the link consumes nothing, and cost two
expiries, two attempt budgets, and a host who clicks the link *and* types the
code ending up with two sessions. Kept from the old flow: 15 minutes, single
use, no answer that reveals whether an address has an account. New: five
wrong guesses kill a code, and the budget is spent **per code** rather than
per caller, so changing address buys a guesser nothing. Codes are stored
hashed.

Nothing in `prisma/` changed. The code lives in the `verification` table the
accounts migration already creates, under identifier `sign-in-otp-<address>`,
so there is no second migration and `20260919180000_add_accounts` is
byte-for-byte what it was. That matters more than it sounds: the PR #22
preview build ran `prisma migrate deploy` against a `DATABASE_URL` scoped to
Production **and** Preview, so that migration is almost certainly already
applied to the production database. **Never edit it.** Any future schema
change is a new migration.

**What is deliberately worse.** The link no longer carries where you were
going: type the code in the tab you started in and you land back on
`/packs/<id>`; follow the link and you land on `/packs`. Nothing carries that
intent through an inbox, the link is routinely opened on a different device
from the one that started, and a redirect target arriving from an email is
one more externally-supplied URL to validate. Both behaviours are pinned in
`e2e/host-gate.spec.ts` so neither can drift into an accident.

**The residual risk, because it is not zero.** A scanner that merely *fetches*
the link costs nothing — that is the design. A scanner that executes
JavaScript and *clicks buttons* would still spend the code, and with one
secret the typed half goes with it. Much rarer than a plain fetch, and the
answer is the same as a forwarded email: ask for a fresh code. Two
independent tokens would close it; the trade is written up in PR #22's body.

### Second round — reading a pack now means owning it

`GET /api/packs/[id]` returned every question and every answer to anyone
holding an id, with no account at all, on the theory that a cuid is unlisted.
**Nothing in the client has ever called it** — the editor is server-rendered
and a team's phone reads `/api/sessions/[code]` — so the only thing that hole
served was whoever found an id. The other read surfaces needed an account but
not ownership, so any *other* signed-in host with an id could read a
quizmaster's unrun pack, which is the one thing in this product worth
stealing.

Six surfaces now require ownership, not the five that are obvious:
`/packs/[id]`, `/packs/[id]/print`, `GET /api/packs/[id]`, the PDF route, the
export route — and **`POST /api/sessions`**, which was not on the brief's
list. Running a session on a pack puts every question and every answer on the
host desk, so starting one is a read. Without it, "every pack read is
owner-only" would have been true of five doors and false of the side
entrance.

Somebody else's pack answers **exactly** as a pack that does not exist: same
status, same content type, same bytes from an API, `notFound()` from a page,
asserted side by side. Anything that differed would make each surface an
existence oracle for pack ids. The ownerless demo stays readable by any
signed-in host, which is what keeps Export → Import working as the way to
take an editable copy.

`visiblePacksWhere` lost its null branch *and* its null parameter. It
described a signed-out listing, which has not existed since accounts landed,
and a branch for a state that cannot occur is a branch that quietly disagrees
with the single-row check. The two are now asserted to agree for every shape
of pack.

**`GET /api/questions/[id]/media` stays open and is now the only open read.**
A team's phone renders the current question's image and holds nothing that
could authenticate it. Narrowing it means scoping the read to a live session
and its team token, which changes what a team's browser has to send — a
team-facing change, so it was left alone and flagged to the owner instead.
Anyone holding a question id can fetch its image; nothing private should be
uploaded as a question image.

### Second round — the flaky spec, and why the obvious diagnosis was wrong

The brief said `e2e/sign-in.spec.ts` "a sign-in link works once" failed about
one run in two, and blamed the two `browser.newContext({ baseURL })` calls
sharing Better Auth's localhost rate-limit bucket. **It was not that**, and
the hour spent proving it was worth it.

- Those contexts **were** attributed. Playwright fills a test's `use` options
  into a direct `browser.newContext()` too — `runBeforeCreateBrowserContext`
  in `playwright/lib/index.js` — so the file-level `test.use({
  extraHTTPHeaders: { "x-forwarded-for": signInIp() } })` reached them.
- The arithmetic did not work either: `/magic-link/verify` was capped at 10
  per 60s and that spec put two requests in the bucket.
- Three consecutive full runs of the **unmodified** suite: 69/69 each time.

The real cause: Next hydrates a route announcer — `<div
id="__next-route-announcer__" role="alert">` — into every App Router page, so
`page.getByRole("alert")` is ambiguous and Playwright's strict mode fails on
two matches. The announcer arrives **after** the HTML, so there is a window
in which the locator resolves to one element and the assertion passes.
Measured on `/sign-in?error=…`, polling every 25ms from `waitUntil: "commit"`:

```
attempt 1: counts=1,1,1,1,1,1,1,1,1,2  → became 2 after ~225ms
attempt 2: counts=1,1,1,1,1,1,1,1,1,2  → became 2 after ~225ms
attempt 3: counts=1,1,1,1,1,1,1,1,2    → became 2 after ~200ms
```

An assertion whose first poll lands inside that window passes; the same
assertion on a busier machine does not. That is a load-dependent race that
fails about one run in two and passes alone — the report exactly.
`e2e/pack-file.spec.ts` had already worked around it with a `.filter()`, so
it has bitten here before and nobody wrote it down. Now: a named
`pageAlert(page)` helper scoped to `<main>`, and a spec that pins the reason.

The rate-limit work is in anyway, as hygiene and not as the fix. Two real
ordering hazards it removes: every context in a file with a file-level
`test.use` shared **one** caller address, and contexts in files without one
had no address at all and shared Better Auth's `127.0.0.1` fallback across
the whole run. Every e2e context now announces its own caller, worker-scoped
so raising `workers` above 1 cannot collide.

### Second round — the legal pages, committed

The owner approved the drafts with edits, so /privacy and /terms are current
again and `LEGAL_LAST_UPDATED` is `2026-09-19`. `[contact]` is the existing
`ContactLink` component throughout. The README's "out of date as of host
accounts" note is gone.

**The cookie clause names every cookie this configuration can set, and the
list came from what the configured instance actually emits** — driven through
`auth.handler` and read off the `Set-Cookie` headers, not taken from the
documentation:

| Cookie | Life | When |
|---|---|---|
| `__Secure-better-auth.session_token` | 7 days, refreshed by use | On sign-in |
| `__Secure-better-auth.state` | 5 minutes | Only while a Google sign-in is in flight |
| `pq_creator` | legacy | Never set any more; read once, on first sign-in |

Better Auth's `session_data`/`account_data` need the cookie cache, which is
off; `dont_remember` needs a `rememberMe`, which only the password endpoints
accept and those are disabled. Neither is reachable here.

The retention clause promises only what the code does. Better Auth deletes a
code's row the moment it is consumed, and an expired row when a submission
arrives for it, but **nothing sweeps a code nobody ever tries**. So the page
says both stop working and claims no deletion there is no job to perform. A
real "and then it is deleted" promise needs a cleanup job first.

### The media route — PR #24, stacked on #22

Asked for separately, after the second round, and kept out of #22 so the
accounts PR did not grow a sixth topic.

`GET /api/questions/[id]/media` was the last read in the app that took
nothing at all: the bytes went to whoever held the question id. Ids travel —
screenshots, logs, a shared URL, an exported pack — and a picture round is
the sort of thing a rival quizmaster would take.

The rule is stated so that it cannot disagree with what the app already
shows: **the image goes to whoever the session state would serve the question
to.** A team holding a token for the session whose *current* question this
is, or the desk holding that session's host key — the same credential, for
the same question, that `GET /api/sessions/[code]` already answers with
`hasMedia: true`. Or a host who may read the pack, which is `canReadPack`.
Everyone else gets the 404 a question with no image gets.

The current question and not "anything in the session's pack", because a team
that could walk the pack could read round four's picture round during round
one. And "current" is resolved with `getCurrentQuestion` — the same function
the session payload uses, against the same query shape — rather than a
cheaper comparison of the stored `index` columns: if the gate and the payload
ever disagreed the symptom would be images silently missing from a live quiz,
and being one function is what makes that impossible rather than unlikely.

An `<img>` cannot send a header, so the two callers with no session cookie
put the credential on the query string (`?code=…&token=…` for a phone,
`?code=…&hostToken=…` for the desk). Not a new exposure — a team's token is
already a query parameter on every poll it makes — and one builder,
`questionMediaUrl`, is what stops the client and the gate drifting apart.

Two notes for whoever comes next. A team in the **lobby** can fetch the first
question's image, which is deliberate and is a test: the session payload
already hands a team that question's *text* before the host starts, so
withholding the picture would guard nothing. And `GET /api/sessions/[code]`
still compares a team token with `===` rather than in constant time — that is
pre-existing, it was left alone rather than widening this diff into the route
every team polls every three seconds, and it is a two-line follow-up.

### Second round — verification, and the gate

Driven in a browser rather than re-run as tests: the whole sign-in flow at
390px (form → check-your-inbox → wrong code → the confirm page → signed in),
and /privacy at 1280px. The confirm page and the code field were both added
to `e2e/narrow-viewport.spec.ts` at 320/360/390/430px — neither is reachable
by a plain `goto`, which is why they had no coverage.

Two claims checked against the running server rather than reasoned about:

- **Where the emailed link points.** Driven through the real handler with
  three `Host` headers. A preview host gets a preview link, the production
  domain gets a production link, and a forged `evil.test` falls back to the
  configured origin rather than mailing somebody a link to an attacker's
  domain.
- **A hydration warning in the dev overlay was mine, not the app's.**
  `caret-color: transparent` on the focused input is what Playwright's
  `screenshot({ caret: "hide" })` default injects. The served HTML has none.

Gate at `3879ecf`: typegen, tsc, eslint (1 known alt warning), **unit 286**,
**integration 263**, **e2e 79** — the e2e suite run **three times end to
end**, 79/79 each time — and `next build`. `/`, `/pricing`, `/terms`,
`/privacy`, `/refunds` and `/play` all stayed **static**; `/sign-in/confirm`
is dynamic, which it has to be, because it reads a code out of the query
string.

Two mutation checks, because a test that cannot fail is not evidence:
`allowedAttempts` 5 → 50 fails the five-guesses test, and `canReadPack` →
`return true` fails 7 of the 23 pack-read tests.

## Next

*Updated 2026-09-19. Items 0a and 0b are new and come first because both are
sitting in open PRs; the numbered list below them is the 2026-09-18 list,
unchanged and still accurate — nothing from the 19th merged.*

0a. **Decide PR #21, #22 and #24, in that order where it matters.** All
    green on `test` and `Vercel`, none merged. **#24 is stacked on #22** —
    its base branch is `claude/accounts`, so #22 merges first and GitHub
    retargets #24 to master. #21 is five files and carries no
    behaviour change beyond the wall-clock ceiling. #22 is host accounts,
    now after two rounds, and needs the two owner decisions in Open items
    *before* it is useful in production — in particular it will not serve a
    sign-in without `BETTER_AUTH_SECRET` and `RESEND_API_KEY`/`EMAIL_FROM`,
    which is deliberate: it fails loudly rather than signing cookies with a
    published default key.

0b. **Set the environment variables and create the Google OAuth client.**
    This is now the only thing standing between #22 and a working sign-in.
    The table and the exact redirect URIs are in PR #22's body; every
    variable is also in `.env.example` with its reasoning. Nothing on Vercel,
    Turso, Google or Resend has been touched from this side.

*The list below was rewritten 2026-09-18 against `master` `3bca366`. The previous list was trued
up on the 15th and had gone wrong in two places by the 17th: item 0 asked for
a rename PR that had already merged, and item 3 said the print page-break fix
was uncommitted when `a763086` had carried it since 2026-09-10. Both are
corrected here. A correction to the same two items exists on
`claude/vigilant-turing-20iz2l` as `2b06252` and has never been merged, which
is why `master` still carried the wrong text for a day.*

1. **Confirm Upstash is configured on production.** The single most important
   open item, and the reason to read Open items first. Without
   `UPSTASH_REDIS_REST_URL`/`_TOKEN` the new daily generation ceiling falls
   back to an in-process counter per serverless instance, so "20 a day"
   silently becomes "20 a day *per instance*" and the bill is not capped in
   the way the code claims.
2. **Verify the generation fixes against the real model on production** —
   the three-step gate and its cautions are in Open items. Still the oldest
   unpaid debt here, and note it is a *different* thing from the decline
   verification, which did happen on the 18th (see below).
3. **Merge or close `claude/vigilant-turing-20iz2l`.** It carries two things
   `master` does not: the browser print page-break fix (the HTML twin of
   `a763086`, which fixed only the PDF renderer) and the handoff correction
   above. It is green and was never merged. Then the print verification that
   has been outstanding since the 13th can finally be done: load
   `/packs/<id>/print` for a four-round, ten-question pack, print-preview it,
   and check no question is cut across a page break. The same reload confirms
   `7850f8d` (images on the print page), also never seen rendering.
4. **Task 10, the live Paddle cutover** (owner-gated). Its Website-approval
   prerequisite — public terms/privacy/refund pages — is satisfied as of
   PR #6. Then phase 3b (Tasks 11-12, the restore-token library and routes).

Still unanswered, asked more than once, and needed for **Task 10 only** (the
sandbox work in Task 9 does not depend on either): reuse the HebCal Paddle
seller account or open a separate one? The other long-standing question —
monthly, annual, or both at launch — was answered by building both: PR #4
ships monthly $5 and annual $25.

**PR #5 and PR #6 were merged to `master` on the owner's explicit
instruction, 2026-09-15** — the standing "nothing gets merged or approved"
rule was lifted for those two only. PR #4 is untouched and remains the
owner's call. `master` deploys to production on push, so both merges are
live.
