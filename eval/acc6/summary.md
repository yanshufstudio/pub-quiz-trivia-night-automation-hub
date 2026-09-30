# ACC6: Sonnet 5.5 vs Opus 5.5 as the pack writer

Run on Wed 30 Sep 2026, locally, from the `eval/acc6-results` worktree, with the
"acc6-eval" key. Measurement only: nothing production reads was changed.

- **G3**: production's generator. `claude-opus-5-5`, thinking default, effort low, auto-strict.
- **G4**: `claude-sonnet-5-5`, thinking default (adaptive), effort medium, auto-strict.
  Sonnet 5.5 returns a 400 on forced `tool_choice` (`any`/`tool`), the same as
  Opus 5.5. So auto-strict (`tool_choice: auto` plus a `strict: true` tool) is
  the only tool mode it supports. That comes from the claude-api skill's
  Sonnet 5.5 notes, and G4 ran 21 of 21 calls without an API error.
- **Checker**: C2 on every pack (`claude-opus-5-5`, effort low, auto-strict, blind), the same as production.

## Runs

| folder | what | spent |
|---|---|---|
| `2026-09-30T16-45-21-008Z` | smoke test: G4 × 90s-pop | $0.02 |
| `2026-09-30T16-45-42-673Z` | the 10 ACC5 briefs × 1, G3 and G4 | $1.60 |
| `2026-09-30T16-56-32-804Z` | short-6 × 10, G3 and G4 | $0.62 |
| **total** | against an $8 cap; dry-run estimate was $4.1 | **$2.24** |

The short-6 brief: "A short pub quiz: 2 rounds of 3 questions each. Round 1: 90s pop music. Round 2: UK geography. Keep answers short."

The harness changes are harness-only commits: ACC6b adds G4, ACC6c adds
short-6 and `--repeat`, and ACC6d records failed generations' cost, attempts
and ACC8 retry reasons.

## 1. Short packs and failed validation

| | G3 (Opus 5.5 low) | G4 (Sonnet 5.5 medium) |
|---|---|---|
| packs attempted | 20 | 20 (+1 smoke) |
| UnusableModelOutputError | 0 | 0 |
| IncompletePackError | 0 | 0 |
| short before the ACC8 retry (attempt 1 malformed or short) | 1 | 0 |
| short after the retry (returned short) | 0 | 0 |
| truncated / questions dropped by salvage | 0 / 0 | 0 / 0 |
| short-6 failures | **0 of 10** | **0 of 10** |

- G3 × large needed one retry. Its first attempt failed with `a multiple-choice answer is not one of its options`, and the second attempt returned 50 of 50 questions.
- The #40 walk's failure did not reproduce: G3 went 0 for 10 on short-6 here, against 2 of 3 on the walk. Output tokens per short-6 pack were 506–559 for G3 and 423–487 for G4. The walk's failure had `gen_out` 281.
- **What validation does not catch.** On `hebrew`, G4 wrote "לא נדרש" ("not required") as the answer to 6 of the 8 questions in round 2 (Israeli pop). A placeholder answer passes the schema, which only requires a non-empty string. C2 caught all 6: it dropped 5 (R2Q2, R2Q3, R2Q5, R2Q7, R2Q8) and fixed 1 (R2Q6). Without the checker, that pack would ship with 6 unanswerable questions. G3 had nothing like this on any brief.

## 2. The 19:03 failure: which validation failed, and why there was no retry

This comes from reading `src/lib/generate-pack.ts` at ebd5a65. It is the same
file on master 8480778. The failure did not reproduce in this run.

