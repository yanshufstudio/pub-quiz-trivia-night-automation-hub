# Handoff — 2026-09-13

Live: https://pub-quiz-trivia-night-automation-hu.vercel.app
Repo: https://github.com/yanshufstudio/pub-quiz-trivia-night-automation-hub
(moved from `privlin-lgtm`; Vercel deploys `master` on push)

Supersedes the 2026-09-09 handoff. Anything not repeated here is in git
history — `git show 86069bd:HANDOFF.md` for the previous one, which still has
the full record of the 2026-09-07→09 work.

## Where things stand

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

*Trued up 2026-09-15 against `master` `80ca6fd` and PR #4 `d16a99f`. The
PR #3-era entries that used to be here (test the preview not production;
previews are building again; media phases 2-4 are local-only) are gone
because PR #3 merged as `5982f76` — the history is in the session sections
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
  `https://pub-quiz-trivia-night-automation-hu.vercel.app` (production *is*
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

*Trued up 2026-09-15. The previous list still said "verify PR #3 on a
preview" and "build media phases 2-4"; both are done and merged.*

1. ~~Paddle Task 9~~ — **passed 2026-09-15**, off-sandbox. See Open items.
2. **Verify the generation fixes against the real model on production** —
   the three-step gate and its cautions are in Open items. Independent of
   the Paddle work; whoever has a browser can do it. Still the oldest
   unpaid debt here.
3. **Verify the print page-break fix**, which as of this merge exists only
   in the owner's working tree — no branch on `origin` carries it, so it is
   neither deployed nor verifiable from a sandbox. Commit it first.
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
