# ACC7 re-run: G3 on the generation-hardening branch (#42)

Thu 2 Oct 2026, run locally from the `eval/acc7-gh-rerun` worktree. It is
measurement only: nothing under `src/` differs from #42's head.

- **Code:** #42 `claude/gen-hardening` at 3e3901c (GH1–GH7, plus master 77fc918). The harness commit was rebased on top, giving `eval/acc7-gh-rerun` head 3849c8f before these results.
- **Writer:** G3, production's, unchanged: `claude-opus-5-5`, thinking default, effort low, auto-strict.
- **Checker:** C2, `claude-opus-5-5`, effort low, auto-strict, blind.
- **Briefs and invocation:** the same as ACC7's G3 runs. The 12 awkward briefs × 3 (`--repeat 3`), then the 10 ACC5 briefs plus short-6 × 3. G3 only, no G5.

| folder | what | spent |
|---|---|---|
| `2026-10-02T08-03-40-330Z` | 12 awkward briefs × 3 (36 runs) | $3.62 |
| `2026-10-02T08-26-01-602Z` | 10 ACC5 briefs + short-6 × 3 (33 runs) | $2.73 |
| **total** | 69 of 69 planned runs; nothing skipped | **$6.35** (cap $8) |

**Cap note.** The first batch ran with a $4.00 stop. The second batch's stop
should have been $7.70 minus the first batch's spend. My shell script parsed
the first spend as "3.62." (with a trailing dot), so the second batch's
`--budget` was `NaN` and the harness stop was not armed for it. Total spend
still stayed under the cap: $6.35 against $8.

`analysis-G3.md` is `npx tsx scripts/acc7-analyse.ts` over both folders, in
the same shape as ACC7's `analysis-G3.md`.

## Before (ACC7, master 8480778) vs after (#42, 3e3901c)

| | before | after |
|---|---|---|
| runs | 69 (66 writable + 3 decline) | 69 (66 writable + 3 decline) |
| packs returned | 59 | **64** |
| failed | 10 | **5** |
| IncompletePackError | 4 | 2 |
| ModelDeclinedError (decline brief, correct) | 3 | 3 |
| UnusableModelOutputError | 3 | **0** |
| writable failures | 7/66 = 10.6% | **2/66 = 3.0%** |
| ACC8 retries used / recovered | 8 / 4 | 17 / 15 |
| first-attempt unusable (writable) | 11/66 (16.7%) | **17/66 (25.8%)** |
| short packs returned to the host | 0 | 0 |
| all-mc question type | run 1 came back as TEXT (40 Qs) | 3/3 runs 40/40 MULTIPLE_CHOICE |
| decline wording the host sees | the API's fallback-model boilerplate | "The question generator declined this brief. Try describing a different quiz." |
| C2 review failures | 1 (large: content-filter 400) | **0** |
| C2 fixed / dropped | 43 / 0 over 1,471 Qs | 42 / 0 over 1,598 Qs |
| total spend | $5.59 | $6.35 |
| cost per pack incl. C2 (avg / p90 / max) | $0.081 / $0.142 / $0.343 | $0.092 / $0.149 / $0.467 |
| time per pack incl. C2 (avg / p90 / max) | 31.6s / 57.4s / 129.1s | 34.6s / 51.5s / 167.4s |
| generation time only (avg) | 17.0s | 18.7s |

The after rate counts what the retries now catch: 17 first attempts were
unusable, and 15 of them recovered on the ACC8 retry. Before, 11 first
attempts were unusable, and 3 of those (the UnusableModelOutputError ones)
were never retried. Cost and time per pack are up mostly because there were
more retries (17 against 8). Whether the higher first-attempt rate is a real
change or run-to-run variance can't be told from one run of 66.

The all-mc row reflects GH3: the generator now turns a TEXT question with a
usable option set into MULTIPLE_CHOICE before validation. So 40/40 MC shows
what the host gets, not how the model typed the questions.

## What happened to each before-failure

| before failure | error | after | why |
|---|---|---|---|
| hebrew-israel | UnusableModelOutputError: empty option string (`options[0]` too_small) | 3/3 ok (#2 retried for a different fault) | **GH1**: the response is tidied before validation, and blank options are dropped. 0 empty-option failures in 69 runs. |
| quantum#3 | UnusableModelOutputError: empty option string | 3/3 ok, no retries | **GH1**, as above. |
| one-word#3 | UnusableModelOutputError: `rounds` returned as a string | 3/3 ok | **GH2**: an unreadable response is now retried instead of failing on attempt 1. The fault recurred twice here: film-tv#2 attempt 1, which recovered on retry, and half-hebrew#3 attempt 2, which then failed as IncompletePackError rather than UnusableModelOutputError. |
| one-word | IncompletePackError: a multiple-choice answer is not one of its options (twice) | 3/3 ok, but all 3 hit the same fault on attempt 1 and recovered on retry | **Not fixed by any GH item.** The fault is unchanged; the retry happened to succeed this time. |
| all-mc#2 | IncompletePackError: short pack, 2 of 40 | 3/3 ok, no retries | **No GH item targets this**; run-to-run variance. |
| kids, kids#2 | IncompletePackError: short pack, 1 of 10 (twice each) | 3/3 ok, no retries | **No GH item targets this**; variance. |
| decline × 3 | ModelDeclinedError (correct) | still declined, 3/3 (correct) | **GH4**: the host no longer sees the API's fallback-model boilerplate (see the wording above). |

## New failures

- **fun-quiz#3** (IncompletePackError, 2 attempts, $0.024, 9.8s): `IncompletePackError: short pack: 1 of 32 questions, rounds [1] of [8,8,8,8]`. Both attempts returned 1 question.
- **half-hebrew#3** (IncompletePackError, 2 attempts, $0.044, 21.1s): attempt 1 was `short pack: 1 of 12 questions, rounds [1] of [6,6]`; attempt 2 failed with `Generated quiz pack failed validation: … "path": ["rounds"], "message": "Invalid input: expected array, received string"`.

## The 17 unusable first attempts, by shape

- **A pack of 1–2 questions against a stated count of 6–40 (9):** fun-quiz#3, half-hebrew, half-hebrew#2, half-hebrew#3, film-tv#3, music, science#2, short-6, short-6#2. This shape is behind both new failures. No GH item addresses it.
- **A multiple-choice answer not among its options (7):** big-8x15#3, hebrew-israel#2, one-word, one-word#2, one-word#3, history, science#3. All recovered on retry.
- **`rounds` returned as a string (1):** film-tv#2, which recovered on retry. The same shape also appeared on half-hebrew#3's second attempt.
