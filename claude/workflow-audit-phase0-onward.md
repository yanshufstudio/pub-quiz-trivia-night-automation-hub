# TriviaFoundry vs. the Vibe-Coding MVP Workflow (Phase 0 step 3 → Phase 10)

The app is already built (Next.js/Prisma/SQLite, Anthropic tool-use generation, react-pdf, polling live session — see `improvement-roadmap.md` for the full code review). This audits it against the workflow doc, starting where asked: Phase 0 step 3.

## Phase 0 — Niche validation

**Step 3, confirm demand independently.** The category is real and commercially proven, not speculative. At least eight established, currently-marketed competitors exist across two verticals:
- *Venue/host trivia platforms* (the proven revenue model): SpeedQuizzing (UK, credit/activation pricing, "strong UK footprint"), Kwizzbit (UK, subscription + AWS scale-out infra), Redtooth SmartQuiz ("long-standing UK pub-entertainment brand"), QuizXpress (annual per-device licenses), Quizado (US, active content-marketing engine — blog posts specifically about trivia nights lifting bar revenue), Venue Trivia (US, hardware buzzers + software), and Buzztime — a long-running, previously publicly-traded bar-trivia hardware/software company. CNBC has covered trivia night's effect on bar revenue directly, confirming venues treat this as a real revenue lever, not a novelty.
- *AI quiz-generation tools* (the app's actual feature angle): DailyQuiz.ai markets itself specifically as "AI Quiz Generator for Pub Quizzes," and general AI quiz/flashcard generators (TriviaMaker, Easy-Peasy) exist in the adjacent education space.

No direct acquire.com/Flippa listing for a "pub quiz generator" specifically, but a closely adjacent comp is trading right now: an "AI Study SaaS: gamified quizzes & flashcards" listed on acquire.com at 10K+ paying subscribers, $769K ARR / $1M TTM revenue, asking $1.9M — roughly a 2x revenue / ~2.5x ARR multiple, consistent with the workflow's stated 2-4x range for this size of bootstrapped SaaS.

**Step 4, differentiate rather than clone.** This is where the honest news is mixed. The proven money in this niche is in the venue/host platforms — recurring subscriptions or per-device licenses sold to bars that run trivia every week, often bundled with marketing tools, prize management, or hardware buzzers. The built app is closer to the *other*, less-proven cluster: a single-host, single-night AI content generator. And "AI-generates your quiz pack" is no longer a wedge — DailyQuiz.ai already occupies exactly that positioning. The app's genuine differentiators today are structural, not the AI angle: (1) it does pack generation, PDF export, *and* live team-scoring hosting in one tool, where most competitors split "get content" from "run the show" into separate products or require dedicated hardware/an app download; (2) the team side is just a phone browser hitting a join code, no app install, no buzzer hardware, which undercuts Venue Trivia/Buzztime's hardware-dependent model on cost and setup friction. But right now there's no pricing, no plan, and no venue-recurring angle built — see Phase 7 below — so the differentiation is architectural potential, not yet a monetizable position.

**Step 5, geography.** Good fit: the competitor set already spans the UK (SpeedQuizzing, Kwizzbit, Redtooth, QuizXpress, hashtagquiz.co.uk) and the US (Quizado, Venue Trivia, Buzztime, cheaptrivia.com) with no state-by-state legal regime, licensing body, or US-only payment rail tying the niche to one country. It generalizes the way Phase 0 step 5 wants it to.

## Phase 1 — Stack and schema, against what's actually built

The frontend choice (Next.js App Router + TypeScript + Tailwind) matches the reference stack directly. The database swap — Prisma + local SQLite instead of Supabase/Postgres — is a defensible per-project call for a single-host, single-instance MVP (exactly the kind of stack-fit reasoning Phase 1 step 3 asks for), but it creates a direct conflict with Phase 8's default deploy target: Vercel's filesystem doesn't persist a SQLite file across invocations, so the current schema choice and the workflow's own default host aren't compatible yet. That's not a plan-time failure — it just means "pick a deploy target" (Phase 0 planning item, and Phase 8 step 1) still needs an explicit decision: Turso/libSQL (closest to the current Prisma setup) or Postgres.

Schema minimalism, by contrast, is a genuine strength: six models (QuizPack, Round, Question, Session, Team, Answer), no speculative columns, no premature multi-tenancy scaffolding. This is exactly the discipline Phase 1 step 5 and the "standing constraint" principle ask for.

One concrete miss: the project's own `PROMPTS.md` validation phase explicitly calls for "stress-test the wizard's zod schema against malformed/truncated AI responses and add retry/repair logic" — but `generate-pack.ts` has no retry or repair path. A failed tool-call validation throws immediately and surfaces as a generic 502 to the user. The plan correctly identified this risk; the build didn't close the loop on it.

## Phase 3 — Build practices

Strong compliance. No placeholder code, no stubbed handlers, no truncated files anywhere in the reviewed source — every route handler is thin and single-purpose, and `lib/` is decomposed into small, single-responsibility modules (scoring, scoreboard, session-state, host-auth, rate-limit) rather than one monolithic utils file. That's the "no placeholders, modular, thin handlers" principle applied about as literally as the workflow describes it.

The project's own `PROMPTS.md` is also a near-exact enactment of Phase 3 step 2's "explicit multi-agent task assignment, split by cost/difficulty, with reasoning stated" — it's a full table of tasks mapped to Claude Code vs. Cursor with a stated "why" per row. This project didn't just follow that step, it independently produced the same artifact the workflow asks for.

## Phase 4 — Testing

Exceeds what Phase 4 describes (which is mostly manual browser QA): there's a real unit suite (scoring, scoreboard, session-state), an integration suite that drives actual route handlers against a throwaway SQLite DB through a full session lifecycle, a Playwright e2e test with two real browser contexts (host + team) exercising the full UI flow, and a load-test script simulating 20 polling teams with latency stats — all wired into CI. Given that the core value prop depends on race-safe concurrent state transitions (two teams answering at once, a double-tap on "reveal"), this is arguably better-targeted than the workflow's baseline manual-QA expectation, not just "more tests than needed."

Gap: the `docs/screenshots` captured by `npm run screenshots` are a manual script, not part of CI, so there's no automated regression check on the visual/responsive side that Phase 4 step 2 calls for (resize-and-verify across breakpoints) — that check currently depends on a human running it.

## Phase 7 — Persistence and monetization

Persistence is solid and minimal, as above. Monetization is a full blank: no payment processor, no plan/entitlement model, no webhook, no concept of a paying account at all. Because there's no user-account layer either, there's also no RLS-equivalent scoping — anyone can see any pack via `/packs`, which is fine pre-monetization but is the first thing that has to change if a "recurring venue subscription" model (the model that's actually proven in Phase 0's research) gets built. This is the single largest phase-gap: Phase 0's validation leans on a niche where the proven money is recurring venue subscriptions, but nothing in the current build has an account, a plan, or a payment path yet.

## Phase 8 — Deployment readiness

Not deployed. Concretely blocked on two things surfaced in the earlier code review and reinforced by the Phase 1 mismatch above: the local SQLite file won't survive a Vercel-style ephemeral deploy, and the in-memory rate limiter resets/fragments across serverless instances, which quietly disables the one cost-control on the Anthropic-spending route exactly when a public deploy would need it most. No privacy policy or terms page exists in the route tree yet either — moot until Phase 7 payments exist, but worth having ready before any real traffic regardless.

## Phase 9 — Marketing

Not started, which is expected at this stage — but worth flagging early because Quizado (a direct competitor) already runs an active content-marketing operation (blog posts specifically about trivia's effect on bar revenue) aimed at exactly the venue-owner buyer this niche's proven money comes from. Whatever marketing angle gets picked eventually will be competing against a competitor that's already doing SEO/content work in this exact space.

## Phase 10 — Pre-launch checklist

Several items already pass on inspection: the host-token/team-token model is timing-safe-compared, the host key is never leaked in any team-facing payload, and this is actually exercised by the two-browser e2e test (close in spirit to "test as two different users, not just yourself," even without formal RLS). `ANTHROPIC_API_KEY` is only ever touched server-side. Every mutating route validates its body with zod. What's outstanding: no privacy/terms page, no production Lighthouse/responsiveness pass (nothing is deployed yet to run one against), and the rate-limiter's serverless fragility (Phase 8 finding) is really a Phase 10 checklist failure in waiting — it's a control that looks present in code review but would silently stop working the moment it's needed on a real deploy.

## Net read

Phase 0's validation holds up: this is a real, competitively-proven niche that generalizes across the Anglosphere. The build itself (Phases 1, 3, 4) is unusually disciplined for an MVP — minimal schema, no placeholders, real test coverage, an auditable tool/model split the project wrote for itself before this workflow ever asked for one. The gap is entirely downstream of the build: Phases 7 through 10 (monetization, a deploy target that actually fits the current DB choice, marketing, and the pre-launch checklist) haven't started, and Phase 0's own research suggests the proven revenue shape in this niche — recurring venue subscriptions — is a different product shape than "one host generates one night's pack," which is what's built today. The next real decision isn't more engineering polish; it's picking which side of that line (one-off AI content tool vs. recurring venue platform) this becomes before building out payments.

Sources:
- [Best Pub Quiz Software UK 2026](https://smartpubtools.com/best-digital-pub-quiz-software-2025/)
- [DailyQuiz AI Quiz Generator for Pub Quizzes](https://www.dailyquiz.ai/ai-quiz-generator-for-pub-quizzes)
- [Best Bar Trivia Software 2026 - Quizado comparison](https://quizado.com/compare/best-bar-trivia-software)
- [SpeedQuizzing](https://www.speedquizzing.com/)
- [Trivia night boosts profit for bars, restaurants — CNBC](https://www.cnbc.com/2023/04/07/trivia-night-boosts-profit-for-bars-restaurants.html)
- [Acquire.com listing: AI Study SaaS, gamified quizzes & flashcards, $769K ARR](https://x.com/microacquire/status/2030868182865498365)
- [Kwizzbit](https://kwizzbit.com/pub-quiz/)