- "Generated quiz pack failed validation" is thrown at `generate-pack.ts:520`. That happens when the tool call is not truncated, `generatedPackSchema` fails, **and** `salvageGeneratedPack` returns null. Salvage returns null in two cases: when `rounds` is missing or not an array, or when no round keeps at least one valid question.
- `rounds` is optional in the strict tool schema. `required` lists only `requested_rounds` and `requested_questions_per_round` (ACC13), because a decline sends no rounds. So a call carrying the counts and no rounds, or rounds with no valid questions, is schema-valid for the API and fails here.
- The walk's `gen_out` of 281 tokens, against 509 for the good 6-question pack, fits a call with the counts and little or no round content. **The exact zod issue is not known from this run.** It is appended to the error message (`...failed validation: ${parsed.error?.message}`), so it is in production's log for the 19:03 request. I did not read production logs.
- **Why there is no retry.** `generateQuizPack` (line 428) rethrows `UnusableModelOutputError` straight away. ACC8's one retry only covers `MalformedPackError`: short packs, short rounds and broken options (`checkCounts`, `repairQuestion`). An empty or missing `rounds` never reaches `checkCounts`, because salvage fails first. So it gets attempts=1. The 19:05 failure was a short pack, a `MalformedPackError`, so it was retried once before becoming `IncompletePackError`.
- **Fix (not implemented).** In `generateOnce`, when `!truncated` and salvage returns null, throw `MalformedPackError` (with a "came back empty, generate again" host message) instead of `UnusableModelOutputError`. That gives it ACC8's single retry and then `IncompletePackError`, the same as a short pack. Keep `UnusableModelOutputError` for the truncated case, where retrying cannot help. Optionally, also make `rounds` required in the tool schema and let a decline send `rounds: []`: `decline_reason` is checked before the parse, so a decline would still be caught.

## 3. Cost and time per pack (average; generation + C2 check)

| | G3 gen | G3 check | **G3 total** | G4 gen | G4 check | **G4 total** |
|---|---|---|---|---|---|---|
| all 20 packs | $0.030 / 12.1s | $0.033 / 12.7s | **$0.063 / 24.8s** | $0.012 / 6.6s | $0.036 / 13.9s | **$0.048 / 20.5s** |
| 10 ACC5 briefs | $0.043 / 17.9s | $0.045 / 16.9s | $0.088 / 34.8s | $0.015 / 9.4s | $0.057 / 20.8s | $0.072 / 30.1s |
| short-6 (n=10) | $0.018 / 6.2s | $0.020 / 8.6s | $0.038 / 14.8s | $0.008 / 3.9s | $0.016 / 7.0s | $0.024 / 10.9s |
| large (n=1) | $0.116 / 49.5s | $0.092 / 33.2s | $0.208 / 82.7s | $0.026 / 14.8s | $0.108 / 37.8s | $0.134 / 52.6s |

- **Output tokens per pack.** G3 averaged 1,135 (range 475–5,069; large 5,069, including its retry). G4 averaged 806 (range 423–2,212; large 2,212).
- **Thinking tokens.** G4 reported 0 on every pack at medium effort. G3 reported 0 except on hebrew (850).
- G4's generation costs about 60% less, but its packs cost more to check (more flags), so the total per pack is about 24% lower. G3's large-pack time includes its retry.

## 4. Checker fixes and drops (C2)

| | questions | fixed | dropped | flagged |
|---|---|---|---|---|
| G3 (all) | 269 | 9 | 0 | 3.3% |
| G4 (all) | 269 | 23 | 6 | 10.8% |
| G3, ACC5 briefs | 209 | 5 | 0 | 2.4% |
| G4, ACC5 briefs | 209 | 21 | 6 | 12.9% |
| G4, ACC5 briefs without hebrew | 185 | 17 | 0 | 9.2% |
| G3 / G4, short-6 | 60 / 60 | 4 / 2 | 0 / 0 | 6.7% / 3.3% |

Every review completed, with 0 questions left unreviewed. G4 was flagged about
5× as often as G3 on the ACC5 briefs, and about 4× without hebrew. That is an early proxy only: the
fact-check below is what counts.

## 5. Files for the fact-check

- `eval/acc6/2026-09-30T16-45-42-673Z/factcheck.csv` (ACC5 briefs) and `eval/acc6/2026-09-30T16-56-32-804Z/factcheck.csv` (short-6). The layout is the same as ACC5's `factcheck.csv`, and the header is byte-identical. Filter on `generator = G4` for B's questions. The C1 and C1s columns are empty, because only C2 ran.
- Repeat runs appear as `short-6`, then `short-6#2` to `short-6#10`, in the `brief` column and in the run file names.
- `runs/*.json` holds, per pack: the questions before review, C2's verdicts and blind answers, the questions after, usage, attempts, and ACC8 retry warnings.
