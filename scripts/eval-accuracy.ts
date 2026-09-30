/**
 * ACC5 — the accuracy harness: generator versus checker, measured.
 *
 * Calls the real generation (src/lib/generate-pack.ts) and the real review
 * (src/lib/review-pack.ts) directly: no database, no allowance, no ceiling,
 * nothing touched in production. For each brief and each generator
 * configuration it generates one pack, then runs every checker configuration
 * over that same pack, so checkers are compared on identical questions.
 *
 * Writes to eval-results/<timestamp>/ (git-ignored):
 *   runs/<generator>__<brief>.json   one file per generation: config, brief,
 *                                     questions before review, each checker's
 *                                     verdicts, blind answers and questions
 *                                     after, tokens (in/out/thinking), timings
 *   factcheck.csv                    every question, one row each, with every
 *                                     checker's verdict, and blank columns for
 *                                     the person fact-checking against the web
 *   summary.md                       cost, time, fixes and drops per config
 *
 * Usage (from the repository root):
 *   npm run eval:accuracy -- --dry-run          plan and cost estimate, no API calls
 *   npm run eval:accuracy                       the full run (stops at --budget)
 *   npm run eval:accuracy -- --generators G1b --checkers C1 --briefs 90s-pop
 *   npm run eval:accuracy -- --generators G3,G4 --checkers C2 --briefs short-6 --repeat 10
 *
 * Needs ANTHROPIC_API_KEY in the environment or in .env.local. Use a key of
 * its own with a spend limit, not the production key.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generateQuizPack, type GeneratorConfig } from "@/lib/generate-pack";
import { reviewPack, questionId, type ReviewerConfig, type ReviewOutcome } from "@/lib/review-pack";
import type { CallUsage } from "@/lib/model-call";
import type { GeneratedPack } from "@/lib/quiz-schema";

const ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------- briefs

type Brief = { id: string; prompt: string; questions: number };

const BRIEFS: Brief[] = [
  { id: "90s-pop", prompt: "1 round of 5 questions on 1990s pop music", questions: 5 },
  { id: "music", prompt: "3 rounds of 8 questions on music: 60s and 70s rock, classical composers, and one-hit wonders. Adults in a pub, medium difficulty.", questions: 24 },
  { id: "geography", prompt: "2 rounds of 10 questions on world geography: capitals and rivers, then mountains and islands. Medium difficulty.", questions: 20 },
  { id: "history", prompt: "3 rounds of 8 questions on history: ancient Rome, the Second World War, and famous inventors. Adults, medium to hard.", questions: 24 },
  { id: "science", prompt: "2 rounds of 10 questions on science: space and astronomy, then the human body. General audience.", questions: 20 },
  { id: "film-tv", prompt: "2 rounds of 8 questions on film and TV: Oscar winners, then 1990s and 2000s sitcoms.", questions: 16 },
  { id: "sport", prompt: "2 rounds of 8 questions on sport: football World Cups, then the Olympic Games.", questions: 16 },
  { id: "hebrew", prompt: "3 rounds of 8 questions in Hebrew: Israeli history, Israeli pop music, and food.", questions: 24 },
  { id: "kids", prompt: "1 round of 10 easy questions about animals for a family quiz night with children aged 8–12.", questions: 10 },
  { id: "large", prompt: "5 rounds of 10 questions for adults in a pub, medium difficulty: 80s music, world geography, famous film quotes, science, general knowledge.", questions: 50 },
  // ACC6: the brief production's generator failed 2 of 3 times on the #40 sandbox walk.
  { id: "short-6", prompt: "A short pub quiz: 2 rounds of 3 questions each. Round 1: 90s pop music. Round 2: UK geography. Keep answers short.", questions: 6 },
];

// ---------------------------------------------------------------- configs

/** Production's generator until ACC9, pinned here so G1/G1b keep measuring it. */
const SONNET_FORCED: GeneratorConfig = { model: "claude-sonnet-5", thinking: "default", toolMode: "forced" };

/**
 * G1 is what produced the 28 Sep pack: Sonnet 5 with forced tool choice,
 * before ACC1's prompt change. G1b is the same with ACC1. G2 asks Sonnet 5 to
 * think harder (with forced tool choice it did not think at all). G3 is Opus
 * 5.5 at low effort, which needs auto tool choice; since ACC9 it is
 * production's generator, and C2 production's checker.
 */
