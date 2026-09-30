# ACC7: generation stress run

Run on Wed 30 Sep 2026, locally, from the `eval/acc7-results` worktree, with
the "acc5-eval" key. Measurement only: nothing production reads was changed.
The generator code under `src/` is identical to master 8480778.

- **G3**: production's writer. `claude-opus-5-5`, thinking default, effort low, auto-strict.
- **G5**: the same at effort **medium**. Run only on the briefs G3 failed, to test whether more effort fixes them.
- **Checker**: C2 on every pack (`claude-opus-5-5`, effort low, auto-strict, blind), as in production.

## Runs

| folder | what | spent |
|---|---|---|
| `2026-09-30T17-32-19-062Z` | smoke test: G3 × 90s-pop | $0.04 |
| `2026-09-30T17-32-44-122Z` | G3 × the 12 awkward briefs × 3 | $3.12 |
| `2026-09-30T17-53-03-826Z` | G3 × the 10 ACC5 briefs + short-6 × 3 | $2.46 |
| `2026-09-30T18-09-46-967Z` | G5 × kids, all-mc, hebrew-israel, quantum, one-word, hebrew, music, short-6 × 3 | $2.24 |
| **total** | against a $10 cap | **$7.86** |

`analysis-G3.md` and `analysis-G5.md` hold the full per-writer report from
`scripts/acc7-analyse.ts`: every failure with its validation text, every short
or retried pack, placeholder and duplicate checks, and the cross-repeat table.
The smoke test is left out of the G3 numbers.

## 1. Headline

**G3 fails 7 of the 66 briefs it should write (10.6%), and needed the ACC8
retry on another 4.** The 3 declines were correct. The dominant cause is one
shape: the tool call comes back with **one question** (rounds `[1]` or `[1,1]`)
instead of the pack. ACC8 retries it, but the retry often does the same thing.

**G5 (medium effort) is worse, not better: 11 of 24 failed (46%)** on the same
briefs, with the same one-question shape. More effort does not fix it.

## 2. Per writer

| | G3 (Opus 5.5 low) | G5 (Opus 5.5 medium) |
|---|---|---|
| runs | 69 (66 writable + 3 decline) | 24 (all writable) |
| packs returned | 59 | 13 |
| UnusableModelOutputError (no retry) | 3 | 2 |
| IncompletePackError (after the ACC8 retry) | 4 | 9 |
| ModelDeclinedError | 3 (all on the decline brief, correct) | 0 |
| ACC8 retries used | 8 (4 recovered, 4 failed) | 11 (2 recovered, 9 failed) |
| first attempt unusable, any cause | 11 of 66 (17%) | 13 of 24 (54%) |
| truncated / salvage-dropped | 0 / 1 question (cats-1x1) | 0 / 0 |
| short packs returned to the host | 0 | 0 |
| placeholder answers | 0 (1 false positive: "X", the correct answer to the Twitter logo question) | 0 |
| duplicate questions within a pack | 0 | 0 |
| cost per pack incl. C2: avg / p90 / max | $0.081 / $0.142 / $0.343 | $0.093 / $0.161 / $0.180 |
| time per pack incl. C2: avg / p90 / max | 31.6s / 57.4s / 129.1s | 43.9s / 80.7s / 105.9s |
| generation time only: avg / p90 / max | 17.0s / 35.6s / 74.5s | 36.9s / 80.7s / 105.9s |
| C2 fixed / dropped / unreviewed | 43 / 0 / 0 over 1,471 questions | 2 / 0 / 0 over 247 |
| C2 review failures | 1 (see §3.5) | 0 |

Cost and time per pack include failed runs, since a failure is paid for too.

## 3. Findings

### 3.1 The one-question tool call (both writers)

A first attempt returns rounds `[1]` or `[1,1]` whatever the brief asked for.
It hit briefs of every kind: kids (both G3 failures), all-mc, hebrew, music,
hebrew-israel, quantum, one-word. It costs little (about $0.01) and is fast,
which says the model stopped writing almost at once.

Two of G3's three UnusableModelOutputError failures (hebrew-israel and
quantum#3) have the same fingerprint: small cost, and the validation error is
on the first question only, `rounds[0].questions[0].options[0]` "expected
string to have >=1 characters". Question 1 of 14 of the 28 G3 packs in the
awkward batch carried an `options` array on a TEXT question (`[]`, `["s?"]`,
or, on cats-1x1, `["Manx"]`, the answer). So the model fills `options` on
question 1 even for text questions, and when that value is `""` the whole pack
fails strict validation with no retry. That is known issue (a), the 19:03
failure, with a likely trigger identified.

