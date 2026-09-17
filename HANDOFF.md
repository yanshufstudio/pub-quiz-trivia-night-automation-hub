# Handoff — 2026-09-13 (rename + redesign session appended 2026-09-16)

Product name: **Triviafoundry** (since 2026-09-16; was "Pub Quiz Hub" —
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

> **State correction, 2026-09-17 (second session, end of day).** Everything
> below this box is the 2026-09-13 picture, kept as the record of that day.
> **Read this box instead.**
>
> `master` is **`27e73b3`** and production deploys it, so **TriviaFoundry,
> the lifted stage palette and the 2026-09-17 QA hardening are all live**.
> PRs #3, #5, #6, #7, #8, #9 and #10 are merged.
>
> **Open, in the order they matter:**
>
> - **`claude/vibrant-mccarthy-nsbvf0`** (`0cdd7b1`) — this session's work:
>   the host desk rescaled for TV viewing distance, the narrow-viewport
>   regression spec, and the handoff. Merged up to `27e73b3`, gate green,
>   **no PR opened** because none was asked for.
> - **PR #11** (`claude/zealous-ritchie-filqif`) — the QA session's follow-up,
>   brand-casing in stale doc headings. Not this session's.
> - **PR #4** (`claude/paddle-pro-3a`, `cd9f552`) — still **DO NOT MERGE**,
>   and now on **two** gates, not one: the live `NEXT_PUBLIC_PADDLE_*` values
>   (`next.config.ts` fails a production build without them, and CI cannot
>   catch it because the guard only fires when `VERCEL_ENV` is production),
>   **and** `/privacy`, which says nothing about the four Paddle columns and
>   the `PaddleEvent` table that PR #4 adds. Merging as it stands makes the
>   live privacy policy inaccurate on day one. Owner's call either way.
>   https://github.com/yanshufstudio/pub-quiz-trivia-night-automation-hub/pull/4
>
> **The oldest unpaid debt is unchanged**: the generation fixes have never
> been checked against the real model on production. Three-step gate in Open
> items. Needs a browser; a sandbox cannot do it.

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

*Trued up 2026-09-17 (second session) against `master` `27e73b3` and PR #4
`cd9f552`. Four entries were added that day — the `/privacy` gap, the sandbox
creator row, the "OrZarua" checkout branding and the header overflow — and
two were struck as fixed. The PR #3-era entries (test the preview not
production; previews are building again; media phases 2-4 are local-only)
went when PR #3 merged as `5982f76`; that history is in the session sections
above.*

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

- **Checkout branding says "OrZarua", and `/terms` may contradict it.** The
  Paddle seller account is shared with Or Zarua, so the checkout branding —
  the name a buyer reads while paying — is account-wide and cannot be renamed
  for Triviafoundry alone. The 2026-09-16 section already notes the display
  name as "still to fix before live"; the sharper problem is that it is what
  the *buyer* sees at the moment of paying, and it may not match what
  `/terms` says about who is selling. Decide before the live cutover whether
  "OrZarua" at checkout is acceptable, and reconcile the two. (The *default
  payment link* half of this correction is already applied — Task 10 Step 1
  leaves `https://orzarua.app` alone.)

- **`/privacy` needs revising before PR #4 merges.** The page names Paddle
  and the email address received when a subscription starts, and nothing
  else. PR #4's schema adds `paddleCustomerId`, `paddleSubscriptionId`,
  `subscriptionStatus` and `subscriptionUpdatedAt` to `Creator`, plus a
  `PaddleEvent` webhook table — none of which the policy mentions. Merging
  PR #4 as it stands makes the *live* privacy policy inaccurate on the day
  it ships. Checked 2026-09-17 against `origin/claude/paddle-pro-3a`'s
  `prisma/schema.prisma` and `master`'s `src/app/privacy/page.tsx`. A draft
  exists off-repo; it was never committed.

- **One sandbox-origin creator row sits in the production Turso DB**:
  `cmu2qdlry000004kwpuii81g5`, carrying real *sandbox* Paddle identifiers
  (`sub_01m2kac7e3nxnmnz959dypqrbd`, `txn_01m2kaa12cck2hn8brerkjst8k`) from
  the 2026-09-15 refund/cancel walk. It reads FREE, so it is functionally
  inert, but production data and sandbox billing ids are now mixed in one
  table. Decide (delete, or leave and document) before the live cutover.

