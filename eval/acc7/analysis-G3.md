## G3

- runs: 69; packs returned: 59; failed: 10 (IncompletePackError 4, ModelDeclinedError 3, UnusableModelOutputError 3)
- ACC8 retries used: 8 (all-mc#2 → failed, all-mc#3 → ok, one-word#2 → ok, one-word → failed, hebrew → ok, kids#2 → failed, kids → failed, music#2 → ok)
- spent: $5.588
- cost per pack incl. C2: avg $0.081, p90 $0.142, max $0.343
- time per pack incl. C2: avg 31.6s, p90 57.4s, max 129.1s
- generation time only: avg 17.0s, p90 35.6s, max 74.5s
- C2: 43 fixed, 0 dropped, 0 unreviewed, over 1471 questions; review failures 1
  - review failed large: ReviewFailedError(api_error): 400: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Output blocked by content filtering policy"},"request_id":"req_011Cfa4xopCjghoBwsqcoGU1"}

### Failures

- **all-mc#2** (IncompletePackError, attempts 2, $0.029, 13.7s): IncompletePackError: short pack: 2 of 40 questions, rounds [1,1] of [10,10,10,10]
  - warning: Quiz pack attempt 1 unusable (short pack: 1 of 40 questions, rounds [1] of [10,10,10,10]); trying once more.
- **decline#2** (ModelDeclinedError, attempts 1, $0.007, 2.0s): ModelDeclinedError: API integrators: you can reduce refusals for your users by configuring a fallback model — see https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback
- **decline#3** (ModelDeclinedError, attempts 1, $0.007, 1.8s): ModelDeclinedError: API integrators: you can reduce refusals for your users by configuring a fallback model — see https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback
- **decline** (ModelDeclinedError, attempts 1, $0.007, 1.8s): ModelDeclinedError: API integrators: you can reduce refusals for your users by configuring a fallback model — see https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback
- **hebrew-israel** (UnusableModelOutputError, attempts 1, $0.012, 7.7s): UnusableModelOutputError: Generated quiz pack failed validation: [
  {
    "origin": "string",
    "code": "too_small",
    "minimum": 1,
    "inclusive": true,
    "path": [
      "rounds",
      0,
      "questions",
      0,
      "options",
      0
    ],
    "message": "Too small: expected string to have >=1 characters"
  }
]
- **one-word#3** (UnusableModelOutputError, attempts 1, $0.032, 19.5s): UnusableModelOutputError: Generated quiz pack failed validation: [
  {
    "expected": "array",
    "code": "invalid_type",
    "path": [
      "rounds"
    ],
    "message": "Invalid input: expected array, received string"
  }
]
- **one-word** (IncompletePackError, attempts 2, $0.086, 35.7s): IncompletePackError: a multiple-choice answer is not one of its options
  - warning: Quiz pack attempt 1 unusable (a multiple-choice answer is not one of its options); trying once more.
- **quantum#3** (UnusableModelOutputError, attempts 1, $0.012, 6.3s): UnusableModelOutputError: Generated quiz pack failed validation: [
  {
    "origin": "string",
    "code": "too_small",
    "minimum": 1,
    "inclusive": true,
    "path": [
      "rounds",
      0,
      "questions",
      0,
      "options",
      0
    ],
    "message": "Too small: expected string to have >=1 characters"
  }
]
- **kids#2** (IncompletePackError, attempts 2, $0.025, 11.3s): IncompletePackError: short pack: 1 of 10 questions, rounds [1] of [10]
  - warning: Quiz pack attempt 1 unusable (short pack: 2 of 10 questions, rounds [1,1] of [10]); trying once more.
- **kids** (IncompletePackError, attempts 2, $0.023, 10.0s): IncompletePackError: short pack: 1 of 10 questions, rounds [1] of [10]
  - warning: Quiz pack attempt 1 unusable (short pack: 1 of 10 questions, rounds [1] of [10]); trying once more.

### Short, damaged or retried packs

- all-mc#3: attempt 2 (Quiz pack attempt 1 unusable (short pack: 2 of 40 questions, rounds [1,1] of [10,10,10,10]); trying once more.)
- cats-1x1: salvage dropped 1 q / 0 rounds
- fun-quiz#2: (no count in brief) rounds [6,6,6,6]
- fun-quiz#3: (no count in brief) rounds [8,8,8,8]
- fun-quiz: (no count in brief) rounds [5,5,5,5]
- one-word#2: attempt 2 (Quiz pack attempt 1 unusable (short pack: 23 of 24 questions, rounds [5,6,6,6] of [6,6,6,6]); trying once more.); (no count in brief) rounds [8,8,8,8]
- picture-music#2: (no count in brief) rounds [10,10]
- picture-music#3: (no count in brief) rounds [10,10]
- picture-music: (no count in brief) rounds [10,10]
- hebrew: attempt 2 (Quiz pack attempt 1 unusable (short pack: 1 of 24 questions, rounds [1] of [8,8,8]); trying once more.)
- music#2: attempt 2 (Quiz pack attempt 1 unusable (short pack: 1 of 24 questions, rounds [1] of [8,8,8]); trying once more.)

### Placeholder answers

- picture-music#3 R1Q7: answer "X" — Q: In 2023, Twitter's bird logo was replaced by which letter? | A: X

### Duplicate questions within a pack

None.

### Repeats across runs of the same brief

| brief | packs | questions | repeated in another run of the brief | share |
|---|---|---|---|---|
| all-mc | 2 | 80 | 38 | 48% |
| big-8x15 | 3 | 360 | 167 | 46% |
| cats-1x1 | 3 | 3 | 2 | 67% |
| fun-quiz | 3 | 76 | 33 | 43% |
| half-hebrew | 3 | 36 | 22 | 61% |
| hebrew-israel | 2 | 30 | 16 | 53% |
| kids-no-pop | 3 | 54 | 41 | 76% |
| picture-music | 3 | 60 | 24 | 40% |
| quantum | 2 | 40 | 2 | 5% |
| uneven | 3 | 75 | 45 | 60% |
| 90s-pop | 3 | 15 | 8 | 53% |
| film-tv | 3 | 48 | 28 | 58% |
| geography | 3 | 60 | 39 | 65% |
| hebrew | 3 | 72 | 31 | 43% |
| history | 3 | 72 | 43 | 60% |
| large | 3 | 150 | 94 | 63% |
| music | 3 | 72 | 45 | 63% |
| science | 3 | 60 | 44 | 73% |
| short-6 | 3 | 18 | 15 | 83% |
| sport | 3 | 48 | 28 | 58% |

