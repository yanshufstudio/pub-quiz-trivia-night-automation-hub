# Accuracy run 2026-09-30T17-32-44-122Z

Spent: $3.09 (budget $5).

| generator | brief | questions | gen tokens in/out/thinking | gen cost | gen time | reviews |
|---|---|---|---|---|---|---|
| G3 | one-word | generation failed (attempts 2): IncompletePackError: a multiple-choice answer is not one of its options | | $0.086 | 35.7s | |
| G3 | one-word#2 | 32 (attempt 2) |3552/3066/55 | $0.076 | 30.2s | C2: 0 fix, 0 drop, $0.043, 12.4s, 0 think |
| G3 | one-word#3 | generation failed (attempts 1): UnusableModelOutputError: Generated quiz pack failed validation: [
  {
    "expected": "array",
    "code": "invalid_type",
    "path": [
      "rounds"
    ],
    "message": "Invalid input: expected array, received string"
  }
] | | $0.032 | 19.5s | |
| G3 | fun-quiz | 20 |1783/1180/0 | $0.031 | 10.7s | C2: 0 fix, 0 drop, $0.037, 11.6s, 0 think |
| G3 | fun-quiz#2 | 24 |1783/1296/0 | $0.033 | 12.7s | C2: 0 fix, 0 drop, $0.047, 14.9s, 178 think |
| G3 | fun-quiz#3 | 32 |1783/1946/0 | $0.046 | 16.5s | C2: 2 fix, 0 drop, $0.070, 24.2s, 221 think |
| G3 | cats-1x1 | 1 |1784/255/0 | $0.012 | 5.7s | C2: 0 fix, 0 drop, $0.006, 2.8s, 0 think |
| G3 | cats-1x1#2 | 1 |1784/237/0 | $0.012 | 4.1s | C2: 0 fix, 0 drop, $0.006, 5.0s, 0 think |
| G3 | cats-1x1#3 | 1 |1784/231/0 | $0.012 | 5.1s | C2: 0 fix, 0 drop, $0.006, 3.0s, 0 think |
| G3 | big-8x15 | 120 |1790/5370/77 | $0.115 | 53.7s | C2: 2 fix, 0 drop, $0.194, 65.5s, 683 think |
| G3 | big-8x15#2 | 120 |1790/8138/3333 | $0.170 | 74.5s | C2: 1 fix, 0 drop, $0.173, 54.7s, 584 think |
| G3 | big-8x15#3 | 120 |1790/5011/96 | $0.107 | 46.8s | C2: 2 fix, 0 drop, $0.181, 56.5s, 828 think |
| G3 | uneven | 25 |1791/1450/0 | $0.036 | 14.3s | C2: 2 fix, 0 drop, $0.052, 16.8s, 273 think |
| G3 | uneven#2 | 25 |1791/1515/0 | $0.037 | 14.9s | C2: 2 fix, 0 drop, $0.065, 23.1s, 383 think |
| G3 | uneven#3 | 25 |1791/1447/0 | $0.036 | 14.3s | C2: 0 fix, 0 drop, $0.046, 16.8s, 204 think |
| G3 | all-mc | 40 |1789/3622/1108 | $0.080 | 32.4s | C2: 0 fix, 0 drop, $0.062, 20.6s, 0 think |
| G3 | all-mc#2 | generation failed (attempts 2): IncompletePackError: short pack: 2 of 40 questions, rounds [1,1] of [10,10,10,10] | | $0.029 | 13.7s | |
| G3 | all-mc#3 | 40 (attempt 2) |3578/4671/1135 | $0.108 | 42.9s | C2: 0 fix, 0 drop, $0.057, 14.8s, 0 think |
| G3 | picture-music | 20 |1784/2216/760 | $0.051 | 22.1s | C2: 0 fix, 0 drop, $0.039, 14.7s, 0 think |
| G3 | picture-music#2 | 20 |1784/2132/789 | $0.050 | 20.7s | C2: 1 fix, 0 drop, $0.046, 15.6s, 252 think |
| G3 | picture-music#3 | 20 |1784/1990/708 | $0.047 | 18.8s | C2: 0 fix, 0 drop, $0.036, 16.2s, 0 think |
| G3 | hebrew-israel | generation failed (attempts 1): UnusableModelOutputError: Generated quiz pack failed validation: [
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
] | | $0.012 | 7.7s | |
| G3 | hebrew-israel#2 | 15 |1801/1157/0 | $0.030 | 14.9s | C2: 1 fix, 0 drop, $0.045, 17.1s, 437 think |
| G3 | hebrew-israel#3 | 15 |1801/1182/0 | $0.031 | 18.9s | C2: 0 fix, 0 drop, $0.037, 13.2s, 125 think |
| G3 | half-hebrew | 12 |1793/1422/596 | $0.036 | 14.8s | C2: 0 fix, 0 drop, $0.019, 7.2s, 0 think |
| G3 | half-hebrew#2 | 12 |1793/1332/514 | $0.034 | 13.0s | C2: 0 fix, 0 drop, $0.026, 10.1s, 0 think |
| G3 | half-hebrew#3 | 12 |1793/1343/552 | $0.034 | 13.2s | C2: 1 fix, 0 drop, $0.033, 12.5s, 152 think |
| G3 | kids-no-pop | 18 |1798/1089/0 | $0.029 | 10.1s | C2: 1 fix, 0 drop, $0.044, 19.4s, 240 think |
| G3 | kids-no-pop#2 | 18 |1798/1043/0 | $0.028 | 9.9s | C2: 1 fix, 0 drop, $0.037, 13.5s, 89 think |
| G3 | kids-no-pop#3 | 18 |1798/967/0 | $0.027 | 9.4s | C2: 1 fix, 0 drop, $0.035, 15.2s, 0 think |
| G3 | quantum | 20 |1799/1605/0 | $0.039 | 17.3s | C2: 1 fix, 0 drop, $0.049, 17.5s, 309 think |
| G3 | quantum#2 | 20 |1799/1669/0 | $0.041 | 16.8s | C2: 2 fix, 0 drop, $0.054, 20.0s, 208 think |