The third shape is `rounds` returned as a string, not an array (G3 one-word#3;
G5 one-word and music#2). Also UnusableModelOutputError, also no retry.

### 3.2 Short by one

G5 twice returned 23 of 24 (`[7,8,8]`) and once 31 of 32. G3 once returned
23 of 24 before its retry recovered. ACC8 catches it, but the retry is a full
second generation for one missing question.

### 3.3 "All multiple choice" came back as free text

G3 all-mc (run 1) returned 40 questions typed **TEXT**, each with four valid
options and the answer among them. `create-pack.ts:58-60` stores options only
for MULTIPLE_CHOICE, so the host who asked for all multiple choice gets a
free-text pack with no warning. Neither the count check nor C2 looks at
question type. Run 3 got it right (40 MULTIPLE_CHOICE); run 2 failed.

### 3.4 The decline reason is API boilerplate

All three decline runs ended in ModelDeclinedError with 0 output tokens and
this reason: "API integrators: you can reduce refusals for your users by
configuring a fallback model — see https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback".
It comes from `stop_details.explanation`, which `declineReason` prefers
(`generate-pack.ts:245-247`), and the route shows the reason to the host. The
host is told about fallback models, not why the brief was declined.

### 3.5 A C2 review failed on a normal pack

`large` (run 1): the blind review returned 400 "Output blocked by content
filtering policy" on a standard 5×10 pub pack. In production that pack is
saved as not checked. One occurrence in 59 reviews.

### 3.6 The same questions come back on every regenerate

Share of a pack's questions that also appear in another run of the same brief
(same normalised text, or the same answer with at least half the words shared):

| brief | G3 | G5 |
|---|---|---|
| short-6 | 83% | 72% |
| kids | (1 pack) | 80% |
| kids-no-pop | 76% | |
| science | 73% | |
| geography | 65% | |
| large | 63% | |
| music | 63% | |
| half-hebrew | 61% | |
| history | 60% | |
| uneven | 60% | |
| film-tv, sport | 58% | |
| 90s-pop | 53% | |
| hebrew-israel | 53% | |
| all-mc | 48% | 47% |
| big-8x15 | 46% | |
| hebrew | 43% | |
| fun-quiz | 43% | |
| picture-music | 40% | |
| quantum | 5% | 15% |

A host who regenerates because they did not like a pack gets roughly half to
four-fifths of the same questions back. No pack repeated a question within
itself.

### 3.7 What held up

- **big-8x15** (120 questions): 3 of 3 complete, no truncation, 47–75s to
  generate, 129s at most including C2. Inside the route's 300s.
- **uneven** (5, 8, 12): 3 of 3 exact.
- **cats-1x1**: 3 of 3 with one question.
- **picture-music**: 3 of 3 turned the picture and music rounds into word
  questions (2 rounds of 10), as the prompt asks.
- **Hebrew and mixed-language briefs**: no placeholder answers from G3 (unlike
  G4 in ACC6).
- **kids-no-pop**: 3 of 3 complete.
- **decline**: 3 of 3 declined, nothing substituted.
- **C2 dropped nothing** across 1,718 questions; it fixed 45.

## 4. What this means for the generation backlog

- **3.1 is the biggest generation fix.** Known issue (a) plus the one-question
  shape account for all 7 of G3's real failures. Two cheap changes: drop
  `options` from TEXT questions before validation, so a stray `""` cannot fail
  the pack, and send UnusableModelOutputError when `!truncated` through the
  ACC8 retry (the proposed MalformedPackError fix). The retry alone is not
  enough: kids failed both attempts twice.
- **3.3** needs the question type the brief asked for to be checked, or at
  least reported, the way counts are.
- **3.4** needs `declineReason` to prefer the model's own text over
  `stop_details.explanation`, or to recognise the boilerplate and use the
  default wording.
- **3.5** is backlog item 7's shape from the other side: a review API error
  leaves the pack unchecked.
- **3.6** is a product question, not a bug: regenerate could pass the previous
  pack's questions as ones to avoid.
- **G5 is not the fix.** Medium effort failed more often and took twice as long.
