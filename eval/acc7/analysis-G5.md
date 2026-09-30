## G5

- runs: 24; packs returned: 13; failed: 11 (IncompletePackError 9, UnusableModelOutputError 2)
- ACC8 retries used: 11 (hebrew#2 → failed, hebrew#3 → failed, hebrew-israel#3 → failed, hebrew-israel → failed, hebrew → failed, kids#2 → ok, kids#3 → ok, music → failed, one-word#2 → failed, one-word#3 → failed, quantum#3 → failed)
- spent: $2.241
- cost per pack incl. C2: avg $0.093, p90 $0.161, max $0.180
- time per pack incl. C2: avg 43.9s, p90 80.7s, max 105.9s
- generation time only: avg 36.9s, p90 80.7s, max 105.9s
- C2: 2 fixed, 0 dropped, 0 unreviewed, over 247 questions; review failures 0

### Failures

- **hebrew#2** (IncompletePackError, attempts 2, $0.140, 84.8s): IncompletePackError: short pack: 3 of 24 questions, rounds [3] of [8,8,8]
  - warning: Quiz pack attempt 1 unusable (short pack: 23 of 24 questions, rounds [7,8,8] of [8,8,8]); trying once more.
- **hebrew#3** (IncompletePackError, attempts 2, $0.121, 80.7s): IncompletePackError: a multiple-choice answer is not one of its options
  - warning: Quiz pack attempt 1 unusable (short pack: 2 of 24 questions, rounds [1,1] of [8,8,8]); trying once more.
- **hebrew-israel#3** (IncompletePackError, attempts 2, $0.055, 28.9s): IncompletePackError: short pack: 1 of 15 questions, rounds [1] of [5,5,5]
  - warning: Quiz pack attempt 1 unusable (short pack: 1 of 15 questions, rounds [1] of [5,5,5]); trying once more.
- **hebrew-israel** (IncompletePackError, attempts 2, $0.058, 33.1s): IncompletePackError: short pack: 1 of 15 questions, rounds [1] of [5,5,5]
  - warning: Quiz pack attempt 1 unusable (short pack: 1 of 15 questions, rounds [1] of [5,5,5]); trying once more.
- **hebrew** (IncompletePackError, attempts 2, $0.179, 105.9s): IncompletePackError: short pack: 23 of 24 questions, rounds [7,8,8] of [8,8,8]
  - warning: Quiz pack attempt 1 unusable (short pack: 23 of 24 questions, rounds [7,8,8] of [8,8,8]); trying once more.
- **music#2** (UnusableModelOutputError, attempts 1, $0.084, 38.8s): UnusableModelOutputError: Generated quiz pack failed validation: [
  {
    "expected": "array",
    "code": "invalid_type",
    "path": [
      "rounds"
    ],
    "message": "Invalid input: expected array, received string"
  }
]
- **music** (IncompletePackError, attempts 2, $0.086, 45.9s): IncompletePackError: short pack: 1 of 24 questions, rounds [1] of [8,8,8]
  - warning: Quiz pack attempt 1 unusable (short pack: 1 of 24 questions, rounds [1] of [8,8,8]); trying once more.
- **one-word#2** (IncompletePackError, attempts 2, $0.094, 42.8s): IncompletePackError: short pack: 1 of 32 questions, rounds [1] of [8,8,8,8]
  - warning: Quiz pack attempt 1 unusable (short pack: 31 of 32 questions, rounds [7,8,8,8] of [8,8,8,8]); trying once more.
- **one-word#3** (IncompletePackError, attempts 2, $0.064, 33.1s): IncompletePackError: short pack: 1 of 32 questions, rounds [1] of [8,8,8,8]
  - warning: Quiz pack attempt 1 unusable (short pack: 1 of 32 questions, rounds [1] of [8,8,8,8]); trying once more.
- **one-word** (UnusableModelOutputError, attempts 1, $0.030, 14.8s): UnusableModelOutputError: Generated quiz pack failed validation: [
  {
    "expected": "array",
    "code": "invalid_type",
    "path": [
      "rounds"
    ],
    "message": "Invalid input: expected array, received string"
  }
]
- **quantum#3** (IncompletePackError, attempts 2, $0.077, 39.8s): IncompletePackError: short pack: 1 of 20 questions, rounds [1] of [10,10]
  - warning: Quiz pack attempt 1 unusable (short pack: 1 of 20 questions, rounds [1] of [10,10]); trying once more.

### Short, damaged or retried packs

- kids#2: attempt 2 (Quiz pack attempt 1 unusable (short pack: 2 of 10 questions, rounds [2] of [10]); trying once more.)
- kids#3: attempt 2 (Quiz pack attempt 1 unusable (short pack: 3 of 10 questions, rounds [3] of [10]); trying once more.)

### Placeholder answers

None found by the pattern check (see the script for the pattern).

### Duplicate questions within a pack

None.

### Repeats across runs of the same brief

| brief | packs | questions | repeated in another run of the brief | share |
|---|---|---|---|---|
| all-mc | 3 | 120 | 56 | 47% |
| kids | 3 | 30 | 24 | 80% |
| quantum | 2 | 40 | 6 | 15% |
| short-6 | 3 | 18 | 13 | 72% |

