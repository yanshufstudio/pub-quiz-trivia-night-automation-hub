# TriviaFoundry — Improvement Roadmap

Reviewed the codebase in `pub-quiz-trivia-night-automation-hub` (Next.js App Router + Prisma/SQLite + Anthropic tool-use generation + react-pdf + polling live session). Overall it's a strong, well-tested MVP: a race-safe session state machine (conditional `updateMany` transitions), a real host-key/join-code security split, per-IP rate limiting, and unit/integration/e2e/load tests. The gaps below are mostly scope (features not built yet) plus a few things to fix before a real live event.

## Status as of 2026-09-08

Shipped since this review was written (verified on the production deploy):
items 1 (per-question timer), 2 (question types — `TEXT` / `MULTIPLE_CHOICE`),
3 (alternate answers per question), 4 (pack editor can add, delete and
reorder), 5 (Turso + Upstash, env-var driven), plus the QR join code and JSON
export/import from the nice-to-haves. Pack ownership shipped 2026-09-08
afternoon (`src/lib/pack-access.ts`): `/packs` lists shared packs plus the
visitor's own, and every edit route is gated on the `pq_creator` cookie
matching the pack's `creatorId`; ownerless packs are read-only for all.
Everything else below is still open. The original text is left intact
as the record of what the review found.

## Highest-impact next features

1. **Per-question timer.** Currently the host manually decides when to reveal — there's no countdown shown to teams, so there's no time pressure or "big screen" moment. Adding a host-set duration (e.g. 30s) with a synced countdown (derived from a `questionStartedAt` timestamp already implicit in the state transition) and auto-lock on expiry would be the single biggest "trivia night" feel upgrade.
2. **Question types beyond free text.** `quiz-schema.ts` / the Prisma `Question` model only support a text prompt + single answer. The product pitch mentions picture rounds and varied formats; there's no `type` field, no `options[]` for multiple choice, no image URL. Worth adding as an optional field so packs stay backward compatible.
3. **Smarter answer matching.** `src/lib/scoring.ts` does exact match after normalizing (lowercase, strip articles/punctuation). Any legitimate variant spelling ("7" vs "seven", a nickname, a partial name) scores wrong until the host manually overrides. Add an `acceptableAnswers: string[]` per question (comma-separated field in the editor) checked in `isLikelyCorrect`, or a small edit-distance/fuzzy threshold.
4. **Pack editor is edit-only.** `PackEditor.tsx` lets you tweak existing question/answer/points text but can't add or delete a question, reorder/delete a round, or ask the AI to regenerate just one weak question — a single bad question currently means regenerating (or hand-writing) the whole pack.
5. **Deployment mismatch to fix before a real event.** The README recommends Vercel + Turso, but `prisma/schema.prisma` still points at a local SQLite file, and `src/lib/rate-limit.ts` is an in-memory `Map`. Neither survives a real serverless deploy (ephemeral/read-only filesystem, and each invocation can be a cold instance with its own memory) — this needs to move to Turso/libSQL or Postgres, and the rate limiter to a shared store (e.g. Upstash Redis), before hosting it anywhere but a single long-running local process.

## Smaller but concrete gaps

- **PDF pagination risk.** In `src/lib/pdf/documents.tsx`, each round renders inside a `View wrap={false}` block, so a round with many questions or long question text can't split across a page break — worth test-printing a 12–15 question round to confirm it doesn't clip or leave a large blank gap.
- **No team management.** Host can't remove/rename a team mid-session or award a manual bonus/penalty outside the current question's correct/wrong override.
- **Team session storage is single-slot.** `team-session.ts` stores one team globally in localStorage; `host-session.ts` already keys by session code so a browser can host multiple sessions across a night — team storage doesn't have the same per-code convenience.
- **No pack ownership.** `/packs` lists every pack in the database with no per-user scoping — fine solo, worth knowing before sharing the URL.
- **No duplicate-question protection.** `PROMPTS.md` flags reviewing generated packs for repeats as a manual step; nothing automated checks for near-duplicate questions within a pack or across a history of packs.
- **No cleanup/TTL** for old sessions or packs — fine at hobby scale, but they accumulate indefinitely.
- **Reveal latency.** Both host and team views poll every 3s (a deliberate, documented trade-off), so the "big reveal" can lag up to ~3s between host and teams. Server-sent events via a Next.js route handler would tighten that without needing full websocket infra.

## Nice-to-haves

- QR code next to the join-code display so teams scan straight to `/play` instead of typing a URL.
- Sound/visual cue on the team screen at question-start and reveal.
- Round-by-round score breakdown, not just the cumulative scoreboard.
- Export/import a pack as JSON for reuse across deployments or sharing a good pack with someone else.