const GENERATORS: Record<string, GeneratorConfig> = {
  G1: { ...SONNET_FORCED, promptRules: "before-acc1" },
  G1b: { ...SONNET_FORCED },
  G2: { model: "claude-sonnet-5", thinking: "adaptive", effort: "xhigh", toolMode: "forced" },
  G3: { model: "claude-opus-5-5", thinking: "default", effort: "low", toolMode: "auto-strict" },
  /**
   * ACC6: Sonnet 5.5 at medium effort as the writer. Like Opus 5.5 it rejects
   * forced tool choice with a 400, so auto-strict (tool_choice auto, strict
   * tool schema) is the only tool mode it supports; thinking is left at its
   * default (adaptive).
   */
  G4: { model: "claude-sonnet-5-5", thinking: "default", effort: "medium", toolMode: "auto-strict" },
};

const CHECKERS: Record<string, ReviewerConfig> = {
  C1: { model: "claude-sonnet-5", thinking: "default", toolMode: "forced", mode: "blind" },
  C2: { model: "claude-opus-5-5", thinking: "default", effort: "low", toolMode: "auto-strict", mode: "blind" },
  // The same checker as C1, not blind: what one call that sees our answers catches.
  C1s: { model: "claude-sonnet-5", thinking: "default", toolMode: "forced", mode: "single" },
};

/** Which checkers run on which generator's output by default. */
const DEFAULT_PLAN: Record<string, string[]> = {
  G1: ["C1", "C2", "C1s"],
  G1b: ["C1", "C2"],
  G2: ["C1", "C2"],
  G3: ["C1", "C2"],
  G4: ["C2"],
};

// ---------------------------------------------------------------- prices

/**
 * USD per million tokens, from Anthropic's pricing page (28 Sep 2026). Thinking
 * is billed as output. Cache rates are recorded where published, but cost()
 * uses input and output only: the generator and checker calls do not use prompt
 * caching, and CallUsage carries no cache token counts.
 */
const PRICES: Record<string, { input: number; output: number; cacheRead?: number; cacheWrite?: number }> = {
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  // ACC6: anthropic.com/claude-sonnet-5-5.
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};

function cost(usage: CallUsage[]): number {
  return usage.reduce((total, u) => {
    const price = PRICES[u.model];
    if (!price) throw new Error(`No price for ${u.model}`);
    return total + (u.inputTokens * price.input + u.outputTokens * price.output) / 1e6;
  }, 0);
}

/**
 * Deliberately pessimistic per-question token guesses for the dry run. The
 * real run reports what was actually spent and stops at the budget either way.
 */
function estimate(generator: GeneratorConfig, checkers: ReviewerConfig[], questions: number): number {
  const heavyThinking = generator.effort === "xhigh" ? 2.5 : 1;
  const gen: CallUsage = {
    model: generator.model,
    inputTokens: 1200,
    outputTokens: Math.round(questions * (70 + 110 * heavyThinking)),
    thinkingTokens: null,
    durationMs: 0,
  };
  const reviews = checkers.map((c): CallUsage => ({
    model: c.model,
    // Blind: the questions once, then roughly a third again for flagged ones.
    inputTokens: 900 + questions * (c.mode === "blind" ? 110 : 90),
    outputTokens: questions * (c.mode === "blind" ? 190 : 150),
    thinkingTokens: null,
    durationMs: 0,
  }));
  return cost([gen, ...reviews]);
}

// ---------------------------------------------------------------- CLI

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const DRY_RUN = process.argv.includes("--dry-run");
const BUDGET = Number(arg("budget") ?? 10);
/** ACC6: generate each selected brief this many times; runs after the first are "<brief>#<n>". */
const REPEAT = Number(arg("repeat") ?? 1);

function selected<T>(all: Record<string, T> | T[], list: string | undefined, key: (t: T) => string = (t) => String(t)) {
  const entries = Array.isArray(all) ? all.map((t) => [key(t), t] as const) : Object.entries(all);
  if (!list) return entries;
  const wanted = list.split(",").map((s) => s.trim());
  const unknown = wanted.filter((w) => !entries.some(([k]) => k === w));
  if (unknown.length) throw new Error(`Unknown: ${unknown.join(", ")}`);
  return entries.filter(([k]) => wanted.includes(k));
}

function loadKey() {
  if (process.env.ANTHROPIC_API_KEY) return;
  const file = path.join(ROOT, ".env.local");
  if (!existsSync(file)) return;
  const line = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((l) => /^\s*ANTHROPIC_API_KEY\s*=/.test(l));
  if (line) process.env.ANTHROPIC_API_KEY = line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
}

// ---------------------------------------------------------------- run

type CheckerResult =
  | { checker: string; config: ReviewerConfig; outcome: ReviewOutcome; costUsd: number; ms: number }
  | { checker: string; config: ReviewerConfig; failed: string; costUsd: number; ms: number };

function questionsOf(pack: GeneratedPack) {
  return pack.rounds.flatMap((round, r) =>
    round.questions.map((q, i) => ({
      id: questionId(r, i),
      round: round.title,
      category: round.category,
      type: q.type,
      text: q.text,
      answer: q.answer,
      ...(q.options ? { options: q.options } : {}),
    }))
  );
}