- **~~The header row scrolled the page sideways on a phone~~ — fixed
  2026-09-17 (`1ae6b0f`), not yet merged.** Recorded because it was live in
  production and nobody knew. The sign and the nav were one non-wrapping
  flex row, so below ~410px the whole page slid sideways: on `origin/master`
  `efb982c` (what triviafoundry.com serves) 85px at 320, 45px at 360 and
  **15px at 390 — a standard iPhone**; at 320 the nav was pushed off the
  right edge and only "Create" survived. Fixed with `flex-wrap` on the two
  header rows (`SiteHeader.tsx` and the homepage's own copy in `page.tsx`);
  a smaller wordmark cannot fix it, since 280px of usable width has to hold
  a ~201px sign and a ~217px nav. **Only that row was affected** — `/play`,
  `/host/<code>` and the team join screen all measured zero overflow at 320,
  360, 390, 1024 and 2560. PR #9's capital F added exactly 5px to a bug that
  was ~94% already there.

  **Why a green suite missed it: nothing in the suite used a viewport
  narrower than a desktop.** That is now closed by
  `e2e/narrow-viewport.spec.ts` (320/360/390/430 across the five surfaces
  carrying the header row), verified to fail before the fix — 15 red, and
  the 5 at 430 green — and carrying a control so it cannot pass vacuously.
  Same blind spot that hid the print-preview bug.

- **~~The host desk was laid out like a desktop page on a surface read from
  four metres~~ — fixed 2026-09-17 (`b138bde`), not yet merged.** It is the
  only surface in this product with its own viewing distance. The question
  now scales fluidly (`clamp(1.5rem, 1rem + 2.6vw, 5.25rem)`: ~26px on a
  phone as before, ~83px at 2560 against the old fixed 30px), the column
  takes 2fr inside 110rem, the grid centres in the height it has, the team
  code reaches ~57px and the lobby QR goes 168px → 22rem because it is
  scanned from tables, not from the host's chair.

  **Gated at `xl` (1280px), not `2xl`** — on purpose. `2xl` starts at
  1536px and would have missed **1366x768**, the resolution of most
  projectors likely to be pointed at a pub wall. Verified by rendering the
  live desk at 2560, 1440, 1366, 1280, 1024 and 390: zero overflow at every
  size, phone view unchanged.

- **Two sessions duplicated the same fix on 2026-09-17, because neither knew
  the other existed.** This session and the QA-hardening session
  (`claude/zealous-ritchie-filqif`, PR #10) independently wrote the
  `SiteHeader` `flex-wrap` fix; the two diffs differ by one character
  (`gap-y-1` vs `gap-y-2`) and the `page.tsx` containers are identical.
  `SendMessage` cannot reach a cloud session from a sandbox — `ListAgents`
  reports no peers — so the working channel is **a comment on the PR the
  other session is subscribed to**. When more than one session is running on
  this repo, say so at the start of each and name the files each one owns.

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

New in the 2026-09-15 and 2026-09-17 sessions:

- **The local `master` branch in a fresh sandbox clone is STALE.** It sat at
  `d1b613d` while `origin/master` was `efb982c` — four merges and the whole
  rename behind. Nothing warns you: `git checkout master`, `git diff master`
  and `git merge master` all silently use the old commit, and on `d1b613d`
  files like `src/components/Wordmark.tsx` do not exist yet. This produced a
  confidently wrong measurement in the 2026-09-17 session (a probe reported
  "no bug on master" because it was measuring a pre-rename tree). **Always
  say `origin/master`**, or `git fetch origin master && git checkout
  --detach origin/master`, and check `git rev-parse --short master
  origin/master` before trusting any comparison against "master".
- **A stray `next dev` can hold the project directory while listening on no
  port at all.** The known "refuses a second instance" gotcha below assumes
  you can find the stray by its port; you cannot always. A `next-server`
  process survived with no socket bound, and every later `next dev` simply
  hung at startup with no error — twice, costing a screenshot run and an
  audit run. Check `pgrep -af next-server`, not just `ss -lntp`. Beware
  `pkill -f "next dev"`: the pattern matches the shell running it, so it
  kills your own command (exit 144). Kill by PID.

- **`prisma generate` runs only in `build`, never on install.**
  `package.json` has `"build": "prisma generate && prisma migrate deploy &&
  next build"` and **no `postinstall`**. The generated client lives in
  `node_modules`, so it is shared across branch switches and goes stale the
  moment the schema differs: a fresh checkout, or a move onto
  `claude/paddle-pro-3a`, gives tsc errors like `Property 'paddleEvent' does
  not exist` and a wave of bogus integration failures until you run
  `npx prisma generate`. Not a branch defect. Re-run it after every move
  between `master` and `paddle-pro-3a`.
- **`.next` route types survive a branch switch too.** After moving between
  branches, tsc fails on route types belonging to the *other* branch.
  `rm -rf .next` before `npx next typegen`.
- **`next lint` does not exist in Next 16** — it reads the argument as a
  path and tries to lint a directory called `lint`. Use `npm run lint`
  (plain `eslint`). The 2026-09-17 session also reports it pinned dependency
  versions as a side effect; that left no trace in the repo and was not
  reproduced here, so treat it as a reason to check `git status` after
  running it rather than as established fact.
- **The print page hangs Playwright if you emulate print media before
  clicking a tab.** `/packs/<id>/print` renders ONE `.paper-sheet` whose
  contents depend on a tab defaulting to `"script"`; the tab buttons are
  labelled "Presenter script", "Answer sheet" and "Question sheet", and they
  live inside `.print-chrome`, which `@media print` sets to
  `display: none !important`. With print media emulated every click waits
  forever on actionability. **Click first, emulate print afterwards.**

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
  **Piping to `tail` is the same trap**, and has now cost time twice:
  `cmd | tail -n 20 && echo CLEAN` tests `tail`'s exit code, so on
  2026-09-15 it printed CLEAN directly under 8 real tsc errors, and on
  2026-09-17 it swallowed a `next lint` failure so the `|| npm run lint`
  fallback never fired. Read the errors, not the banner.
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

## What landed in the second 2026-09-17 session — TriviaFoundry, a live phone bug, and the TV

Branch `claude/vibrant-mccarthy-nsbvf0`, head **`0cdd7b1`**, merged up to
`origin/master` `27e73b3` and mergeable. Six commits plus a merge. **No PR
opened** — the owner has not asked for one.

**`master` moved three times during this session.** PRs #8, #9 and #10 all
merged while the work was in flight; `master` is now **`27e73b3`** and
production deploys it, so **TriviaFoundry and the lifted palette are live**.
Anything below that reads as "not merged" means not merged *as of this
branch's head*.

### The wordmark is TriviaFoundry — merged with PR #9

The owner asked for a medial capital when the redesign landed; PR #9's first
commit answered it with colour instead. Asked again here, and the answer was
**both**, because they are not competing fixes: the capital is structural and
lives in the string, so it is the only one that reaches the tab title, the
PWA install prompt, `manifest.short_name`, a Paddle receipt and one-colour
reproduction; the two-tone is atmospheric and is why the mark reads as a sign
that is switched on. Full reasoning is in `Wordmark.tsx`'s doc comment.

Two arguments the two-tone commit gave for dropping the capital were wrong
and are recorded so nobody re-runs them: the F is five characters from the T
rather than adjacent, and a lowercase domain under a camel-cased mark is the
oldest convention on the web. 29 strings moved; the domain stays lowercase.
**`scripts/render-icons.ts` draws only the coaster mark**, so no brand-name
change can ever touch the icon set — the earlier claim that it could was
wrong and is corrected above.

### A horizontal-scroll bug that was live in production

Found by the owner asking whether the wordmark had been checked across sizes.
It had not. Measured on `origin/master` `efb982c`, which production was
serving: **85px of horizontal scroll at 320, 45 at 360, 15 at 390** — 390 is
a standard iPhone — and clean at 430. At 320 the nav was pushed off the right
edge and only "Create" survived.

The capital F added exactly **5px** of that, matching the measured glyph
delta to the pixel. **~94% of the bug was already shipped.**

Fixed with `flex-wrap` on the two header rows. A smaller wordmark cannot fix
it: 280px of usable width has to hold a ~201px sign and a ~217px nav.

**Only that row was ever affected.** `/play`, `/host/<code>` and the team
join screen — the one player surface carrying the brand — measured zero
overflow at 320, 360, 390, 1024 and 2560.

**PR #10 independently wrote the same fix**, differing by one character
(`gap-y-1` vs `gap-y-2`). See "Two sessions, one fix" below.

### `e2e/narrow-viewport.spec.ts` — the blind spot that let it ship

Nothing in the suite used a viewport narrower than a desktop. That is why a
green gate said nothing, and it is the same blind spot that hid the
print-preview bug. The spec asserts zero horizontal scroll at 320/360/390/430
across `/`, `/create`, `/terms`, `/privacy`, `/refunds`, and **was verified to
fail before the fix** — 15 red at the three narrow widths, the 5 at 430 green.
It carries a control that injects an over-wide element and asserts the check
does fire, so it cannot pass vacuously against a page that never rendered.

### The host desk, for TV viewing distance

The desk is the only surface in this product with its own viewing distance —
it goes on a TV or a projector and is read from about four metres — and it was
laid out like an ordinary desktop page. At 2560x1440 everything sat in the top
quarter of the screen inside a 1152px column with the question at roughly 30px.

- Question type is **fluid, not stepped**, because a pub screen is any size:
  `clamp(1.5rem, 1rem + 2.6vw, 5.25rem)` — ~26px on a phone (unchanged),
  ~49px at 1280, **~83px at 2560**.
- Question column takes **2fr inside 110rem** and the grid centres in the
  height it has. The first attempt kept `max-w-6xl`/1.4fr and the question
  still wrapped to three lines with half the screen empty.
- Team code ~57px; the **lobby QR goes 168px → 22rem**, since it is scanned
  from tables across the room, not from the host's chair.

**Gated at `xl` (1280px), not `2xl`, on purpose.** `2xl` starts at 1536px and
would miss **1366x768**, which is what most projectors pointed at a pub wall
report.

**Two mistakes worth knowing about**, both caught by looking again rather than
by any test:

- The widening left the header at `96rem`/`px-8` against the main's
  `110rem`/`px-12` — a crooked left edge on exactly the screen the work was
  for. The merge surfaced it.
- **The first fix for that was also wrong.** Matching the two max-widths and
  paddings *by value* is not enough: the header set its padding on the
  `<header>` element, outside the max-width box, while `<main>` sets both on
  one element. Same numbers, different box model, still 48px apart at 2560.
  Fixed by mirroring `<main>`'s box model, and **measured** —
  `getBoundingClientRect().left` on both, delta 0 at 2560/1920/1366/1024/390.

### Two sessions, one fix

A second session (`claude/qa-hardening`, PR #10, now merged) was hardening the
app at the same time and **independently wrote the identical `SiteHeader`
fix**. Neither session knew the other existed until this one went looking.

`SendMessage` **cannot reach a cloud session from a sandbox** — `ListAgents`
reports no peers. The channel that works is **a comment on a PR the other
session is subscribed to**. Two were posted on PR #10: one claiming
`HostDashboard.tsx` before touching it, one releasing it.

The merge resolved the way this session proposed publicly beforehand:
master's `SiteHeader` taken wholesale, and `HostDashboard.tsx` kept from this
branch because it is a strict superset of PR #10's four edits to that file.

**When more than one session is running on this repo, say so at the start of
each and name the files each one owns.** Two agents shipping the same diff is
cheap to prevent and annoying to unpick.

### Gate

On the merged tree: `prisma generate`, tsc clean, eslint 0 errors (the
pre-existing `alt` warning in `documents.tsx`), `next build` clean,
**unit 169, integration 153, e2e 32/32** (11 original + 21 narrow-viewport).
Unit and integration are up on this branch's own numbers because PR #10's
suites arrived with the merge.

### Not done

- **`/privacy` still needs its Paddle paragraphs** before PR #4 merges — see
  Open items. Unchanged by this session.
- **Nothing here has been seen on a deployment.** The desk was rendered
  locally at six widths; the sandbox cannot reach `*.vercel.app`.
- The `claude/zen-feynman-xtoljd` branch is still there, to delete once this
  branch is on `master` (its content is folded in above).

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
**"Triviafoundry Pro"** in Task 10 Step 2, the live client token is
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

The wordmark was first shipped **two-tone but not camel-cased** — cream
"Trivia", neon amber "foundry". That is **superseded**; see "The wordmark is
now TriviaFoundry" below. The original reasoning is kept here as the record
of the decision, and two of its arguments turned out not to hold.

`src/app/stage-palette.test.ts` guards the thing that actually broke: the
perceptual floor and the gaps between the three surfaces, **not** contrast.
Verified to fail on the old values before being committed — two assertions go
red while the AA assertion stays green, which is exactly why a contrast check
would have waved the broken palette through.

Gate: tsc clean, eslint 0 errors, `next build` clean, **unit 157, integration
145, e2e 11/11**. Share card and README screenshots regenerated from their
own scripts. (This entry originally said the icons were regenerated too.
They were, but needlessly: `scripts/render-icons.ts` draws only the coaster
mark and never the wordmark, so **no brand-name change can affect the icon
set**. The same correction applies to the "cheap to change" note that used
to be in the paragraph above.)

### The wordmark is now TriviaFoundry — `45df975` on `claude/stage-lift`

Decided by the owner on 2026-09-17, after the two-tone landed. **The capital
is back and the colour stays**: cream "Trivia", neon amber "Foundry". Same
branch, same PR #9 — a second commit on top of `2709f95`, no history
rewritten.

The reason they are not competing answers: they fail in different places.
The **medial capital is structural** — it lives in the string, so it is the
only one that reaches what we do not render (the tab title, the PWA install
prompt, `manifest.short_name`, the app switcher, a Paddle receipt, someone
typing the name into a group chat), and the only one that survives
one-colour reproduction. The **two-tone is atmospheric** — it is why the
mark reads as a sign that is switched on rather than a logo that happens to
be orange. Alfa Slab One has a large x-height and short ascenders, so the
capital separates less forcefully here than it would in a text face, which
means the colour is carrying real weight at header sizes rather than
decorating. Keep both; drop either and the seam returns somewhere.

**Both arguments the two-tone commit gave for dropping the capital were
wrong**, and are worth recording so they are not re-run:

- *"A capital F mid-word plants a second thick vertical right against the
  T."* The F is five characters from the T (`T-r-i-v-i-a-F`). They are not
  adjacent and do not collide.
- *"A second casing above `triviafoundry.com` would read as two different
  names."* A lowercase domain under a camel-cased mark is the oldest
  convention on the web — YouTube/youtube.com, GitHub/github.com — and the
  medial capital exists *because* domains flatten compound names. The
  domain is unchanged and stays lowercase everywhere.

29 strings moved: `Wordmark.tsx` (markup, `aria-label` and the doc comment,
which now carries this reasoning), `SiteFooter.tsx`, `layout.tsx` metadata,
`manifest.ts`, `globals.css`'s header comment, `page.tsx`, the three legal
pages, `README.md`, `manifest.test.ts` and `e2e/pwa.spec.ts`. The footer's
brand credit also picked up the two-tone treatment, which it should have had
from the start instead of flat gold.

Gate re-run in full on the merged result: `prisma generate`, tsc clean,
eslint 0 errors (the one pre-existing `alt` warning), `next build` clean,
**unit 157, integration 145, e2e 11/11** — every number matching `2709f95`'s
baseline. Verified out of the build output rather than by eye: `<title>`,
`og:site_name`, `og:title`, `application-name`, `apple-mobile-web-app-title`
and the manifest `name`/`short_name` all read "TriviaFoundry", `og:image` is
still absolute on the lowercase domain, and the footer renders
`TriviaFoundry · by Yanshuf Studio` with the spacing intact. `public/og.png`
and the README screenshots were regenerated; `04-print-preview.png` did not
change, correctly, because the print sheet carries no header or footer.

**Still needs a human with a browser**, unchanged from the two-tone entry:
whether the lifted darkness is right is a judgement call, not a test result.
Re-scrape LinkedIn Post Inspector after this deploys — the card bytes
changed, though `metadataBase` and the URL did not.

**One thing this does not reach.** `docs/superpowers/plans/2026-09-09-paddle-pro.md`
on `claude/paddle-pro-3a` names the live Paddle catalog **"Triviafoundry
Pro"**. That branch was not touched here. It needs to become "TriviaFoundry
Pro" before Task 10 creates the live product, because the product name is
what a buyer reads at checkout.

### The `claude/zen-feynman-xtoljd` fold — closed

That branch was one commit (`7e1547f`, HANDOFF.md only, cut from `6ea006f`)
carrying an earlier 2026-09-15 fold that never reached `master`. Every item
on it has now been checked against this file and against the tree; the live
ones are in Open items and Gotchas above, and the branch carries nothing
else, so **it can be deleted**.

Dropped as superseded:

- Its rewrite of the "State correction" block, which pinned `master` at
  `6ea006f` and PR #4 at `c2f0dfc`. Both moved the same day; the 2026-09-17
  section above is the current record.
- Task 10 Step 1 correction (1), the account-wide default payment link —
  already applied to the plan, see the 2026-09-16 section.
- The `next.config.ts` `VERCEL_ENV === "production"` gotcha — already on
  record above, as the reason PR #4's green CI is *not* evidence that its
  production build will succeed.

Kept, because nothing else on `master` or PR #8 recorded them: the
`/privacy` revision, the sandbox creator row and the checkout-branding
conflict (Open items); the `prisma generate`, `.next` route-types and
print-page/Playwright gotchas (Gotchas). Each was re-verified against the
tree rather than transcribed — `package.json` has no `postinstall`;
`paddle-pro-3a`'s `Creator` really does gain four Paddle columns plus a
`PaddleEvent` table that `/privacy` never mentions; `.print-chrome` really
is `display: none` under `@media print` with the tab buttons inside it. The
one exception is the `next lint` bullet, which this sandbox could not
re-check because `node_modules` is not installed here; it stays on the
2026-09-17 session's authority and says so.

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
  catalog fresh — name it "Triviafoundry Pro" there), the seller display
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
copy should say "Triviafoundry Pro", not "Pub Quiz Pro", when it lands.

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

## Next

*Trued up 2026-09-17, second session. The previous list led with "merge the
rename PR" and "verify the print page-break fix"; the rename merged as PR #7
and the whole 0-4 list below it has been rewritten against `master`
`27e73b3`.*

1. **Verify the generation fixes against the real model on production** —
   still the oldest unpaid debt, and still the thing that has been closed
   twice on a green suite and reopened twice. The three-step gate and its
   cautions (free-cap 403 vs limiter 429, fresh incognito per 2 generations,
   never set `FREE_PACK_LIMIT` on production, clean up the packs you create)
   are in Open items. Needs a browser; independent of everything else here.

2. **Look at `triviafoundry.com` on a phone and a TV.** Three things landed
   today that have only ever been seen locally: the TriviaFoundry wordmark
   and lifted palette (live now, via PRs #9 and #10), the header wrap fix
   (live via PR #10), and the host desk rescale (**not** live — it is on
   `claude/vibrant-mccarthy-nsbvf0`). A real phone at 390px and a real TV or
   projector are the two checks a sandbox cannot make.

3. **Decide what to do with `claude/vibrant-mccarthy-nsbvf0`.** It is merged
   up to `master`, gate green, and carries the desk rescale plus the
   narrow-viewport spec. It needs either a PR or a direct merge — say which.

4. **Give `/privacy` its Paddle paragraphs** before PR #4 merges. This is now
   a gate on PR #4 in its own right, not a nicety. A draft exists off-repo and
   was never committed.

5. **Task 10, the live Paddle cutover** (owner-gated). Website-approval
   prerequisite satisfied since PR #6. Before it: rename the live catalog to
   **"TriviaFoundry Pro"** in the plan (it still says "Triviafoundry Pro" on
   `claude/paddle-pro-3a`, and the product name is what a buyer reads at
   checkout), settle the account-wide "OrZarua" checkout branding against
   what `/terms` says, and resolve the sandbox-origin creator row sitting in
   the production Turso DB. All three are in Open items. Then phase 3b
   (Tasks 11-12, the restore-token library and routes).

6. **Verify the print page-break fix** — still only in the owner's working
   tree, so still neither deployed nor verifiable from a sandbox. Commit it
   first. Unchanged from the last three handoffs.

7. **Delete `claude/zen-feynman-xtoljd`** once this branch is on `master`.
   Its live content is folded into Open items and Gotchas; it carries nothing
   else.

Still unanswered, asked more than once, and needed for **Task 10 only**:
reuse the HebCal Paddle seller account or open a separate one? The other
long-standing question — monthly, annual, or both at launch — was answered by
building both: PR #4 ships monthly $5 and annual $25.

**PR #5 and PR #6 were merged to `master` on the owner's explicit
instruction, 2026-09-15** — the standing "nothing gets merged or approved"
rule was lifted for those two only. PR #4 is untouched and remains the
owner's call. `master` deploys to production on push, so both merges are
live.
