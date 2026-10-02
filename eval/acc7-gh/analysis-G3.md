## G3

- runs: 69; packs returned: 64; failed: 5 (ModelDeclinedError 3, IncompletePackError 2)
- ACC8 retries used: 17 (big-8x15#3 → ok, fun-quiz#3 → failed, half-hebrew#2 → ok, half-hebrew#3 → failed, half-hebrew → ok, hebrew-israel#2 → ok, one-word#2 → ok, one-word#3 → ok, one-word → ok, film-tv#2 → ok, film-tv#3 → ok, history → ok, music → ok, science#2 → ok, science#3 → ok, short-6#2 → ok, short-6 → ok)
- spent: $6.349
- cost per pack incl. C2: avg $0.092, p90 $0.149, max $0.467
- time per pack incl. C2: avg 34.6s, p90 51.5s, max 167.4s
- generation time only: avg 18.7s, p90 31.3s, max 111.2s
- C2: 42 fixed, 0 dropped, 0 unreviewed, over 1598 questions; review failures 0

### Failures

- **decline#2** (ModelDeclinedError, attempts 1, $0.007, 1.8s): ModelDeclinedError: The question generator declined this brief
- **decline#3** (ModelDeclinedError, attempts 1, $0.007, 5.2s): ModelDeclinedError: The question generator declined this brief
- **decline** (ModelDeclinedError, attempts 1, $0.007, 7.8s): ModelDeclinedError: The question generator declined this brief
- **fun-quiz#3** (IncompletePackError, attempts 2, $0.024, 9.8s): IncompletePackError: short pack: 1 of 32 questions, rounds [1] of [8,8,8,8]
  - warning: Quiz pack attempt 1 unusable (short pack: 1 of 32 questions, rounds [1] of [8,8,8,8]); trying once more.
- **half-hebrew#3** (IncompletePackError, attempts 2, $0.044, 21.1s): IncompletePackError: Generated quiz pack failed validation: [
  {
    "expected": "array",
    "code": "invalid_type",
    "path": [
      "rounds"
    ],
    "message": "Invalid input: expected array, received string"
  }
]
  - warning: Quiz pack attempt 1 unusable (short pack: 1 of 12 questions, rounds [1] of [6,6]); trying once more.

### Short, damaged or retried packs

- big-8x15#3: attempt 2 (Quiz pack attempt 1 unusable (a multiple-choice answer is not one of its options); trying once more.)
- fun-quiz#2: (no count in brief) rounds [8,8,8,8]
- fun-quiz: (no count in brief) rounds [6,6,6,6]
- half-hebrew#2: attempt 2 (Quiz pack attempt 1 unusable (short pack: 1 of 12 questions, rounds [1] of [6,6]); trying once more.)
- half-hebrew: attempt 2 (Quiz pack attempt 1 unusable (short pack: 1 of 12 questions, rounds [1] of [6,6]); trying once more.)
- hebrew-israel#2: attempt 2 (Quiz pack attempt 1 unusable (a multiple-choice answer is not one of its options); trying once more.)
- one-word#2: attempt 2 (Quiz pack attempt 1 unusable (a multiple-choice answer is not one of its options); trying once more.); (no count in brief) rounds [8,8,8,8]
- one-word#3: attempt 2 (Quiz pack attempt 1 unusable (a multiple-choice answer is not one of its options); trying once more.); (no count in brief) rounds [8,8,8,8]
- one-word: attempt 2 (Quiz pack attempt 1 unusable (a multiple-choice answer is not one of its options); trying once more.); (no count in brief) rounds [8,8,8,8]
- picture-music#2: (no count in brief) rounds [10,10]
- picture-music#3: (no count in brief) rounds [10,10]
- picture-music: (no count in brief) rounds [10,10]
- film-tv#2: attempt 2 (Quiz pack attempt 1 unusable (Generated quiz pack failed validation: [
  {
    "expected": "array",
    "code": "invalid_type",
    "path": [
      "rounds"
    ],
    "message": "Invalid input: expected array, received string"
  }
]); trying once more.)
- film-tv#3: attempt 2 (Quiz pack attempt 1 unusable (short pack: 1 of 16 questions, rounds [1] of [8,8]); trying once more.)
- history: attempt 2 (Quiz pack attempt 1 unusable (a multiple-choice answer is not one of its options); trying once more.)
- music: attempt 2 (Quiz pack attempt 1 unusable (short pack: 1 of 24 questions, rounds [1] of [8,8,8]); trying once more.)
- science#2: attempt 2 (Quiz pack attempt 1 unusable (short pack: 2 of 20 questions, rounds [2] of [10,10]); trying once more.)
- science#3: attempt 2 (Quiz pack attempt 1 unusable (a multiple-choice answer is not one of its options); trying once more.)
- short-6#2: attempt 2 (Quiz pack attempt 1 unusable (short pack: 2 of 6 questions, rounds [2] of [3,3]); trying once more.)
- short-6: attempt 2 (Quiz pack attempt 1 unusable (short pack: 1 of 6 questions, rounds [1] of [3,3]); trying once more.)

### Placeholder answers

None found by the pattern check (see the script for the pattern).

### Duplicate questions within a pack

- big-8x15#2 R1Q1/R4Q4: "How many sides does a hexagon have?" (Six) ~ "How many legs does an insect have?" (Six)

### Repeats across runs of the same brief

| brief | packs | questions | repeated in another run of the brief | share |
|---|---|---|---|---|
| all-mc | 3 | 120 | 81 | 68% |
| big-8x15 | 3 | 360 | 153 | 43% |
| cats-1x1 | 3 | 3 | 2 | 67% |
| fun-quiz | 2 | 56 | 20 | 36% |
| half-hebrew | 2 | 24 | 18 | 75% |
| hebrew-israel | 3 | 45 | 29 | 64% |
| kids-no-pop | 3 | 54 | 41 | 76% |
| one-word | 3 | 96 | 49 | 51% |
| picture-music | 3 | 60 | 30 | 50% |
| quantum | 3 | 60 | 15 | 25% |
| uneven | 3 | 75 | 50 | 67% |
| 90s-pop | 3 | 15 | 10 | 67% |
| film-tv | 3 | 48 | 28 | 58% |
| geography | 3 | 60 | 33 | 55% |
| hebrew | 3 | 72 | 30 | 42% |
| history | 3 | 72 | 43 | 60% |
| kids | 3 | 30 | 20 | 67% |
| large | 3 | 150 | 97 | 65% |
| music | 3 | 72 | 40 | 56% |
| science | 3 | 60 | 40 | 67% |
| short-6 | 3 | 18 | 14 | 78% |
| sport | 3 | 48 | 37 | 77% |