function csvCell(value: unknown): string {
  const s = value === undefined || value === null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  if (!Number.isInteger(REPEAT) || REPEAT < 1) throw new Error(`--repeat must be a whole number of at least 1`);
  const briefs = selected(BRIEFS, arg("briefs"), (b) => b.id).flatMap(([, b]) =>
    Array.from({ length: REPEAT }, (_, i) => ({ ...b, run: i === 0 ? b.id : `${b.id}#${i + 1}` }))
  );
  const generators = selected(GENERATORS, arg("generators"));
  const checkerFilter = arg("checkers")?.split(",").map((s) => s.trim());

  const plan = generators.map(([gid, g]) => {
    const cids = (DEFAULT_PLAN[gid] ?? Object.keys(CHECKERS)).filter((c) => !checkerFilter || checkerFilter.includes(c));
    for (const c of checkerFilter ?? []) if (!CHECKERS[c]) throw new Error(`Unknown checker ${c}`);
    return { gid, g, cids };
  });

  let estimated = 0;
  console.log(`Plan: ${briefs.length} briefs (${briefs.reduce((n, b) => n + b.questions, 0)} questions asked for)`);
  for (const { gid, g, cids } of plan) {
    const e = briefs.reduce((sum, b) => sum + estimate(g, cids.map((c) => CHECKERS[c]), b.questions), 0);
    estimated += e;
    console.log(`  ${gid} (${g.model}, effort ${g.effort ?? "default"}, ${g.toolMode}) + checkers ${cids.join(", ") || "none"}: ~$${e.toFixed(2)}`);
  }
  console.log(`Estimated total: ~$${estimated.toFixed(2)} (pessimistic). Hard stop at $${BUDGET.toFixed(2)} of measured spend.`);
  if (DRY_RUN) return;

  loadKey();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set (environment or .env.local).");
    process.exit(1);
  }

  const outDir = path.join(ROOT, "eval-results", new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(path.join(outDir, "runs"), { recursive: true });
  let spent = 0;
  const csv: string[] = [
    ["generator", "brief", "id", "round", "type", "question", "answer", "options",
      ...Object.keys(CHECKERS).flatMap((c) => [`${c}_verdict`, `${c}_reason`, `${c}_new_text`, `${c}_new_answer`, `${c}_blind_answer`]),
      "FACTCHECK_question_wording_ok", "FACTCHECK_answer_ok", "FACTCHECK_notes"].join(","),
  ];
  const summary: string[] = [];

  outer: for (const { gid, g, cids } of plan) {
    for (const brief of briefs) {
      if (spent >= BUDGET) {
        console.log(`Budget of $${BUDGET} reached ($${spent.toFixed(2)} spent); stopping.`);
        break outer;
      }
      process.stdout.write(`${gid} × ${brief.run}: generating… `);
      const genStart = Date.now();
      // ACC6: generateQuizPack warns when ACC8 retries a short or malformed
      // first attempt; keep that text so the report can say what the retry was for.
      const retryWarnings: string[] = [];
      const warn = console.warn;
      console.warn = (...args: unknown[]) => {
        retryWarnings.push(args.map(String).join(" "));
      };
      let generated;
      try {
        generated = await generateQuizPack(brief.prompt, g);
      } catch (err) {
        const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        // ACC6: a failed generation was paid for too (ACC13 puts usage on the error).
        const e = err as { usage?: CallUsage; attempts?: number; truncated?: boolean };
        const failCost = e.usage ? cost([e.usage]) : 0;
        spent += failCost;
        console.log(`failed (${message}), $${failCost.toFixed(3)}, attempts ${e.attempts ?? "?"}`);
        writeFileSync(
          path.join(outDir, "runs", `${gid}__${brief.run}.json`),
          JSON.stringify(
            {
              generator: gid,
              config: g,
              brief,
              failed: message,
              errorName: err instanceof Error ? err.name : null,
              truncated: e.truncated ?? null,
              attempts: e.attempts ?? null,
              retryWarnings,
              usage: e.usage ?? null,
              costUsd: failCost,
              ms: Date.now() - genStart,
            },
            null,
            2
          )
        );
        summary.push(`| ${gid} | ${brief.run} | generation failed (attempts ${e.attempts ?? "?"}): ${message.replace(/\|/g, "/")} | | $${failCost.toFixed(3)} | ${((Date.now() - genStart) / 1000).toFixed(1)}s | |`);
        continue;
      } finally {
        console.warn = warn;
      }
      const genMs = Date.now() - genStart;
      const genCost = cost([generated.usage]);
      spent += genCost;
      const before = questionsOf(generated.pack);
      console.log(`${before.length} questions, $${genCost.toFixed(3)}, ${(genMs / 1000).toFixed(1)}s, thinking ${generated.usage.thinkingTokens ?? "?"} tok, attempts ${generated.attempts}`);

      const results: CheckerResult[] = [];
      for (const cid of cids) {
        const config = CHECKERS[cid];
        process.stdout.write(`    ${cid}: reviewing… `);
        const start = Date.now();
        try {
          const outcome = await reviewPack(generated.pack, config);
          const c = cost(outcome.usage);
          spent += c;
          results.push({ checker: cid, config, outcome, costUsd: c, ms: Date.now() - start });
          console.log(`${outcome.fixed.length} fixed, ${outcome.dropped.length} dropped, ${outcome.unreviewed.length} unreviewed, $${c.toFixed(3)}, ${((Date.now() - start) / 1000).toFixed(1)}s`);
        } catch (err) {
          const usage = (err as { usage?: CallUsage[] }).usage ?? [];
          const c = usage.length ? cost(usage) : 0;
          spent += c;
          const message = err instanceof Error ? `${err.name}${"kind" in err ? `(${String((err as { kind: string }).kind)})` : ""}: ${err.message}` : String(err);
          results.push({ checker: cid, config, failed: message, costUsd: c, ms: Date.now() - start });
          console.log(`failed (${message})`);
        }
      }

      writeFileSync(
        path.join(outDir, "runs", `${gid}__${brief.run}.json`),
        JSON.stringify(
          {
            generator: gid,
            config: g,
            brief,
            generation: {
              truncated: generated.truncated,
              droppedQuestions: generated.droppedQuestions,
              droppedRounds: generated.droppedRounds,
              attempts: generated.attempts,
              surplusQuestions: generated.surplusQuestions,
              retryWarnings,
              usage: generated.usage,
              costUsd: genCost,
              ms: genMs,
            },
            before,
            reviews: results.map((r) =>
              "outcome" in r
                ? {
                    checker: r.checker,
                    config: r.config,
                    costUsd: r.costUsd,
                    ms: r.ms,
                    usage: r.outcome.usage,
                    complete: r.outcome.complete,
                    verdicts: r.outcome.verdicts,
                    blindAnswers: r.outcome.blindAnswers,
                    fixed: r.outcome.fixed,
                    dropped: r.outcome.dropped,
                    unreviewed: r.outcome.unreviewed,
                    after: questionsOf(r.outcome.pack),
                  }
                : { checker: r.checker, config: r.config, costUsd: r.costUsd, ms: r.ms, failed: r.failed }
            ),
          },
          null,
          2
        )
      );

      for (const q of before) {
        const cols = Object.keys(CHECKERS).flatMap((cid) => {
          const r = results.find((x) => x.checker === cid);
          if (!r) return ["", "", "", "", ""];
          if (!("outcome" in r)) return ["review failed", r.failed, "", "", ""];
          const v = r.outcome.verdicts.find((x) => x.id === q.id);
          return [v?.verdict ?? "none", v?.reason ?? "", v?.text ?? "", v?.answer ?? "", r.outcome.blindAnswers[q.id]?.answer ?? ""];
        });
        csv.push([gid, brief.run,q.id, q.round, q.type, q.text, q.answer, (q.options ?? []).join(" | "), ...cols, "", "", ""].map(csvCell).join(","));
      }

      summary.push(
        `| ${gid} | ${brief.run} | ${before.length}${generated.attempts > 1 ? ` (attempt ${generated.attempts})` : ""} |${generated.usage.inputTokens}/${generated.usage.outputTokens}/${generated.usage.thinkingTokens ?? "?"} | $${genCost.toFixed(3)} | ${(genMs / 1000).toFixed(1)}s | ` +
          results
            .map((r) =>
              "outcome" in r
                ? `${r.checker}: ${r.outcome.fixed.length} fix, ${r.outcome.dropped.length} drop, $${r.costUsd.toFixed(3)}, ${(r.ms / 1000).toFixed(1)}s, ${r.outcome.usage.reduce((n, u) => n + (u.thinkingTokens ?? 0), 0)} think`
                : `${r.checker}: failed`
            )
            .join("; ") +
          " |"
      );
      writeFileSync(path.join(outDir, "factcheck.csv"), csv.join("\n") + "\n");
      writeFileSync(
        path.join(outDir, "summary.md"),
        [
          `# Accuracy run ${path.basename(outDir)}`,
          "",
          `Spent: $${spent.toFixed(2)} (budget $${BUDGET}).`,
          "",
          "| generator | brief | questions | gen tokens in/out/thinking | gen cost | gen time | reviews |",
          "|---|---|---|---|---|---|---|",
          ...summary,
          "",
        ].join("\n")
      );
    }
  }

  console.log(`\nDone. Spent $${spent.toFixed(2)}. Results in ${path.relative(ROOT, outDir)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
