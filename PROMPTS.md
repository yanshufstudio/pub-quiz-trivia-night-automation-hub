# Build Playbook — Pub Quiz / Trivia Night Automation Hub

A prompt-by-prompt plan for building this project, split by phase, with a
recommendation for which AI tool is the better fit for each task.

## Tool heuristic

- **Claude Code**: cross-file/backend work, DB schema, API integration,
  agentic multi-step tasks, running & fixing tests/builds, anything where
  correctness across many files matters more than eyeballing pixels.
- **Cursor**: tight, visual, single-file iteration where you want to watch
  the UI change live and nudge it by hand — CSS/Tailwind tweaks, mobile
  layout polish, "make this feel right" work.

Stack locked in: Next.js (TypeScript, App Router, Tailwind), Prisma +
SQLite, Anthropic (Claude) API for question generation, simple polling
for the live team portal, browser printing for the sheets.

---

## 1. Planning

| Prompt | Tool | Why |
|---|---|---|
| Design the Prisma schema for quiz packs, rounds, questions, sessions, teams, and answers, with scoring support | Claude Code | Cross-cutting data model, needs whole-repo context |
| Define the exact JSON schema the AI wizard must return for a generated quiz pack, and a zod validator for it | Claude Code | Schema design feeds directly into typed backend code |
| Sketch the session state machine (LOBBY → QUESTION_ACTIVE → REVEAL → ENDED) and what triggers each transition | Claude Code | Logic/architecture reasoning, not visual |
| Wireframe the presenter script and answer-sheet print layout | Cursor | Layout/typography is easier to judge by looking at rendered output as you iterate |
| Decide scoring & tie-break rules (exact match vs host judgement, partial credit) | Claude Code | Product logic decision, affects DB + API design |
| Pick a deployment target (Vercel + Turso/hosted SQLite vs self-hosted) | Claude Code | Infra decision tied to the Prisma setup |

## 2. Implementation

| Prompt | Tool | Why |
|---|---|---|
| Run `npx prisma migrate dev` and generate the client, wire up a Prisma singleton in `src/lib/db.ts` | Claude Code | Shell + codegen, agentic |
| Build `POST /api/packs/generate`: call the Claude API with the wizard prompt, validate the JSON response with zod, persist to Prisma | Claude Code | Backend integration, error handling, multi-file |
| Build the pack editor page — list rounds/questions, inline edit text/answer/points | Cursor | Form-heavy UI you'll want to see and adjust live |
| Build Print preview: presenter script and question/answer sheets, printed from the browser | Claude Code | Data shaping + print CSS, checked under print emulation |
| Build the host dashboard: create session, advance question, view live submissions | Split | Claude Code for the API/state logic, then Cursor for a visual polish pass |
| Build the team join + answer-submission portal, mobile-first | Cursor | Mobile responsive feel is best judged live in-editor/browser |
| Implement polling: team portal polls session state every 3s, host dashboard polls submissions | Claude Code | Networking/data-flow logic |
| Add simple team auth: token issued on join, stored client-side, sent with each answer | Claude Code | Security-relevant, cross-file (API + client) |

## 3. Validation

| Prompt | Tool | Why |
|---|---|---|
| Typecheck and lint the whole repo, fix all errors | Claude Code | Repo-wide, agentic fix loop |
| Stress-test the wizard's zod schema against malformed/truncated AI responses and add retry/repair logic | Claude Code | Backend robustness |
| Review a batch of AI-generated quiz packs for duplicate/low-quality questions and tune the generation prompt | Claude Code | Needs to read generated content + edit the prompt template |
| Check the team portal's touch targets, contrast, and layout on a real phone-sized viewport | Cursor (or a browser-driving Claude Code session) | Visual/interactive check |
| Verify the printed sheets render correctly (page breaks, long questions, special characters) | Claude Code | Can emulate print media and check directly |

## 4. Testing

| Prompt | Tool | Why |
|---|---|---|
| Write unit tests for scoring logic (exact match normalization, points awarded) | Claude Code | Pure logic, fast agentic loop |
| Write integration tests for the pack-generation and session API routes | Claude Code | Multi-file, needs DB fixtures |
| Write a Playwright E2E test: host creates session → team joins → submits answer → host reveals → score updates | Claude Code | Long agentic task, can run and self-correct against real output |
| Load-test polling with 20 simulated teams hitting the session endpoint | Claude Code | Scripted, non-visual |
| Do a manual click-through demo as both host and a team, on desktop and mobile | Cursor, or a browser-driving Claude Code session | Best done watching the actual UI |
