# Accuracy run 2026-09-30T18-09-46-967Z

Spent: $2.16 (budget $4).

| generator | brief | questions | gen tokens in/out/thinking | gen cost | gen time | reviews |
|---|---|---|---|---|---|---|
| G5 | music | generation failed (attempts 2): IncompletePackError: short pack: 1 of 24 questions, rounds [1] of [8,8,8] | | $0.086 | 45.9s | |
| G5 | music#2 | generation failed (attempts 1): UnusableModelOutputError: Generated quiz pack failed validation: [
  {
    "expected": "array",
    "code": "invalid_type",
    "path": [
      "rounds"
    ],
    "message": "Invalid input: expected array, received string"
  }
] | | $0.084 | 38.8s | |
| G5 | music#3 | 24 |1826/3157/1386 | $0.070 | 30.6s | C2: 0 fix, 0 drop, $0.041, 11.7s, 247 think |
| G5 | hebrew | generation failed (attempts 2): IncompletePackError: short pack: 23 of 24 questions, rounds [7,8,8] of [8,8,8] | | $0.179 | 105.9s | |
| G5 | hebrew#2 | generation failed (attempts 2): IncompletePackError: short pack: 3 of 24 questions, rounds [3] of [8,8,8] | | $0.140 | 84.8s | |
| G5 | hebrew#3 | generation failed (attempts 2): IncompletePackError: a multiple-choice answer is not one of its options | | $0.121 | 80.7s | |
| G5 | kids | 10 |1803/607/0 | $0.019 | 10.2s | C2: 0 fix, 0 drop, $0.030, 11.3s, 106 think |
| G5 | kids#2 | 10 (attempt 2) |3606/858/0 | $0.032 | 13.8s | C2: 0 fix, 0 drop, $0.025, 9.5s, 108 think |
| G5 | kids#3 | 10 (attempt 2) |3606/934/0 | $0.033 | 15.0s | C2: 0 fix, 0 drop, $0.027, 10.5s, 0 think |
| G5 | short-6 | 6 |1824/965/422 | $0.027 | 10.0s | C2: 0 fix, 0 drop, $0.022, 10.4s, 0 think |
| G5 | short-6#2 | 6 |1824/1012/450 | $0.028 | 9.9s | C2: 0 fix, 0 drop, $0.014, 4.1s, 75 think |
| G5 | short-6#3 | 6 |1824/955/407 | $0.026 | 9.9s | C2: 0 fix, 0 drop, $0.012, 4.3s, 0 think |
| G5 | one-word | generation failed (attempts 1): UnusableModelOutputError: Generated quiz pack failed validation: [
  {
    "expected": "array",
    "code": "invalid_type",
    "path": [
      "rounds"
    ],
    "message": "Invalid input: expected array, received string"
  }
] | | $0.030 | 14.8s | |
| G5 | one-word#2 | generation failed (attempts 2): IncompletePackError: short pack: 1 of 32 questions, rounds [1] of [8,8,8,8] | | $0.094 | 42.8s | |
| G5 | one-word#3 | generation failed (attempts 2): IncompletePackError: short pack: 1 of 32 questions, rounds [1] of [8,8,8,8] | | $0.064 | 33.1s | |
| G5 | all-mc | 40 |1789/4484/1181 | $0.097 | 39.2s | C2: 0 fix, 0 drop, $0.057, 14.5s, 0 think |
| G5 | all-mc#2 | 40 |1789/4807/1420 | $0.103 | 43.1s | C2: 0 fix, 0 drop, $0.058, 24.3s, 0 think |
| G5 | all-mc#3 | 40 |1789/5624/2123 | $0.120 | 49.3s | C2: 0 fix, 0 drop, $0.061, 17.6s, 122 think |
| G5 | hebrew-israel | generation failed (attempts 2): IncompletePackError: short pack: 1 of 15 questions, rounds [1] of [5,5,5] | | $0.058 | 33.1s | |
| G5 | hebrew-israel#2 | 15 |1801/2797/1516 | $0.063 | 41.2s | C2: 0 fix, 0 drop, $0.031, 11.3s, 283 think |
| G5 | hebrew-israel#3 | generation failed (attempts 2): IncompletePackError: short pack: 1 of 15 questions, rounds [1] of [5,5,5] | | $0.055 | 28.9s | |
| G5 | quantum | 20 |1799/3382/1792 | $0.075 | 33.9s | C2: 1 fix, 0 drop, $0.058, 19.5s, 411 think |
| G5 | quantum#2 | 20 |1799/2991/1277 | $0.067 | 31.6s | C2: 1 fix, 0 drop, $0.057, 18.2s, 466 think |
